"""
Descent Lab — Real PyTorch Double Descent Training

Flask service that runs REAL PyTorch MLP training on a synthetic classification
dataset. Agents submit Python code defining a model + training loop; the service
executes it in a subprocess and returns actual training curves.

Double descent emerges naturally from the interaction of model capacity and
limited noisy data — no simulation formulas needed.

Endpoints:
  GET  /health       — Health check
  GET  /info         — Dataset info, constraints, experiments remaining
  GET  /baseline     — Baseline code and expected test accuracy
  POST /run          — Submit training code, returns 202, trains in background
  GET  /runs         — List all runs with summaries
  GET  /runs/<id>    — Full results for a specific run
  GET  /metrics      — Scoring metrics for the platform
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import uuid

import numpy as np
from flask import Flask, jsonify, request

app = Flask(__name__)

# ── Configuration ────────────────────────────────────────────────────────

SEED = int(os.environ.get("SEED", "42"))
MATCH_ID = os.environ.get("MATCH_ID", "local")
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN", "")
PORT = int(os.environ.get("PORT", "3000"))

MAX_RUNS = int(os.environ.get("MAX_RUNS", "40"))
RUN_TIMEOUT = int(os.environ.get("RUN_TIMEOUT", "60"))
MATCH_TIME_LIMIT = int(os.environ.get("MATCH_TIME_LIMIT", "10800"))
START_TIME = time.time()

# ── Seeded dataset parameters ────────────────────────────────────────────

rng = np.random.RandomState(SEED)
N_TRAIN = int(rng.randint(200, 501))        # 200-500
N_FEATURES = int(rng.randint(20, 51))       # 20-50
NOISE_LEVEL = float(rng.uniform(0.05, 0.2))
N_TEST = 500

# ── Generate synthetic classification dataset ────────────────────────────

def generate_dataset():
    """
    Synthetic binary classification: random linear boundary with label noise.
    Returns (X_train, y_train, X_test, y_test) as numpy arrays.
    """
    gen = np.random.RandomState(SEED)

    n_total = N_TRAIN + N_TEST
    X = gen.randn(n_total, N_FEATURES).astype(np.float32)

    # Random linear boundary
    w_true = gen.randn(N_FEATURES).astype(np.float32)
    w_true /= np.linalg.norm(w_true)
    bias_true = float(gen.uniform(-0.3, 0.3))

    logits = X @ w_true + bias_true
    y = (logits > 0).astype(np.int64)

    # Add label noise
    n_flip = int(n_total * NOISE_LEVEL)
    flip_idx = gen.choice(n_total, size=n_flip, replace=False)
    y[flip_idx] = 1 - y[flip_idx]

    X_train, X_test = X[:N_TRAIN], X[N_TRAIN:]
    y_train, y_test = y[:N_TRAIN], y[N_TRAIN:]

    return X_train, y_train, X_test, y_test


X_TRAIN, Y_TRAIN, X_TEST, Y_TEST = generate_dataset()

# Save dataset to a temp directory that persists for the container's lifetime
DATASET_DIR = tempfile.mkdtemp(prefix="descent_lab_")
np.save(os.path.join(DATASET_DIR, "X_train.npy"), X_TRAIN)
np.save(os.path.join(DATASET_DIR, "y_train.npy"), Y_TRAIN)
np.save(os.path.join(DATASET_DIR, "X_test.npy"), X_TEST)
# Save y_test with obscured name so agent code cannot trivially load it
np.save(os.path.join(DATASET_DIR, "_y_test.npy"), Y_TEST)

# ── Run storage ──────────────────────────────────────────────────────────

runs = {}  # id -> run record
runs_lock = threading.Lock()

# ── Baseline code ────────────────────────────────────────────────────────

BASELINE_CODE = open(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "baseline_train.py")
).read() if os.path.exists(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "baseline_train.py")
) else ""

# ── Runner ───────────────────────────────────────────────────────────────

RUNNER_TEMPLATE = r'''
import json
import sys
import os
import numpy as np

# Load dataset
dataset_dir = sys.argv[1]
X_train = np.load(os.path.join(dataset_dir, "X_train.npy"))
y_train = np.load(os.path.join(dataset_dir, "y_train.npy"))
X_test = np.load(os.path.join(dataset_dir, "X_test.npy"))

# ── Agent code is inserted below ────────────────────────────────────────

{agent_code}

# ── Execute training ─────────────────────────────────────────────────────

try:
    result = train(X_train, y_train, X_test, device="cpu")

    # Validate result structure
    assert isinstance(result, dict), "train() must return a dict"
    assert "training_history" in result, "result must contain 'training_history'"

    # Agent must return predictions on X_test
    predictions = result.get("predictions")
    test_accuracy = result.get("test_accuracy")

    # If predictions provided, compute accuracy server-side
    if predictions is not None:
        predictions = np.array(predictions)
        # Load y_test only for server-side evaluation (not available to agent)
        _y_test = np.load(os.path.join(dataset_dir, "_y_test.npy"))
        test_accuracy = float((predictions == _y_test).mean())

    if test_accuracy is None:
        test_accuracy = 0.0

    # Extract spectral norms if provided, otherwise skip
    spectral_norms = result.get("spectral_norms", [])
    effective_params = result.get("effective_params", 0)

    output = {
        "status": "ok",
        "test_accuracy": float(test_accuracy),
        "training_history": result["training_history"],
        "spectral_norms": spectral_norms,
        "effective_params": int(effective_params),
    }

    print("__RESULT__" + json.dumps(output))

except Exception as e:
    import traceback
    output = {
        "status": "error",
        "error": str(e),
        "traceback": traceback.format_exc(),
    }
    print("__RESULT__" + json.dumps(output))
'''


def execute_run(run_id, code):
    """Execute agent code in a subprocess and store results."""
    # Write runner script to temp file
    runner_code = RUNNER_TEMPLATE.replace("{agent_code}", code)
    runner_path = os.path.join(DATASET_DIR, f"runner_{run_id}.py")

    with open(runner_path, "w") as f:
        f.write(runner_code)

    start = time.time()

    try:
        run_env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "PYTHONUNBUFFERED": "1",
        }

        proc = subprocess.run(
            [sys.executable, runner_path, DATASET_DIR],
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT,
            cwd=DATASET_DIR,
            env=run_env,
        )

        elapsed = time.time() - start
        stdout = proc.stdout
        stderr = proc.stderr

        # Parse result from stdout
        result_data = None
        for line in stdout.splitlines():
            if line.startswith("__RESULT__"):
                result_data = json.loads(line[len("__RESULT__"):])
                break

        if result_data is None:
            # No result marker found
            with runs_lock:
                runs[run_id].update({
                    "status": "error",
                    "error": "No result produced by training code",
                    "stderr": stderr[-2000:] if stderr else "",
                    "stdout": stdout[-2000:] if stdout else "",
                    "elapsed_seconds": round(elapsed, 2),
                    "completed_at": time.time() - START_TIME,
                })
            return

        if result_data.get("status") == "error":
            with runs_lock:
                runs[run_id].update({
                    "status": "error",
                    "error": result_data.get("error", "Unknown error"),
                    "traceback": result_data.get("traceback", ""),
                    "elapsed_seconds": round(elapsed, 2),
                    "completed_at": time.time() - START_TIME,
                })
            return

        # Success
        with runs_lock:
            runs[run_id].update({
                "status": "completed",
                "test_accuracy": result_data["test_accuracy"],
                "training_history": result_data["training_history"],
                "spectral_norms": result_data.get("spectral_norms", []),
                "effective_params": result_data.get("effective_params", 0),
                "elapsed_seconds": round(elapsed, 2),
                "completed_at": time.time() - START_TIME,
            })

    except subprocess.TimeoutExpired:
        elapsed = time.time() - start
        with runs_lock:
            runs[run_id].update({
                "status": "error",
                "error": f"Training timed out after {RUN_TIMEOUT}s",
                "elapsed_seconds": round(elapsed, 2),
                "completed_at": time.time() - START_TIME,
            })
    except Exception as e:
        elapsed = time.time() - start
        with runs_lock:
            runs[run_id].update({
                "status": "error",
                "error": str(e),
                "elapsed_seconds": round(elapsed, 2),
                "completed_at": time.time() - START_TIME,
            })
    finally:
        # Clean up runner script
        try:
            os.unlink(runner_path)
        except OSError:
            pass


# ── Flask Routes ─────────────────────────────────────────────────────────


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "descent-lab"})


@app.route("/info", methods=["GET"])
def info():
    with runs_lock:
        n_runs = len(runs)

    return jsonify({
        "challenge": "double-descent-lab",
        "description": (
            "Train MLPs on a real synthetic classification dataset. "
            "Explore the double descent phenomenon by varying model capacity. "
            "Submit Python code that defines a model and training loop."
        ),
        "dataset": {
            "n_train": N_TRAIN,
            "n_test": N_TEST,
            "n_features": N_FEATURES,
            "noise_level": round(NOISE_LEVEL, 4),
            "task": "binary_classification",
            "description": (
                f"Synthetic binary classification with {N_FEATURES} features, "
                f"{N_TRAIN} training samples, {N_TEST} test samples, and "
                f"{round(NOISE_LEVEL * 100, 1)}% label noise."
            ),
        },
        "max_runs": MAX_RUNS,
        "runs_remaining": MAX_RUNS - n_runs,
        "run_timeout_seconds": RUN_TIMEOUT,
        "match_time_limit_seconds": MATCH_TIME_LIMIT,
        "notes": [
            "Submit Python code defining train(X_train, y_train, X_test, device='cpu') -> dict.",
            "Your train() must return: {'test_accuracy': float, 'predictions': array, 'training_history': [...], "
            "'spectral_norms': [...], 'effective_params': int}. test_accuracy is verified server-side if predictions are provided.",
            "training_history entries: {'epoch': int, 'train_loss': float, 'test_loss': float, "
            "'train_acc': float, 'test_acc': float}.",
            "PyTorch, numpy, and scikit-learn are available.",
            f"The interpolation threshold occurs when effective_params ~ n_train ({N_TRAIN}).",
            "Varying hidden width is the primary way to sweep model capacity.",
            "GET /baseline for the baseline code that achieves ~82% test accuracy.",
        ],
    })


@app.route("/baseline", methods=["GET"])
def baseline():
    return jsonify({
        "baseline_code": BASELINE_CODE,
        "baseline_test_accuracy": 0.82,
        "dataset_info": {
            "n_train": N_TRAIN,
            "n_test": N_TEST,
            "n_features": N_FEATURES,
            "noise_level": round(NOISE_LEVEL, 4),
        },
        "notes": (
            "Baseline: Width-20, Depth-2 MLP, Adam lr=0.01, no regularization. "
            "Modify architecture, optimizer, regularization, etc. to explore double descent."
        ),
    })


@app.route("/run", methods=["POST"])
def submit_run():
    # Check match time limit
    elapsed = time.time() - START_TIME
    if elapsed > MATCH_TIME_LIMIT:
        return jsonify({
            "error": "match_time_expired",
            "message": f"Match time limit of {MATCH_TIME_LIMIT}s exceeded.",
        }), 429

    with runs_lock:
        n_runs = len(runs)

    if n_runs >= MAX_RUNS:
        return jsonify({
            "error": "run_limit_reached",
            "message": f"Maximum {MAX_RUNS} runs allowed. Use GET /runs to review results.",
            "runs_submitted": n_runs,
        }), 429

    data = request.get_json(silent=True) or {}
    code = data.get("code", "")

    if not code.strip():
        return jsonify({
            "error": "empty_code",
            "message": "No code provided. Submit {'code': '...'} with a train() function.",
        }), 400

    # Validate code contains train function definition
    if "def train(" not in code:
        return jsonify({
            "error": "missing_train_function",
            "message": "Code must define a train(X_train, y_train, X_test, device='cpu') function.",
        }), 400

    run_id = f"run-{n_runs:03d}-{uuid.uuid4().hex[:6]}"

    with runs_lock:
        runs[run_id] = {
            "run_id": run_id,
            "status": "running",
            "submitted_at": time.time() - START_TIME,
            "code_length": len(code),
        }

    # Launch in background thread
    thread = threading.Thread(target=execute_run, args=(run_id, code), daemon=True)
    thread.start()

    return jsonify({
        "run_id": run_id,
        "status": "running",
        "message": "Training started. Poll GET /runs/{run_id} for results.",
    }), 202


@app.route("/runs", methods=["GET"])
def list_runs():
    with runs_lock:
        summaries = []
        for rid, run in runs.items():
            summary = {
                "run_id": run["run_id"],
                "status": run["status"],
                "submitted_at": run.get("submitted_at"),
                "code_length": run.get("code_length"),
            }
            if run["status"] == "completed":
                summary["test_accuracy"] = run.get("test_accuracy")
                summary["effective_params"] = run.get("effective_params")
                summary["elapsed_seconds"] = run.get("elapsed_seconds")
            elif run["status"] == "error":
                summary["error"] = run.get("error", "")[:200]
                summary["elapsed_seconds"] = run.get("elapsed_seconds")
            summaries.append(summary)

    return jsonify({
        "runs": summaries,
        "total": len(summaries),
        "remaining": MAX_RUNS - len(summaries),
    })


@app.route("/runs/<run_id>", methods=["GET"])
def get_run(run_id):
    with runs_lock:
        run = runs.get(run_id)

    if run is None:
        return jsonify({"error": "not_found", "message": f"Run {run_id} not found."}), 404

    return jsonify(run)


@app.route("/metrics", methods=["GET"])
def metrics():
    """Scoring metrics — called by the platform at submission time."""
    elapsed = time.time() - START_TIME

    with runs_lock:
        completed_runs = [r for r in runs.values() if r["status"] == "completed"]
        error_runs = [r for r in runs.values() if r["status"] == "error"]

    best_test_accuracy = 0.0
    unique_widths = set()
    effective_params_list = []
    baseline_test_accuracy = 0.82

    for run in completed_runs:
        acc = run.get("test_accuracy", 0)
        if acc > best_test_accuracy:
            best_test_accuracy = acc

        eff = run.get("effective_params", 0)
        if eff > 0:
            effective_params_list.append(eff)

        # Attempt to extract width from training history metadata if available
        history = run.get("training_history", [])
        if history and isinstance(history[0], dict):
            w = history[0].get("width")
            if w is not None:
                unique_widths.add(w)

    return jsonify({
        "runs_completed": len(completed_runs),
        "runs_errored": len(error_runs),
        "runs_total": len(completed_runs) + len(error_runs),
        "max_runs": MAX_RUNS,
        "best_test_accuracy": round(best_test_accuracy, 6),
        "baseline_test_accuracy": baseline_test_accuracy,
        "unique_widths_tested": len(unique_widths),
        "unique_effective_params": len(set(effective_params_list)),
        "effective_params_range": (
            [min(effective_params_list), max(effective_params_list)]
            if effective_params_list else []
        ),
        "n_train": N_TRAIN,
        "n_features": N_FEATURES,
        "noise_level": round(NOISE_LEVEL, 4),
        "elapsed_seconds": round(elapsed, 1),
    })


if __name__ == "__main__":
    print(f"Descent Lab starting on port {PORT}")
    print(f"  SEED={SEED}, MATCH_ID={MATCH_ID}")
    print(f"  Dataset: {N_TRAIN} train, {N_TEST} test, {N_FEATURES} features, "
          f"noise={NOISE_LEVEL:.3f}")
    print(f"  Dataset saved to {DATASET_DIR}")
    app.run(host="0.0.0.0", port=PORT, debug=False)
