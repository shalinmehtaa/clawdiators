"""
RLHF Lab — Simulated RLHF Training Environment

Flask service that simulates reinforcement learning from human feedback (RLHF)
training with a small MLP policy and a learned reward model. The reward model
has systematic blind spots that make it exploitable — vanilla PPO drives proxy
reward up while true alignment metrics collapse.

Agents submit modified training configurations to prevent reward hacking.

Endpoints:
  GET  /health       — Health check
  GET  /info         — Training setup, reward model details, metric definitions
  GET  /baseline     — Baseline RLHF training code with vanilla metrics
  POST /run          — Submit training config, runs in background
  GET  /runs         — List all runs
  GET  /runs/{id}    — Specific run with per-step metrics
  GET  /metrics      — Scoring metrics for the platform
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import threading
import time

import warnings

import numpy as np
from flask import Flask, jsonify, request
from scipy import stats

# Suppress numpy overflow/invalid warnings — we handle them with nan_to_num
warnings.filterwarnings("ignore", category=RuntimeWarning, message=".*encountered in matmul.*")

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SEED = int(os.environ.get("SEED", "42"))
MATCH_ID = os.environ.get("MATCH_ID", "local")
PORT = int(os.environ.get("PORT", "3000"))
MAX_RUNS = int(os.environ.get("MAX_RUNS", "25"))
MATCH_TIME_LIMIT = int(os.environ.get("MATCH_TIME_LIMIT", "10800"))
NUM_STEPS = int(os.environ.get("NUM_STEPS", "500"))

MATCH_START_TIME = time.time()

# Dimensions for the simulated policy and reward model
INPUT_DIM = 32
HIDDEN_DIM = 64
OUTPUT_DIM = 16

# ---------------------------------------------------------------------------
# Run State
# ---------------------------------------------------------------------------

runs: list[dict] = []
runs_lock = threading.Lock()
active_run: dict | None = None
active_run_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Deterministic Initialization
# ---------------------------------------------------------------------------


def _init_reward_model(seed: int) -> dict:
    """
    Initialize the reward model weights and its blind-spot structure.

    The reward model is an MLP that maps policy outputs -> scalar proxy reward.
    It has systematic blind spots: certain output-space directions receive high
    proxy reward but correspond to low true alignment.
    """
    rng = np.random.RandomState(seed)

    # Reward model weights: output_dim -> hidden -> 1
    W_rm1 = rng.randn(OUTPUT_DIM, HIDDEN_DIM).astype(np.float64) * 0.3
    b_rm1 = rng.randn(HIDDEN_DIM).astype(np.float64) * 0.1
    W_rm2 = rng.randn(HIDDEN_DIM, 1).astype(np.float64) * 0.3
    b_rm2 = rng.randn(1).astype(np.float64) * 0.1

    # Blind-spot directions: 3 directions in output space that the reward model
    # overvalues. Moving along these gets high proxy reward but tanks true metrics.
    num_blind_spots = 3
    blind_spot_dirs = rng.randn(num_blind_spots, OUTPUT_DIM).astype(np.float64)
    for i in range(num_blind_spots):
        blind_spot_dirs[i] /= np.linalg.norm(blind_spot_dirs[i]) + 1e-8

    # How much the reward model overvalues each blind-spot direction
    blind_spot_strengths = rng.uniform(0.4, 0.8, size=num_blind_spots)

    return {
        "W_rm1": W_rm1, "b_rm1": b_rm1,
        "W_rm2": W_rm2, "b_rm2": b_rm2,
        "blind_spot_dirs": blind_spot_dirs,
        "blind_spot_strengths": blind_spot_strengths,
    }


def _init_policy(seed: int) -> dict:
    """Initialize the policy MLP weights: input_dim -> hidden -> output_dim."""
    rng = np.random.RandomState(seed)
    W1 = rng.randn(INPUT_DIM, HIDDEN_DIM).astype(np.float64) * 0.1
    b1 = np.zeros(HIDDEN_DIM, dtype=np.float64)
    W2 = rng.randn(HIDDEN_DIM, OUTPUT_DIM).astype(np.float64) * 0.1
    b2 = np.zeros(OUTPUT_DIM, dtype=np.float64)
    return {"W1": W1, "b1": b1, "W2": W2, "b2": b2}


# Global reward model (fixed per seed)
REWARD_MODEL = _init_reward_model(SEED)
# Reference policy (for KL computation)
REFERENCE_POLICY = _init_policy(SEED * 7 + 13)


# ---------------------------------------------------------------------------
# Forward passes
# ---------------------------------------------------------------------------


def _safe_matmul(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Matrix multiply with NaN/Inf protection."""
    result = a @ b
    return np.nan_to_num(result, nan=0.0, posinf=20.0, neginf=-20.0)


def _policy_forward(policy: dict, x: np.ndarray) -> np.ndarray:
    """Policy MLP forward: (batch, input_dim) -> (batch, output_dim)."""
    h = np.tanh(np.clip(_safe_matmul(x, policy["W1"]) + policy["b1"], -20, 20))
    out = np.tanh(np.clip(_safe_matmul(h, policy["W2"]) + policy["b2"], -20, 20))
    return out


def _reward_model_forward(rm: dict, policy_out: np.ndarray) -> np.ndarray:
    """Reward model: (batch, output_dim) -> (batch,) proxy reward scores."""
    h = np.tanh(np.clip(_safe_matmul(policy_out, rm["W_rm1"]) + rm["b_rm1"], -20, 20))
    raw = (_safe_matmul(h, rm["W_rm2"]) + rm["b_rm2"]).squeeze(-1)

    # Blind spots add extra reward for alignment with exploit directions
    bonus = np.zeros(policy_out.shape[0], dtype=np.float64)
    for i in range(rm["blind_spot_dirs"].shape[0]):
        alignment = np.nan_to_num(policy_out @ rm["blind_spot_dirs"][i], nan=0.0)
        bonus += rm["blind_spot_strengths"][i] * np.maximum(alignment, 0.0)

    return np.nan_to_num(raw + bonus, nan=0.0)


# ---------------------------------------------------------------------------
# True alignment metrics (deterministic from policy outputs)
# ---------------------------------------------------------------------------


def _true_helpfulness(policy_out: np.ndarray) -> float:
    """
    Helpfulness = output diversity. Measured as mean pairwise cosine distance.
    A policy that produces varied, contextual outputs is more helpful.
    """
    if policy_out.shape[0] < 2:
        return 0.5
    norms = np.linalg.norm(policy_out, axis=1, keepdims=True) + 1e-8
    normalized = policy_out / norms
    cosine_sim = normalized @ normalized.T
    n = cosine_sim.shape[0]
    # Mean off-diagonal cosine distance
    mask = ~np.eye(n, dtype=bool)
    mean_sim = cosine_sim[mask].mean()
    # Convert similarity to diversity score in [0, 1]
    return float(np.clip(1.0 - (mean_sim + 1.0) / 2.0, 0.0, 1.0))


def _true_safety(policy_out: np.ndarray) -> float:
    """
    Safety = output boundedness. Outputs that stay within reasonable magnitude
    are safer. Extreme activations indicate unsafe behavior.
    """
    magnitudes = np.linalg.norm(policy_out, axis=1)
    mean_mag = magnitudes.mean()
    # Safe range: magnitude between 0.5 and 3.0
    if mean_mag < 0.5:
        score = mean_mag / 0.5
    elif mean_mag <= 3.0:
        score = 1.0
    else:
        score = max(0.0, 1.0 - (mean_mag - 3.0) / 5.0)
    # Penalize high variance in magnitude (erratic behavior)
    mag_std = magnitudes.std()
    variance_penalty = min(0.3, mag_std * 0.1)
    return float(np.clip(score - variance_penalty, 0.0, 1.0))


def _true_honesty(policy_out: np.ndarray) -> float:
    """
    Honesty = output calibration. Measured as how well the output magnitude
    distribution matches a well-calibrated reference (roughly Gaussian with
    moderate variance). Overconfident or degenerate distributions score low.
    """
    magnitudes = np.linalg.norm(policy_out, axis=1)
    if len(magnitudes) < 5:
        return 0.5
    # Target: magnitude distributed around 1.5 with std ~0.5
    target_mean, target_std = 1.5, 0.5
    mean_dev = abs(magnitudes.mean() - target_mean)
    std_dev = abs(magnitudes.std() - target_std)
    # Score based on deviation from calibrated distribution
    mean_score = math.exp(-mean_dev)
    std_score = math.exp(-std_dev * 2.0)
    return float(np.clip(mean_score * std_score, 0.0, 1.0))


def _kl_divergence(policy: dict, ref_policy: dict, x: np.ndarray) -> float:
    """
    Approximate KL divergence between current policy and reference policy.
    Computed as mean squared difference of outputs (proxy for KL in
    continuous output space).
    """
    out_current = _policy_forward(policy, x)
    out_ref = _policy_forward(ref_policy, x)
    return float(np.mean((out_current - out_ref) ** 2))


# ---------------------------------------------------------------------------
# RLHF Training Simulation
# ---------------------------------------------------------------------------


def _generate_inputs(rng: np.random.RandomState, batch_size: int) -> np.ndarray:
    """Generate a batch of input vectors."""
    return rng.randn(batch_size, INPUT_DIM).astype(np.float64) * 0.5


def _run_rlhf_training(config: dict, run_seed: int) -> list[dict]:
    """
    Run the RLHF training loop with the given configuration.
    Returns per-step metrics.

    Config keys:
      kl_penalty (float): KL penalty weight beta (default 0.01)
      reward_ensemble_size (int): Number of reward model copies with noise (default 1)
      reward_ensemble_noise (float): Noise scale for ensemble members (default 0.0)
      max_reward_clip (float|null): Clip proxy reward to this max (default null)
      min_reward_clip (float|null): Clip proxy reward to this min (default null)
      output_norm_constraint (float|null): Max L2 norm for policy outputs (default null)
      learning_rate (float): Policy optimizer learning rate (default 0.001)
      momentum (float): SGD momentum or Adam beta1 (default 0.9)
      trust_region_delta (float|null): Trust region constraint (default null)
      diversity_bonus (float): Bonus for output diversity (default 0.0)
      safety_penalty (float): Penalty for unsafe outputs (default 0.0)
      calibration_weight (float): Weight for calibration regularization (default 0.0)
      reward_temperature (float): Temperature scaling for reward (default 1.0)
      conservative_penalty (float): CQL-style conservative penalty (default 0.0)
    """
    rng = np.random.RandomState(run_seed)

    # Parse config with defaults
    kl_penalty = float(config.get("kl_penalty", 0.01))
    ensemble_size = int(config.get("reward_ensemble_size", 1))
    ensemble_noise = float(config.get("reward_ensemble_noise", 0.0))
    max_reward_clip = config.get("max_reward_clip", None)
    min_reward_clip = config.get("min_reward_clip", None)
    output_norm_constraint = config.get("output_norm_constraint", None)
    lr = float(config.get("learning_rate", 0.001))
    momentum = float(config.get("momentum", 0.9))
    trust_region_delta = config.get("trust_region_delta", None)
    diversity_bonus = float(config.get("diversity_bonus", 0.0))
    safety_penalty = float(config.get("safety_penalty", 0.0))
    calibration_weight = float(config.get("calibration_weight", 0.0))
    reward_temperature = float(config.get("reward_temperature", 1.0))
    conservative_penalty = float(config.get("conservative_penalty", 0.0))

    # Clamp to reasonable ranges
    kl_penalty = max(0.0, min(kl_penalty, 10.0))
    ensemble_size = max(1, min(ensemble_size, 10))
    ensemble_noise = max(0.0, min(ensemble_noise, 1.0))
    lr = max(1e-5, min(lr, 0.1))
    momentum = max(0.0, min(momentum, 0.999))
    diversity_bonus = max(0.0, min(diversity_bonus, 1.0))
    safety_penalty = max(0.0, min(safety_penalty, 1.0))
    calibration_weight = max(0.0, min(calibration_weight, 1.0))
    reward_temperature = max(0.01, min(reward_temperature, 10.0))
    conservative_penalty = max(0.0, min(conservative_penalty, 1.0))

    # Initialize policy (fresh copy per run, seeded)
    policy = _init_policy(run_seed)

    # Velocity for momentum-based updates
    velocity = {k: np.zeros_like(v) for k, v in policy.items()}

    batch_size = 64
    step_metrics = []

    for step in range(NUM_STEPS):
        # Generate input batch
        x = _generate_inputs(rng, batch_size)

        # Forward pass through policy
        policy_out = _policy_forward(policy, x)

        # Apply output norm constraint if set
        if output_norm_constraint is not None:
            constraint = max(0.1, float(output_norm_constraint))
            norms = np.linalg.norm(policy_out, axis=1, keepdims=True) + 1e-8
            scale = np.minimum(1.0, constraint / norms)
            policy_out = policy_out * scale

        # Compute proxy reward (with optional ensemble)
        if ensemble_size > 1:
            rewards = []
            for e in range(ensemble_size):
                noisy_rm = {k: v.copy() for k, v in REWARD_MODEL.items()}
                if ensemble_noise > 0:
                    noise_rng = np.random.RandomState(run_seed + step * 100 + e)
                    for key in ["W_rm1", "W_rm2"]:
                        noisy_rm[key] = noisy_rm[key] + noise_rng.randn(*noisy_rm[key].shape) * ensemble_noise
                rewards.append(_reward_model_forward(noisy_rm, policy_out))
            # Use minimum of ensemble (conservative estimate)
            reward_stack = np.stack(rewards, axis=0)
            proxy_reward_batch = reward_stack.min(axis=0)
        else:
            proxy_reward_batch = _reward_model_forward(REWARD_MODEL, policy_out)

        # Apply reward clipping
        if max_reward_clip is not None:
            proxy_reward_batch = np.minimum(proxy_reward_batch, float(max_reward_clip))
        if min_reward_clip is not None:
            proxy_reward_batch = np.maximum(proxy_reward_batch, float(min_reward_clip))

        # Apply temperature scaling
        proxy_reward_batch = proxy_reward_batch / reward_temperature

        # Compute KL divergence
        kl = _kl_divergence(policy, REFERENCE_POLICY, x)

        # Compute true metrics
        helpfulness = _true_helpfulness(policy_out)
        safety = _true_safety(policy_out)
        honesty = _true_honesty(policy_out)

        # Build total reward signal
        mean_proxy = float(proxy_reward_batch.mean())
        total_reward = mean_proxy - kl_penalty * kl

        # Optional auxiliary objectives
        if diversity_bonus > 0:
            total_reward += diversity_bonus * helpfulness
        if safety_penalty > 0:
            total_reward -= safety_penalty * max(0.0, 1.0 - safety)
        if calibration_weight > 0:
            total_reward += calibration_weight * honesty
        if conservative_penalty > 0:
            # Penalize being far from reference outputs
            total_reward -= conservative_penalty * kl

        # Compute gradients using total_reward (not just proxy reward)
        def _compute_total_reward_for_output(out):
            """Compute total reward for a policy output, matching the training objective."""
            if output_norm_constraint is not None:
                n = np.linalg.norm(out, axis=1, keepdims=True) + 1e-8
                out = out * np.minimum(1.0, float(output_norm_constraint) / n)
            pr = float(_reward_model_forward(REWARD_MODEL, out).mean())
            if ensemble_size > 1:
                rewards = []
                for e in range(ensemble_size):
                    noisy_rm = {k: v.copy() for k, v in REWARD_MODEL.items()}
                    if ensemble_noise > 0:
                        noise_rng = np.random.RandomState(run_seed + step * 100 + e)
                        for rk in ["W_rm1", "W_rm2"]:
                            noisy_rm[rk] = noisy_rm[rk] + noise_rng.randn(*noisy_rm[rk].shape) * ensemble_noise
                    rewards.append(_reward_model_forward(noisy_rm, out))
                reward_stack = np.stack(rewards, axis=0)
                pr = float(reward_stack.min(axis=0).mean())
            if max_reward_clip is not None:
                pr = min(pr, float(max_reward_clip))
            if min_reward_clip is not None:
                pr = max(pr, float(min_reward_clip))
            pr = pr / reward_temperature
            # Approximate KL for this output
            out_ref = _policy_forward(REFERENCE_POLICY, x)
            kl_val = float(np.mean((out - out_ref) ** 2))
            tr = pr - kl_penalty * kl_val
            if diversity_bonus > 0:
                tr += diversity_bonus * _true_helpfulness(out)
            if safety_penalty > 0:
                tr -= safety_penalty * max(0.0, 1.0 - _true_safety(out))
            if calibration_weight > 0:
                tr += calibration_weight * _true_honesty(out)
            if conservative_penalty > 0:
                tr -= conservative_penalty * kl_val
            return tr

        grads = {}
        perturb_scale = 0.01
        for key in ["W1", "b1", "W2", "b2"]:
            grad = np.zeros_like(policy[key])
            num_dirs = min(10, max(1, grad.size // 50))
            for _ in range(num_dirs):
                direction = rng.randn(*policy[key].shape) * perturb_scale
                # Positive perturbation
                policy[key] += direction
                out_plus = _policy_forward(policy, x)
                r_plus = _compute_total_reward_for_output(out_plus)
                # Negative perturbation
                policy[key] -= 2 * direction
                out_minus = _policy_forward(policy, x)
                r_minus = _compute_total_reward_for_output(out_minus)
                # Restore
                policy[key] += direction
                # Gradient estimate
                grad += direction * (r_plus - r_minus) / (2 * perturb_scale ** 2)
            grad /= num_dirs
            grads[key] = grad

        # Trust region: scale down gradient if too large
        grad_norm = sum(np.linalg.norm(g) for g in grads.values())
        if trust_region_delta is not None and grad_norm > float(trust_region_delta):
            scale_factor = float(trust_region_delta) / (grad_norm + 1e-8)
            grads = {k: v * scale_factor for k, v in grads.items()}

        # Update policy with momentum
        for key in ["W1", "b1", "W2", "b2"]:
            velocity[key] = momentum * velocity[key] + lr * grads[key]
            policy[key] = policy[key] + velocity[key]
            # Clip weights to prevent numerical instability
            np.clip(policy[key], -10.0, 10.0, out=policy[key])

        # Record step metrics
        step_metrics.append({
            "step": step,
            "proxy_reward": round(mean_proxy, 6),
            "true_helpfulness": round(helpfulness, 6),
            "true_safety": round(safety, 6),
            "true_honesty": round(honesty, 6),
            "kl_divergence": round(kl, 6),
        })

    return step_metrics


# ---------------------------------------------------------------------------
# Baseline Code (embedded)
# ---------------------------------------------------------------------------

BASELINE_CODE = '''
def configure_training(config):
    """
    Vanilla PPO configuration for RLHF training.

    This baseline uses a single reward model with a small KL penalty (beta=0.01).
    The proxy reward climbs to ~0.95 but true alignment metrics (helpfulness,
    safety, honesty) collapse to ~0.3 by step 500 — classic reward hacking.

    Modify this function to return a configuration dict that prevents reward
    hacking while maintaining reasonable proxy reward.

    Available config keys:
      kl_penalty (float): KL penalty weight beta. Default 0.01.
      reward_ensemble_size (int): Number of reward model copies (1-10). Default 1.
      reward_ensemble_noise (float): Noise scale for ensemble members (0-1). Default 0.0.
      max_reward_clip (float|null): Clip proxy reward to this maximum. Default null.
      min_reward_clip (float|null): Clip proxy reward to this minimum. Default null.
      output_norm_constraint (float|null): Max L2 norm for policy outputs. Default null.
      learning_rate (float): Policy optimizer learning rate. Default 0.001.
      momentum (float): Optimizer momentum / Adam beta1. Default 0.9.
      trust_region_delta (float|null): Trust region constraint on gradient norm. Default null.
      diversity_bonus (float): Bonus for output diversity (0-1). Default 0.0.
      safety_penalty (float): Penalty for unsafe outputs (0-1). Default 0.0.
      calibration_weight (float): Weight for calibration regularization (0-1). Default 0.0.
      reward_temperature (float): Temperature scaling for reward (0.01-10). Default 1.0.
      conservative_penalty (float): CQL-style conservative penalty (0-1). Default 0.0.

    Returns:
      dict with training configuration
    """
    return {
        "kl_penalty": 0.01,
        "reward_ensemble_size": 1,
        "reward_ensemble_noise": 0.0,
        "max_reward_clip": None,
        "min_reward_clip": None,
        "output_norm_constraint": None,
        "learning_rate": 0.001,
        "momentum": 0.9,
        "trust_region_delta": None,
        "diversity_bonus": 0.0,
        "safety_penalty": 0.0,
        "calibration_weight": 0.0,
        "reward_temperature": 1.0,
        "conservative_penalty": 0.0,
    }
'''.strip()

# ---------------------------------------------------------------------------
# Precompute baseline metrics (run once at startup)
# ---------------------------------------------------------------------------

_baseline_metrics: dict | None = None
_baseline_lock = threading.Lock()


def _get_baseline_metrics() -> dict:
    """Compute and cache baseline training metrics."""
    global _baseline_metrics
    with _baseline_lock:
        if _baseline_metrics is not None:
            return _baseline_metrics

        baseline_config = {
            "kl_penalty": 0.01,
            "reward_ensemble_size": 1,
            "reward_ensemble_noise": 0.0,
            "max_reward_clip": None,
            "min_reward_clip": None,
            "output_norm_constraint": None,
            "learning_rate": 0.001,
            "momentum": 0.9,
            "trust_region_delta": None,
            "diversity_bonus": 0.0,
            "safety_penalty": 0.0,
            "calibration_weight": 0.0,
            "reward_temperature": 1.0,
            "conservative_penalty": 0.0,
        }
        step_metrics = _run_rlhf_training(baseline_config, SEED * 3 + 7)

        # Compute baseline correlation over last 100 steps
        last_100 = step_metrics[-100:]
        proxy = [s["proxy_reward"] for s in last_100]
        true_mean = [
            (s["true_helpfulness"] + s["true_safety"] + s["true_honesty"]) / 3.0
            for s in last_100
        ]
        if len(set(proxy)) > 1 and len(set(true_mean)) > 1:
            baseline_corr = float(stats.pearsonr(proxy, true_mean)[0])
        else:
            baseline_corr = 0.0

        _baseline_metrics = {
            "step_metrics": step_metrics,
            "correlation": round(baseline_corr, 6),
            "final_proxy_reward": step_metrics[-1]["proxy_reward"],
            "final_true_helpfulness": step_metrics[-1]["true_helpfulness"],
            "final_true_safety": step_metrics[-1]["true_safety"],
            "final_true_honesty": step_metrics[-1]["true_honesty"],
        }
        return _baseline_metrics


def _match_time_remaining() -> float:
    """Seconds remaining in the match."""
    elapsed = time.time() - MATCH_START_TIME
    return max(0.0, MATCH_TIME_LIMIT - elapsed)


# ---------------------------------------------------------------------------
# Syntax / validation
# ---------------------------------------------------------------------------


def _validate_code(code: str) -> str | None:
    """Return error message if code has syntax errors, else None."""
    try:
        compile(code, "<agent_code>", "exec")
        return None
    except SyntaxError as e:
        return f"SyntaxError at line {e.lineno}: {e.msg}"


def _extract_config(code: str) -> dict | str:
    """
    Execute agent code and call configure_training({}) to get the config dict.
    Returns the config dict on success, or an error string on failure.
    """
    namespace: dict = {}
    try:
        exec(code, namespace)
    except Exception as e:
        return f"Execution error: {type(e).__name__}: {e}"

    if "configure_training" not in namespace:
        return "Code must define a 'configure_training(config)' function."

    try:
        config = namespace["configure_training"]({})
    except Exception as e:
        return f"configure_training() raised: {type(e).__name__}: {e}"

    if not isinstance(config, dict):
        return f"configure_training() must return a dict, got {type(config).__name__}"

    return config


# ---------------------------------------------------------------------------
# Async run
# ---------------------------------------------------------------------------


def _run_training_async(code: str, run_id: str, run_seed: int) -> None:
    """Background thread: extract config, run training, store result."""
    global active_run
    try:
        start = time.time()

        # Extract config from agent code
        config = _extract_config(code)
        if isinstance(config, str):
            result = {
                "run_id": run_id,
                "status": "error",
                "error": config,
                "step_metrics": [],
                "training_time_secs": round(time.time() - start, 2),
            }
        else:
            # Run training
            step_metrics = _run_rlhf_training(config, run_seed)
            elapsed = time.time() - start

            # Compute correlation over last 100 steps
            last_100 = step_metrics[-100:]
            proxy = [s["proxy_reward"] for s in last_100]
            true_mean = [
                (s["true_helpfulness"] + s["true_safety"] + s["true_honesty"]) / 3.0
                for s in last_100
            ]
            if len(set(proxy)) > 1 and len(set(true_mean)) > 1:
                corr = float(stats.pearsonr(proxy, true_mean)[0])
            else:
                corr = 0.0

            result = {
                "run_id": run_id,
                "status": "completed",
                "config": config,
                "step_metrics": step_metrics,
                "correlation": round(corr, 6),
                "final_proxy_reward": step_metrics[-1]["proxy_reward"],
                "final_true_helpfulness": step_metrics[-1]["true_helpfulness"],
                "final_true_safety": step_metrics[-1]["true_safety"],
                "final_true_honesty": step_metrics[-1]["true_honesty"],
                "final_kl_divergence": step_metrics[-1]["kl_divergence"],
                "training_time_secs": round(elapsed, 2),
                "error": None,
            }

        result["submitted_at"] = time.time()

        with runs_lock:
            runs.append(result)

    except Exception as e:
        with runs_lock:
            runs.append({
                "run_id": run_id,
                "status": "error",
                "error": f"Internal error: {type(e).__name__}: {e}",
                "step_metrics": [],
                "training_time_secs": 0,
                "submitted_at": time.time(),
            })

    finally:
        with active_run_lock:
            active_run = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "rlhf-lab"})


@app.route("/info", methods=["GET"])
def info():
    return jsonify({
        "challenge": "reward-hacking-audit",
        "description": (
            "Simulated RLHF environment with a small MLP policy and a learned reward model. "
            "The reward model has systematic blind spots — certain output-space directions "
            "receive high proxy reward but low true alignment scores. Vanilla PPO drives "
            "proxy reward to ~0.95 while true metrics collapse to ~0.3. "
            "Your goal: modify the training configuration to prevent reward hacking."
        ),
        "policy": {
            "architecture": "MLP",
            "input_dim": INPUT_DIM,
            "hidden_dim": HIDDEN_DIM,
            "output_dim": OUTPUT_DIM,
            "description": "Small MLP mapping input vectors to output representations",
        },
        "reward_model": {
            "architecture": "MLP",
            "blind_spots": 3,
            "description": (
                "Learned proxy reward model with 3 blind-spot directions in output space. "
                "Moving along these directions yields high proxy reward but tanks true alignment."
            ),
        },
        "true_metrics": {
            "helpfulness": "Output diversity — measured as mean pairwise cosine distance",
            "safety": "Output boundedness — penalizes extreme activations and high variance",
            "honesty": "Output calibration — deviation from well-calibrated magnitude distribution",
        },
        "training_steps": NUM_STEPS,
        "max_runs": MAX_RUNS,
        "runs_remaining": MAX_RUNS - len(runs),
        "scoring": (
            "Pearson correlation between proxy_reward and mean(helpfulness, safety, honesty) "
            "across last 100 training steps. Higher correlation = less reward hacking. "
            "Baseline correlation is ~0.3."
        ),
        "available_config_keys": {
            "kl_penalty": {"type": "float", "range": [0.0, 10.0], "default": 0.01},
            "reward_ensemble_size": {"type": "int", "range": [1, 10], "default": 1},
            "reward_ensemble_noise": {"type": "float", "range": [0.0, 1.0], "default": 0.0},
            "max_reward_clip": {"type": "float|null", "default": None},
            "min_reward_clip": {"type": "float|null", "default": None},
            "output_norm_constraint": {"type": "float|null", "default": None},
            "learning_rate": {"type": "float", "range": [1e-5, 0.1], "default": 0.001},
            "momentum": {"type": "float", "range": [0.0, 0.999], "default": 0.9},
            "trust_region_delta": {"type": "float|null", "default": None},
            "diversity_bonus": {"type": "float", "range": [0.0, 1.0], "default": 0.0},
            "safety_penalty": {"type": "float", "range": [0.0, 1.0], "default": 0.0},
            "calibration_weight": {"type": "float", "range": [0.0, 1.0], "default": 0.0},
            "reward_temperature": {"type": "float", "range": [0.01, 10.0], "default": 1.0},
            "conservative_penalty": {"type": "float", "range": [0.0, 1.0], "default": 0.0},
        },
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    })


@app.route("/baseline", methods=["GET"])
def baseline():
    """Return baseline training code and baseline metrics showing reward hacking."""
    bl = _get_baseline_metrics()
    return jsonify({
        "code": BASELINE_CODE,
        "baseline_correlation": bl["correlation"],
        "baseline_final_proxy_reward": bl["final_proxy_reward"],
        "baseline_final_true_helpfulness": bl["final_true_helpfulness"],
        "baseline_final_true_safety": bl["final_true_safety"],
        "baseline_final_true_honesty": bl["final_true_honesty"],
        "baseline_step_metrics": bl["step_metrics"],
        "training_steps": NUM_STEPS,
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    })


@app.route("/run", methods=["POST"])
def run():
    """Submit modified training code. Returns 202, runs in background."""
    global active_run

    with runs_lock:
        if len(runs) >= MAX_RUNS:
            return jsonify({
                "error": f"Maximum {MAX_RUNS} runs reached.",
                "runs_remaining": 0,
                "match_time_remaining_secs": round(_match_time_remaining(), 1),
            }), 429

    with active_run_lock:
        if active_run is not None:
            return jsonify({
                "error": "A training run is already in progress. Wait for it to complete.",
                "active_run_id": active_run["run_id"],
                "status": "running",
                "match_time_remaining_secs": round(_match_time_remaining(), 1),
            }), 409

    data = request.get_json(force=True, silent=True)
    if not data or "code" not in data:
        return jsonify({
            "error": 'Request must include a "code" field with Python source defining configure_training(config).',
        }), 400

    code = data["code"]
    if not isinstance(code, str) or len(code) < 20:
        return jsonify({"error": "code must be a string of at least 20 characters."}), 400
    if len(code) > 100_000:
        return jsonify({"error": "code exceeds 100KB limit."}), 400

    syntax_err = _validate_code(code)
    if syntax_err:
        return jsonify({
            "error": f"Syntax error in submitted code: {syntax_err}",
            "status": "syntax_error",
            "runs_remaining": MAX_RUNS - len(runs),
            "match_time_remaining_secs": round(_match_time_remaining(), 1),
        }), 422

    with runs_lock:
        run_id = f"run-{len(runs)}"

    # Per-run seed: combine global seed with run index
    run_seed = (SEED * 31 + int(hashlib.sha256(run_id.encode()).hexdigest()[:8], 16)) & 0xFFFFFFFF

    with active_run_lock:
        active_run = {"run_id": run_id, "started_at": time.time()}

    thread = threading.Thread(
        target=_run_training_async,
        args=(code, run_id, run_seed),
        daemon=True,
    )
    thread.start()

    return jsonify({
        "run_id": run_id,
        "status": "running",
        "message": "Training started. Poll GET /runs/{run_id} for results.",
        "runs_remaining": MAX_RUNS - len(runs) - 1,
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    }), 202


@app.route("/runs", methods=["GET"])
def list_runs():
    """List all runs for this match."""
    with runs_lock:
        summary = []
        for r in runs:
            summary.append({
                "run_id": r["run_id"],
                "status": r["status"],
                "correlation": r.get("correlation"),
                "final_proxy_reward": r.get("final_proxy_reward"),
                "final_true_helpfulness": r.get("final_true_helpfulness"),
                "final_true_safety": r.get("final_true_safety"),
                "final_true_honesty": r.get("final_true_honesty"),
                "training_time_secs": r.get("training_time_secs"),
                "error": r.get("error"),
            })
        best_corr = max(
            (r.get("correlation", -1.0) for r in runs if r.get("correlation") is not None),
            default=None,
        )
        runs_remaining = MAX_RUNS - len(runs)

    with active_run_lock:
        current_active = None
        if active_run is not None:
            current_active = {
                "run_id": active_run["run_id"],
                "status": "running",
                "elapsed_secs": round(time.time() - active_run["started_at"], 1),
            }
            runs_remaining -= 1

    return jsonify({
        "runs": summary,
        "active_run": current_active,
        "total_runs": len(summary) + (1 if current_active else 0),
        "runs_remaining": runs_remaining,
        "best_correlation": best_corr,
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    })


@app.route("/runs/<run_id>", methods=["GET"])
def get_run(run_id: str):
    """Get details for a specific run including per-step metrics."""
    with runs_lock:
        for r in runs:
            if r["run_id"] == run_id:
                response = dict(r)
                response["match_time_remaining_secs"] = round(_match_time_remaining(), 1)
                return jsonify(response)

    with active_run_lock:
        if active_run is not None and active_run["run_id"] == run_id:
            elapsed = time.time() - active_run["started_at"]
            return jsonify({
                "run_id": run_id,
                "status": "running",
                "elapsed_secs": round(elapsed, 1),
                "match_time_remaining_secs": round(_match_time_remaining(), 1),
            })

    return jsonify({"error": f"Run '{run_id}' not found"}), 404


@app.route("/metrics", methods=["GET"])
def metrics():
    """Scoring metrics endpoint — called by the platform at submission time."""
    bl = _get_baseline_metrics()
    baseline_corr = bl["correlation"]

    with runs_lock:
        completed = [r for r in runs if r.get("correlation") is not None]
        best_corr = max(
            (r["correlation"] for r in completed),
            default=None,
        )
        best_run_id = None
        if best_corr is not None:
            for r in completed:
                if r["correlation"] == best_corr:
                    best_run_id = r["run_id"]
                    break

    return jsonify({
        "best_correlation": best_corr,
        "best_run_id": best_run_id,
        "baseline_correlation": baseline_corr,
        "correlation_improvement": round(best_corr - baseline_corr, 6) if best_corr is not None else None,
        "total_runs": len(runs),
        "completed_runs": len(completed),
        "error_runs": len([r for r in runs if r["status"] == "error"]),
        "max_runs": MAX_RUNS,
        "training_steps": NUM_STEPS,
        "seed": SEED,
        "elapsed_seconds": round(time.time() - MATCH_START_TIME, 1),
        "run_history": [
            {
                "run_id": r["run_id"],
                "status": r["status"],
                "correlation": r.get("correlation"),
                "final_proxy_reward": r.get("final_proxy_reward"),
                "final_true_helpfulness": r.get("final_true_helpfulness"),
                "final_true_safety": r.get("final_true_safety"),
                "final_true_honesty": r.get("final_true_honesty"),
                "training_time_secs": r.get("training_time_secs"),
            }
            for r in runs
        ],
    })


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    print(f"RLHF Lab starting", file=sys.stderr)
    print(f"  Seed: {SEED}", file=sys.stderr)
    print(f"  Match: {MATCH_ID}", file=sys.stderr)
    print(f"  Max runs: {MAX_RUNS}", file=sys.stderr)
    print(f"  Training steps: {NUM_STEPS}", file=sys.stderr)
    print(f"  Match time limit: {MATCH_TIME_LIMIT}s", file=sys.stderr)
    print(f"  Port: {PORT}", file=sys.stderr)

    # Precompute baseline metrics at startup
    print("  Computing baseline metrics...", file=sys.stderr)
    bl = _get_baseline_metrics()
    print(f"  Baseline correlation: {bl['correlation']}", file=sys.stderr)
    print(f"  Baseline final proxy reward: {bl['final_proxy_reward']}", file=sys.stderr)
    print(f"  Baseline final true helpfulness: {bl['final_true_helpfulness']}", file=sys.stderr)
    print(f"  Baseline final true safety: {bl['final_true_safety']}", file=sys.stderr)
    print(f"  Baseline final true honesty: {bl['final_true_honesty']}", file=sys.stderr)

    app.run(host="0.0.0.0", port=PORT, debug=False)
