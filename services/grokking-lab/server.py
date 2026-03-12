"""
Grokking Lab v2 — Real PyTorch Training on Modular Arithmetic

Flask service that runs REAL transformer training on (a+b) mod p.
Agents submit Python code defining a model + training loop. The service
executes it in a subprocess with a timeout, then runs Fourier analysis
on the learned embeddings to detect grokking and circuit formation.

Endpoints:
  GET  /health          — Health check
  GET  /info            — Challenge description, constraints, p value
  GET  /baseline        — Returns baseline training code + expected grokking epoch
  POST /run             — Submit code, returns 202, trains in background subprocess
  GET  /runs            — List all runs with summaries
  GET  /runs/<id>       — Full results for a specific run
  GET  /metrics         — Scoring metrics (best grokking epoch, speedup, etc.)
"""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import uuid

from flask import Flask, jsonify, request

app = Flask(__name__)

# ── Configuration ─────────────────────────────────────────────────────

SEED = int(os.environ.get("SEED", "42"))
MATCH_ID = os.environ.get("MATCH_ID", "local")
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN", "")
PORT = int(os.environ.get("PORT", "3000"))

MAX_RUNS = int(os.environ.get("MAX_RUNS", "30"))
RUN_TIMEOUT = int(os.environ.get("RUN_TIMEOUT", "300"))
MATCH_TIME_LIMIT = int(os.environ.get("MATCH_TIME_LIMIT", "10800"))
START_TIME = time.time()

# ── Seeded RNG for selecting the prime p ──────────────────────────────

class SeededRNG:
    """Deterministic PRNG (mulberry32-equivalent)."""

    def __init__(self, seed):
        self.state = seed & 0xFFFFFFFF

    def next(self):
        self.state = (self.state + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.state
        t = ((t ^ (t >> 15)) * (1 | t)) & 0xFFFFFFFF
        t = (t + (((t ^ (t >> 7)) * (61 | t)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t = (t ^ (t >> 14)) & 0xFFFFFFFF
        return t / 4294967296.0

    def randint(self, lo, hi):
        return lo + int(self.next() * (hi - lo + 1))


rng_global = SeededRNG(SEED)
# Draw the prime from the range 59-113
_candidate = rng_global.randint(59, 113)
# Ensure it's actually prime
PRIMES_IN_RANGE = [59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113]
P = min(PRIMES_IN_RANGE, key=lambda x: abs(x - _candidate))

# ── Run storage ───────────────────────────────────────────────────────

runs = {}       # run_id -> run record
runs_lock = threading.Lock()

# Baseline grokking epoch (set after first baseline run, or estimated)
DEFAULT_GROKKING_EPOCH = 3000  # approximate; updated if baseline is actually run

# ── Baseline code (embedded as string) ────────────────────────────────

BASELINE_CODE_PATH = os.path.join(os.path.dirname(__file__) or ".", "baseline_train.py")

def _load_baseline_code():
    """Load baseline code from the adjacent file."""
    try:
        with open(BASELINE_CODE_PATH, "r") as f:
            return f.read()
    except FileNotFoundError:
        return "# baseline_train.py not found — see /info for the expected interface"

BASELINE_CODE = _load_baseline_code()


# ── Runner harness (written to temp dir for subprocess execution) ─────

RUNNER_HARNESS = r'''#!/usr/bin/env python3
"""
Runner harness — executed in a subprocess.

1. Writes the agent's code to a temp module
2. Sets up the modular addition dataset
3. Calls the agent's train(p, device) function
4. Runs Fourier analysis on the learned token embeddings
5. Prints JSON results to stdout
"""

import importlib.util
import json
import math
import os
import sys
import time
import traceback

import torch
import torch.nn.functional as F
import numpy as np


def load_agent_module(code_path):
    """Dynamically load the agent's code as a module."""
    spec = importlib.util.spec_from_file_location("agent_code", code_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def fourier_analysis(model, p):
    """
    Run FFT on the learned token embeddings to detect Fourier circuit formation.

    In grokked models, the token embeddings develop strong Fourier modes at
    frequencies that correspond to the modular arithmetic structure.
    For (a+b) mod p, the dominant modes are at frequency k and p-k.

    Returns:
        dict with fourier_spectrum (energy per mode) and dominant_modes
    """
    try:
        # Extract token embeddings (exclude the = token)
        if hasattr(model, "tok_embed"):
            emb = model.tok_embed.weight[:p].detach().cpu().float()
        elif hasattr(model, "embedding"):
            emb = model.embedding.weight[:p].detach().cpu().float()
        elif hasattr(model, "token_embedding"):
            emb = model.token_embedding.weight[:p].detach().cpu().float()
        else:
            # Try to find any Embedding layer
            for m in model.modules():
                if isinstance(m, torch.nn.Embedding) and m.weight.shape[0] >= p:
                    emb = m.weight[:p].detach().cpu().float()
                    break
            else:
                return {"error": "no_embedding_found", "fourier_spectrum": {}, "dominant_modes": []}

        # FFT along the token dimension (p tokens)
        # emb shape: (p, d_model)
        fft_result = torch.fft.fft(emb, dim=0)  # (p, d_model)
        # Energy per frequency mode = mean |F[k]|^2 across embedding dimensions
        energy = (fft_result.abs() ** 2).mean(dim=1)  # (p,)
        # Normalize: divide by total energy
        total_energy = energy.sum().item()
        if total_energy < 1e-10:
            total_energy = 1.0

        spectrum = {}
        for k in range(p):
            e = energy[k].item() / total_energy
            spectrum[f"mode_{k}"] = round(e, 6)

        # Find dominant modes (above uniform energy = 1/p)
        uniform = 1.0 / p
        dominant = []
        for k in range(1, p):  # skip DC component (mode 0)
            e = energy[k].item() / total_energy
            if e > 2 * uniform:
                dominant.append({"mode": k, "energy": round(e, 6)})

        dominant.sort(key=lambda x: -x["energy"])

        return {
            "fourier_spectrum": spectrum,
            "dominant_modes": dominant[:10],
            "total_energy": round(total_energy, 4),
        }

    except Exception as exc:
        return {
            "error": str(exc),
            "fourier_spectrum": {},
            "dominant_modes": [],
        }


def detect_grokking(history, p):
    """
    Detect grokking: val_acc crosses 0.95 after being near chance (1/p).

    Returns:
        grokking_epoch (int or None), memorization_epoch (int or None)
    """
    chance = 1.0 / p
    grokking_epoch = None
    memorization_epoch = None

    # Find memorization: first epoch where train_acc >= 0.95
    for entry in history:
        if entry.get("train_acc", 0) >= 0.95:
            memorization_epoch = entry["epoch"]
            break

    # Find grokking: first epoch where val_acc >= 0.95
    # (must have been near chance at some earlier point)
    was_at_chance = False
    for entry in history:
        if entry.get("val_acc", 0) < chance + 0.1:
            was_at_chance = True
        if was_at_chance and entry.get("val_acc", 0) >= 0.95:
            grokking_epoch = entry["epoch"]
            break

    return grokking_epoch, memorization_epoch


def main():
    p = int(os.environ["GROKKING_P"])
    agent_code_path = os.environ["AGENT_CODE_PATH"]
    seed = int(os.environ.get("RUN_SEED", "42"))

    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)

    device = "cpu"
    start = time.time()

    try:
        # Load and run agent code
        agent_mod = load_agent_module(agent_code_path)

        if not hasattr(agent_mod, "train"):
            print(json.dumps({
                "status": "error",
                "error": "Agent code must define a train(p, device='cpu') function.",
            }))
            sys.exit(1)

        result = agent_mod.train(p, device=device)
        elapsed = time.time() - start

        # Extract results
        if not isinstance(result, dict):
            print(json.dumps({
                "status": "error",
                "error": "train() must return a dict with 'training_history' and 'model_state_dict'.",
            }))
            sys.exit(1)

        history = result.get("training_history", [])
        config = result.get("config", {})
        model_state = result.get("model_state_dict", None)

        # Detect grokking
        grokking_epoch, memorization_epoch = detect_grokking(history, p)

        # Fourier analysis — need the live model for this
        fourier = {"fourier_spectrum": {}, "dominant_modes": [], "error": "no_model"}
        if model_state is not None:
            # Try to reconstruct the model from agent's code
            # Look for common model class names
            model = None
            for attr_name in dir(agent_mod):
                attr = getattr(agent_mod, attr_name)
                if isinstance(attr, type) and issubclass(attr, torch.nn.Module) and attr is not torch.nn.Module:
                    try:
                        # Try common constructor signatures
                        try:
                            model = attr(p)
                        except TypeError:
                            try:
                                model = attr(p, d_model=config.get("d_model", 128))
                            except TypeError:
                                continue
                        model.load_state_dict(model_state)
                        model.eval()
                        break
                    except Exception:
                        model = None
                        continue

            if model is not None:
                fourier = fourier_analysis(model, p)
            else:
                # Fallback: try to find a model object in the result
                if "model" in result and isinstance(result["model"], torch.nn.Module):
                    fourier = fourier_analysis(result["model"], p)

        # Build final output
        # Trim history to keep JSON manageable (max 500 entries)
        if len(history) > 500:
            step = max(1, len(history) // 500)
            history = history[::step]
            # Always include the last entry
            if history[-1] != result.get("training_history", [{}])[-1]:
                history.append(result["training_history"][-1])

        output = {
            "status": "completed",
            "grokking_epoch": grokking_epoch,
            "memorization_epoch": memorization_epoch,
            "training_history": history,
            "fourier_analysis": fourier,
            "config": config,
            "total_epochs": config.get("epochs", len(history)),
            "elapsed_seconds": round(elapsed, 2),
            "final_train_acc": history[-1].get("train_acc") if history else None,
            "final_val_acc": history[-1].get("val_acc") if history else None,
            "final_train_loss": history[-1].get("train_loss") if history else None,
            "final_val_loss": history[-1].get("val_loss") if history else None,
        }

        print(json.dumps(output))

    except Exception as exc:
        elapsed = time.time() - start
        print(json.dumps({
            "status": "error",
            "error": f"{type(exc).__name__}: {exc}",
            "traceback": traceback.format_exc(),
            "elapsed_seconds": round(elapsed, 2),
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()
'''


# ── Background run execution ─────────────────────────────────────────

def _execute_run(run_id, code):
    """Execute agent code in a subprocess and store results."""
    tmpdir = None
    try:
        tmpdir = tempfile.mkdtemp(prefix=f"grokking-{run_id}-")
        os.chmod(tmpdir, 0o755)

        # Write agent code
        agent_path = os.path.join(tmpdir, "agent_code.py")
        with open(agent_path, "w") as f:
            f.write(code)

        # Write runner harness
        harness_path = os.path.join(tmpdir, "runner_harness.py")
        with open(harness_path, "w") as f:
            f.write(RUNNER_HARNESS)

        # Copy baseline_train.py so agent code can import it if needed
        baseline_dest = os.path.join(tmpdir, "baseline_train.py")
        try:
            with open(BASELINE_CODE_PATH, "r") as src:
                with open(baseline_dest, "w") as dst:
                    dst.write(src.read())
        except FileNotFoundError:
            pass

        # Run in subprocess
        env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "PYTHONPATH": tmpdir,
            "PYTHONUNBUFFERED": "1",
            "GROKKING_P": str(P),
            "AGENT_CODE_PATH": agent_path,
            "RUN_SEED": str(SEED),
        }

        start = time.time()
        proc = subprocess.run(
            [sys.executable, harness_path],
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT,
            env=env,
            cwd=tmpdir,
        )
        elapsed = time.time() - start

        # Parse results from stdout
        stdout = proc.stdout.strip()
        stderr = proc.stderr.strip()

        if proc.returncode != 0 and not stdout:
            result = {
                "status": "error",
                "error": f"Process exited with code {proc.returncode}",
                "stderr": stderr[-2000:] if stderr else "",
                "elapsed_seconds": round(elapsed, 2),
            }
        else:
            try:
                # Find the last line that looks like JSON
                lines = stdout.split("\n")
                json_line = None
                for line in reversed(lines):
                    line = line.strip()
                    if line.startswith("{"):
                        json_line = line
                        break

                if json_line:
                    result = json.loads(json_line)
                else:
                    result = {
                        "status": "error",
                        "error": "No JSON output from runner harness",
                        "stdout": stdout[-2000:],
                        "stderr": stderr[-2000:] if stderr else "",
                        "elapsed_seconds": round(elapsed, 2),
                    }
            except json.JSONDecodeError as e:
                result = {
                    "status": "error",
                    "error": f"Invalid JSON from runner: {e}",
                    "stdout": stdout[-2000:],
                    "stderr": stderr[-2000:] if stderr else "",
                    "elapsed_seconds": round(elapsed, 2),
                }

        with runs_lock:
            runs[run_id].update({
                "status": result.get("status", "error"),
                "result": result,
                "completed_at": time.time() - START_TIME,
            })

    except subprocess.TimeoutExpired:
        with runs_lock:
            runs[run_id].update({
                "status": "error",
                "result": {
                    "status": "error",
                    "error": f"Run timed out after {RUN_TIMEOUT}s",
                    "elapsed_seconds": RUN_TIMEOUT,
                },
                "completed_at": time.time() - START_TIME,
            })

    except Exception as e:
        with runs_lock:
            runs[run_id].update({
                "status": "error",
                "result": {
                    "status": "error",
                    "error": f"Server error: {type(e).__name__}: {e}",
                },
                "completed_at": time.time() - START_TIME,
            })

    finally:
        # Clean up temp dir
        if tmpdir:
            try:
                import shutil
                shutil.rmtree(tmpdir, ignore_errors=True)
            except Exception:
                pass


# ── Flask Routes ──────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "grokking-lab"})


@app.route("/info", methods=["GET"])
def info():
    elapsed = time.time() - START_TIME
    with runs_lock:
        n_runs = len(runs)

    return jsonify({
        "challenge": "grokking-dynamics",
        "version": "2.0",
        "description": (
            "Train small transformers on modular addition (a+b) mod p and "
            "investigate the grokking phenomenon. Submit Python code that defines "
            "a model and training loop. The service runs REAL PyTorch training, "
            "then analyzes the learned Fourier circuit. Your goal: make grokking "
            "happen as fast as possible."
        ),
        "p": P,
        "max_runs": MAX_RUNS,
        "runs_used": n_runs,
        "runs_remaining": MAX_RUNS - n_runs,
        "run_timeout_seconds": RUN_TIMEOUT,
        "match_time_limit_seconds": MATCH_TIME_LIMIT,
        "elapsed_seconds": round(elapsed, 1),
        "interface": {
            "train_function": (
                "Your code must define: train(p, device='cpu') -> dict with keys: "
                "'model_state_dict' (state dict), 'training_history' (list of dicts "
                "with epoch, train_loss, train_acc, val_loss, val_acc, weight_norm, "
                "grad_norm), 'config' (dict of hyperparameters used)."
            ),
            "optional_return_keys": [
                "model — the live nn.Module (enables Fourier analysis even if "
                "model_state_dict reconstruction fails)"
            ],
        },
        "notes": [
            f"Modular base p={P} (prime). Dataset is all (a,b) pairs, split 30/70 train/val.",
            "Baseline 2-layer transformer groks at ~epoch 3000 with AdamW lr=1e-3, wd=0.01.",
            "Higher weight_decay typically accelerates grokking.",
            "After training, FFT is run on token embeddings to detect Fourier circuit formation.",
            f"You have {MAX_RUNS} runs. Each run has a {RUN_TIMEOUT}s timeout.",
            "GET /baseline for the full baseline code to modify.",
        ],
    })


@app.route("/baseline", methods=["GET"])
def baseline():
    return jsonify({
        "baseline_code": BASELINE_CODE,
        "baseline_grokking_epoch": DEFAULT_GROKKING_EPOCH,
        "p": P,
        "notes": (
            "This is a working baseline. Your code must define train(p, device='cpu') "
            "that returns a dict with 'model_state_dict', 'training_history', and 'config'. "
            "Modify the architecture, optimizer, schedule, data handling, etc. to make "
            "grokking happen faster."
        ),
    })


@app.route("/run", methods=["POST"])
def submit_run():
    # Check match time limit
    elapsed = time.time() - START_TIME
    if elapsed >= MATCH_TIME_LIMIT:
        return jsonify({
            "error": "match_time_expired",
            "message": f"Match time limit of {MATCH_TIME_LIMIT}s has been reached.",
            "elapsed_seconds": round(elapsed, 1),
        }), 429

    # Check run limit
    with runs_lock:
        n_runs = len(runs)
        if n_runs >= MAX_RUNS:
            return jsonify({
                "error": "run_limit_reached",
                "message": f"Maximum {MAX_RUNS} runs allowed. Use GET /runs to review results.",
                "runs_used": n_runs,
            }), 429

        # Check for too many concurrent runs (max 2 at a time)
        running = sum(1 for r in runs.values() if r["status"] == "running")
        if running >= 2:
            return jsonify({
                "error": "too_many_concurrent",
                "message": "Maximum 2 concurrent runs. Wait for a run to complete.",
                "running": running,
            }), 429

    data = request.get_json(silent=True) or {}
    code = data.get("code", "")

    if not code or not code.strip():
        return jsonify({
            "error": "missing_code",
            "message": "POST body must include 'code' — a Python script defining train(p, device).",
        }), 400

    # Basic validation: check for train function definition
    if "def train" not in code:
        return jsonify({
            "error": "no_train_function",
            "message": "Code must define a train(p, device='cpu') function.",
        }), 400

    # Create run record
    run_id = f"run-{len(runs):03d}-{uuid.uuid4().hex[:6]}"
    with runs_lock:
        runs[run_id] = {
            "run_id": run_id,
            "status": "running",
            "submitted_at": time.time() - START_TIME,
            "completed_at": None,
            "result": None,
            "code_hash": hashlib.sha256(code.encode()).hexdigest()[:16],
            "code_length": len(code),
        }

    # Launch background thread
    thread = threading.Thread(
        target=_execute_run, args=(run_id, code), daemon=True
    )
    thread.start()

    return jsonify({
        "run_id": run_id,
        "status": "running",
        "message": "Training started. Poll GET /runs/{run_id} for results.",
        "p": P,
        "timeout_seconds": RUN_TIMEOUT,
    }), 202


@app.route("/runs", methods=["GET"])
def list_runs():
    with runs_lock:
        summaries = []
        for run_id, run in runs.items():
            summary = {
                "run_id": run["run_id"],
                "status": run["status"],
                "submitted_at": run["submitted_at"],
                "completed_at": run["completed_at"],
                "code_hash": run["code_hash"],
                "code_length": run["code_length"],
            }
            # Add key result fields if completed
            if run["result"] and run["status"] == "completed":
                r = run["result"]
                summary["grokking_epoch"] = r.get("grokking_epoch")
                summary["memorization_epoch"] = r.get("memorization_epoch")
                summary["total_epochs"] = r.get("total_epochs")
                summary["final_train_acc"] = r.get("final_train_acc")
                summary["final_val_acc"] = r.get("final_val_acc")
                summary["elapsed_seconds"] = r.get("elapsed_seconds")
            elif run["result"] and run["status"] == "error":
                summary["error"] = run["result"].get("error", "unknown")

            summaries.append(summary)

        return jsonify({
            "runs": summaries,
            "total": len(runs),
            "remaining": MAX_RUNS - len(runs),
            "p": P,
        })


@app.route("/runs/<run_id>", methods=["GET"])
def get_run(run_id):
    with runs_lock:
        run = runs.get(run_id)
        if not run:
            return jsonify({
                "error": "not_found",
                "message": f"Run '{run_id}' not found.",
            }), 404

        response = {
            "run_id": run["run_id"],
            "status": run["status"],
            "submitted_at": run["submitted_at"],
            "completed_at": run["completed_at"],
            "code_hash": run["code_hash"],
            "code_length": run["code_length"],
        }

        if run["status"] == "running":
            response["message"] = "Training in progress. Poll again shortly."
        elif run["result"]:
            response["result"] = run["result"]

        return jsonify(response)


@app.route("/metrics", methods=["GET"])
def metrics():
    """Scoring metrics endpoint — called by the platform at submission time."""
    elapsed = time.time() - START_TIME

    with runs_lock:
        completed_runs = [
            r for r in runs.values()
            if r["status"] == "completed" and r["result"]
        ]
        error_runs = [r for r in runs.values() if r["status"] == "error"]

    best_grokking_epoch = None
    best_run_id = None
    grokking_runs = []
    all_grokking_epochs = []

    for run in completed_runs:
        result = run["result"]
        ge = result.get("grokking_epoch")
        if ge is not None:
            grokking_runs.append(run["run_id"])
            all_grokking_epochs.append(ge)
            if best_grokking_epoch is None or ge < best_grokking_epoch:
                best_grokking_epoch = ge
                best_run_id = run["run_id"]

    # Compute speedup relative to baseline
    best_speedup = 1.0
    if best_grokking_epoch is not None and DEFAULT_GROKKING_EPOCH > 0:
        best_speedup = DEFAULT_GROKKING_EPOCH / max(1, best_grokking_epoch)

    # Fourier quality: check if any run has strong dominant modes
    best_fourier_modes = 0
    for run in completed_runs:
        result = run["result"]
        fa = result.get("fourier_analysis", {})
        dominant = fa.get("dominant_modes", [])
        best_fourier_modes = max(best_fourier_modes, len(dominant))

    return jsonify({
        "p": P,
        "total_runs": len(runs),
        "completed_runs": len(completed_runs),
        "error_runs": len(error_runs),
        "runs_with_grokking": len(grokking_runs),
        "grokking_run_ids": grokking_runs,
        "best_grokking_epoch": best_grokking_epoch,
        "best_run_id": best_run_id,
        "default_grokking_epoch": DEFAULT_GROKKING_EPOCH,
        "best_speedup_factor": round(best_speedup, 4),
        "all_grokking_epochs": sorted(all_grokking_epochs),
        "best_fourier_modes_detected": best_fourier_modes,
        "elapsed_seconds": round(elapsed, 1),
        "match_time_remaining_secs": round(max(0, MATCH_TIME_LIMIT - elapsed), 1),
        "match_time_limit_seconds": MATCH_TIME_LIMIT,
        "max_runs": MAX_RUNS,
    })


# ── Main ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Grokking Lab v2.0 starting on port {PORT}")
    print(f"  SEED={SEED}  MATCH_ID={MATCH_ID}  P={P}")
    print(f"  MAX_RUNS={MAX_RUNS}  RUN_TIMEOUT={RUN_TIMEOUT}s  MATCH_TIME_LIMIT={MATCH_TIME_LIMIT}s")
    app.run(host="0.0.0.0", port=PORT, debug=False)
