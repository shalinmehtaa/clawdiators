"""
Training Lab — HTTP service for autoresearch challenge.

Provides endpoints for agents to submit modified train.py code,
run training, and retrieve results. Runs inside a Docker container
with PyTorch CPU.

Mirrors the autoresearch workflow: submit code -> run training -> get val_bpb.
"""

from __future__ import annotations

import os
import sys
import json
import time
import shutil
import tempfile
import subprocess
import threading
from pathlib import Path

from flask import Flask, request, jsonify

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SEED = int(os.environ.get("SEED", "42"))
MATCH_ID = os.environ.get("MATCH_ID", "local")
MAX_RUNS = 200  # safety cap — budget is the real constraint
TOTAL_TRAINING_BUDGET = int(os.environ.get("TOTAL_TRAINING_BUDGET", "2700"))  # 45 min cumulative
DEFAULT_TIME_BUDGET = 180  # default per-run time budget in seconds
MIN_TIME_BUDGET = 30
MAX_TIME_BUDGET = 300
MATCH_TIME_LIMIT = int(os.environ.get("MATCH_TIME_LIMIT", "10800"))  # 3 hours

# Fixed corpus: Shakespeare
CORPUS_NAME = "shakespeare"

# Paths
APP_DIR = Path(__file__).parent
PREPARE_PY = APP_DIR / "prepare.py"
BASELINE_PY = APP_DIR / "baseline_train.py"
DATA_DIR = APP_DIR / "data"

# Match start time (recorded at server startup, close enough to match start)
MATCH_START_TIME = time.time()

# ---------------------------------------------------------------------------
# Run State
# ---------------------------------------------------------------------------

runs: list[dict] = []
runs_lock = threading.Lock()
active_run: dict | None = None
active_run_lock = threading.Lock()
training_budget_used: float = 0.0
training_budget_lock = threading.Lock()

# Cached baseline val_bpb (computed on first request or from env)
_baseline_val_bpb: float | None = None
_baseline_lock = threading.Lock()


def _get_baseline_val_bpb() -> float | None:
    """Return cached baseline val_bpb, or None if not yet computed."""
    global _baseline_val_bpb
    with _baseline_lock:
        if _baseline_val_bpb is None:
            baseline_file = DATA_DIR / f"{CORPUS_NAME}_baseline.json"
            if baseline_file.exists():
                with open(baseline_file) as f:
                    data = json.load(f)
                    _baseline_val_bpb = data.get("val_bpb")
        return _baseline_val_bpb


def _match_time_remaining() -> float:
    """Seconds remaining in the match."""
    elapsed = time.time() - MATCH_START_TIME
    return max(0.0, MATCH_TIME_LIMIT - elapsed)


def _training_budget_remaining() -> float:
    """Seconds of training budget remaining."""
    with training_budget_lock:
        return max(0.0, TOTAL_TRAINING_BUDGET - training_budget_used)


# ---------------------------------------------------------------------------
# Code execution
# ---------------------------------------------------------------------------

def _run_training(train_code: str, run_id: str, time_budget: int = DEFAULT_TIME_BUDGET) -> dict:
    """
    Execute the agent's train.py in a subprocess and collect results.

    The training script must print a JSON object to stdout with at least
    a 'val_bpb' key. Everything on stderr is treated as logs.
    """
    timeout = time_budget + 30  # dynamic timeout: budget + eval overhead
    tmpdir = tempfile.mkdtemp(prefix=f"autoresearch-{run_id}-")

    try:
        # Write the agent's train.py
        train_path = os.path.join(tmpdir, "train.py")
        with open(train_path, "w") as f:
            f.write(train_code)

        # Copy the fixed prepare.py (agent cannot modify this)
        shutil.copy2(PREPARE_PY, os.path.join(tmpdir, "prepare.py"))

        # Symlink data directory
        data_link = os.path.join(tmpdir, "data")
        os.symlink(str(DATA_DIR / CORPUS_NAME), data_link)

        # Set environment
        env = os.environ.copy()
        env["TORCH_SEED"] = str(SEED)
        env["DATA_DIR"] = data_link
        env["PYTHONUNBUFFERED"] = "1"
        env["TIME_BUDGET"] = str(time_budget)

        # Run training
        start_time = time.time()

        proc = subprocess.run(
            [sys.executable, "train.py"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=env,
        )

        elapsed = time.time() - start_time

        # Parse results from stdout (last JSON line)
        results = None
        stdout_lines = proc.stdout.strip().split("\n") if proc.stdout else []
        for line in reversed(stdout_lines):
            try:
                parsed = json.loads(line.strip())
                if isinstance(parsed, dict) and "val_bpb" in parsed:
                    results = parsed
                    break
            except (json.JSONDecodeError, ValueError):
                continue

        if proc.returncode != 0 and results is None:
            stderr_tail = proc.stderr[-2000:] if proc.stderr else ""
            return {
                "run_id": run_id,
                "status": "error",
                "error": f"Training failed (exit code {proc.returncode}): {stderr_tail}",
                "val_bpb": None,
                "training_time_secs": round(elapsed, 2),
                "logs": proc.stderr[-5000:] if proc.stderr else "",
            }

        if results is None:
            return {
                "run_id": run_id,
                "status": "error",
                "error": "Training completed but no JSON results found on stdout. "
                         "Your train.py must print a JSON object with 'val_bpb' key to stdout.",
                "val_bpb": None,
                "training_time_secs": round(elapsed, 2),
                "logs": proc.stderr[-5000:] if proc.stderr else "",
            }

        return {
            "run_id": run_id,
            "status": "completed",
            "val_bpb": results.get("val_bpb"),
            "train_loss": results.get("train_loss"),
            "total_steps": results.get("total_steps"),
            "training_time_secs": round(elapsed, 2),
            "num_params_M": results.get("num_params_M"),
            "error": None,
            "logs": proc.stderr[-5000:] if proc.stderr else "",
        }

    except subprocess.TimeoutExpired:
        return {
            "run_id": run_id,
            "status": "timeout",
            "error": f"Training exceeded {timeout}s timeout (time_budget={time_budget}s + 30s eval overhead)",
            "val_bpb": None,
            "training_time_secs": timeout,
        }

    except Exception as e:
        return {
            "run_id": run_id,
            "status": "error",
            "error": f"Internal error: {str(e)}",
            "val_bpb": None,
        }

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Syntax check
# ---------------------------------------------------------------------------

def _syntax_check(code: str) -> str | None:
    """Return error message if code has syntax errors, else None."""
    try:
        compile(code, "<train.py>", "exec")
        return None
    except SyntaxError as e:
        return f"SyntaxError at line {e.lineno}: {e.msg}"


# ---------------------------------------------------------------------------
# Async run
# ---------------------------------------------------------------------------

def _run_training_async(train_code: str, run_id: str, time_budget: int = DEFAULT_TIME_BUDGET) -> None:
    """Background thread: run training, store result, track budget."""
    global training_budget_used
    try:
        result = _run_training(train_code, run_id, time_budget)
        result["submitted_at"] = time.time()
        result["time_budget"] = time_budget

        # Track actual training time against cumulative budget
        actual_time = result.get("training_time_secs", 0) or 0
        with training_budget_lock:
            training_budget_used += actual_time

        with runs_lock:
            runs.append(result)

    finally:
        with active_run_lock:
            global active_run
            active_run = None


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "corpus": CORPUS_NAME,
        "seed": SEED,
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
        "training_budget_remaining_secs": round(_training_budget_remaining(), 1),
        "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
    })


@app.route("/baseline", methods=["GET"])
def baseline():
    """Return the baseline train.py source and cached baseline val_bpb."""
    with open(BASELINE_PY) as f:
        source = f.read()

    return jsonify({
        "train_code": source,
        "baseline_val_bpb": _get_baseline_val_bpb(),
        "corpus": CORPUS_NAME,
        "seed": SEED,
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
        "training_budget_remaining_secs": round(_training_budget_remaining(), 1),
        "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
    })


@app.route("/prepare", methods=["GET"])
def prepare():
    """Return the fixed prepare.py source (read-only reference)."""
    with open(PREPARE_PY) as f:
        source = f.read()

    return jsonify({
        "source": source,
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
        "training_budget_remaining_secs": round(_training_budget_remaining(), 1),
        "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
    })


@app.route("/run", methods=["POST"])
def run():
    """Submit modified train.py and run training.

    Returns 202 immediately. Poll GET /runs/{run_id} for results.
    """
    global active_run

    # Check safety cap
    with runs_lock:
        if len(runs) >= MAX_RUNS:
            return jsonify({
                "error": f"Safety cap of {MAX_RUNS} runs reached. Submit your best result.",
                "training_budget_remaining_secs": round(_training_budget_remaining(), 1),
                "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
                "match_time_remaining_secs": round(_match_time_remaining(), 1),
            }), 429

    # Check no active run
    with active_run_lock:
        if active_run is not None:
            return jsonify({
                "error": "A training run is already in progress. Wait for it to complete.",
                "active_run_id": active_run["run_id"],
                "status": "running",
                "match_time_remaining_secs": round(_match_time_remaining(), 1),
                "training_budget_remaining_secs": round(_training_budget_remaining(), 1),
                "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
            }), 409

    # Parse request
    data = request.get_json(force=True, silent=True)
    if not data or "train_code" not in data:
        return jsonify({
            "error": 'Request must include "train_code" field with the training script source.',
        }), 400

    train_code = data["train_code"]
    if not isinstance(train_code, str) or len(train_code) < 50:
        return jsonify({
            "error": "train_code must be a string of at least 50 characters.",
        }), 400

    if len(train_code) > 100_000:
        return jsonify({
            "error": "train_code exceeds 100KB limit.",
        }), 400

    # Parse optional time_budget (default 180s, clamp 30-300)
    time_budget = data.get("time_budget", DEFAULT_TIME_BUDGET)
    try:
        time_budget = int(time_budget)
    except (TypeError, ValueError):
        return jsonify({
            "error": f"time_budget must be an integer (got {type(time_budget).__name__})",
        }), 400
    time_budget = max(MIN_TIME_BUDGET, min(MAX_TIME_BUDGET, time_budget))

    # Check cumulative training budget
    remaining = _training_budget_remaining()
    if remaining <= 0:
        return jsonify({
            "error": "Training budget exhausted. Submit your best result.",
            "training_budget_remaining_secs": 0,
            "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
            "match_time_remaining_secs": round(_match_time_remaining(), 1),
        }), 429

    if time_budget > remaining:
        return jsonify({
            "error": f"Requested time_budget ({time_budget}s) exceeds remaining budget ({remaining:.1f}s). "
                     f"Lower your time_budget or submit your best result.",
            "training_budget_remaining_secs": round(remaining, 1),
            "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
            "match_time_remaining_secs": round(_match_time_remaining(), 1),
        }), 429

    # Syntax check (doesn't consume a run or budget)
    syntax_err = _syntax_check(train_code)
    if syntax_err:
        return jsonify({
            "error": f"Syntax error in submitted code: {syntax_err}",
            "status": "syntax_error",
            "training_budget_remaining_secs": round(_training_budget_remaining(), 1),
            "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
            "match_time_remaining_secs": round(_match_time_remaining(), 1),
        }), 422

    # Assign run ID
    with runs_lock:
        run_id = f"run-{len(runs)}"

    # Mark active
    with active_run_lock:
        active_run = {"run_id": run_id, "started_at": time.time(), "time_budget": time_budget}

    # Launch training in background thread
    thread = threading.Thread(
        target=_run_training_async,
        args=(train_code, run_id, time_budget),
        daemon=True,
    )
    thread.start()

    return jsonify({
        "run_id": run_id,
        "status": "running",
        "time_budget": time_budget,
        "message": "Training started. Poll GET /runs/{run_id} for results.",
        "training_budget_remaining_secs": round(_training_budget_remaining(), 1),
        "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    }), 202


@app.route("/runs", methods=["GET"])
def list_runs():
    """List all runs for this match (including any active run)."""
    with runs_lock:
        summary = []
        for r in runs:
            summary.append({
                "run_id": r["run_id"],
                "status": r["status"],
                "val_bpb": r.get("val_bpb"),
                "training_time_secs": r.get("training_time_secs"),
                "time_budget": r.get("time_budget"),
                "num_params_M": r.get("num_params_M"),
                "error": r.get("error"),
            })

        best_val_bpb = min(
            (r["val_bpb"] for r in runs if r.get("val_bpb") is not None),
            default=None,
        )

    # Include currently active run
    with active_run_lock:
        current_active = None
        if active_run is not None:
            current_active = {
                "run_id": active_run["run_id"],
                "status": "running",
                "time_budget": active_run.get("time_budget"),
                "elapsed_secs": round(time.time() - active_run["started_at"], 1),
            }

    return jsonify({
        "runs": summary,
        "active_run": current_active,
        "total_runs": len(summary) + (1 if current_active else 0),
        "best_val_bpb": best_val_bpb,
        "training_budget_remaining_secs": round(_training_budget_remaining(), 1),
        "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    })


@app.route("/runs/<run_id>", methods=["GET"])
def get_run(run_id: str):
    """Get details for a specific run (completed or in-progress)."""
    # Check completed runs
    with runs_lock:
        for r in runs:
            if r["run_id"] == run_id:
                response = {k: v for k, v in r.items() if k != "logs"}
                response["logs"] = r.get("logs", "")
                response["training_budget_remaining_secs"] = round(_training_budget_remaining(), 1)
                response["training_budget_total_secs"] = TOTAL_TRAINING_BUDGET
                response["match_time_remaining_secs"] = round(_match_time_remaining(), 1)
                return jsonify(response)

    # Check if this is the currently active run
    with active_run_lock:
        if active_run is not None and active_run["run_id"] == run_id:
            elapsed = time.time() - active_run["started_at"]
            tb = active_run.get("time_budget", DEFAULT_TIME_BUDGET)
            return jsonify({
                "run_id": run_id,
                "status": "running",
                "time_budget": tb,
                "elapsed_secs": round(elapsed, 1),
                "timeout_secs": tb + 30,
                "training_budget_remaining_secs": round(_training_budget_remaining(), 1),
                "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
                "match_time_remaining_secs": round(_match_time_remaining(), 1),
            })

    return jsonify({"error": f"Run '{run_id}' not found"}), 404


@app.route("/__internal/metrics", methods=["GET"])
def internal_metrics():
    """
    Internal metrics endpoint for the Clawdiators scorer.
    Returns the best val_bpb achieved and full run history.
    """
    with runs_lock:
        completed_runs = [r for r in runs if r.get("val_bpb") is not None]
        best_val_bpb = min(
            (r["val_bpb"] for r in completed_runs),
            default=None,
        )
        best_run_id = None
        if best_val_bpb is not None:
            for r in completed_runs:
                if r["val_bpb"] == best_val_bpb:
                    best_run_id = r["run_id"]
                    break

        return jsonify({
            "best_val_bpb": best_val_bpb,
            "best_run_id": best_run_id,
            "baseline_val_bpb": _get_baseline_val_bpb(),
            "total_runs": len(runs),
            "completed_runs": len(completed_runs),
            "error_runs": len([r for r in runs if r["status"] == "error"]),
            "training_budget_used_secs": round(training_budget_used, 1),
            "training_budget_total_secs": TOTAL_TRAINING_BUDGET,
            "corpus": CORPUS_NAME,
            "seed": SEED,
            "run_history": [
                {
                    "run_id": r["run_id"],
                    "status": r["status"],
                    "val_bpb": r.get("val_bpb"),
                    "training_time_secs": r.get("training_time_secs"),
                    "time_budget": r.get("time_budget"),
                    "num_params_M": r.get("num_params_M"),
                    "total_steps": r.get("total_steps"),
                }
                for r in runs
            ],
        })


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3000"))

    corpus_dir = DATA_DIR / CORPUS_NAME
    if not corpus_dir.exists():
        print(f"WARNING: Corpus directory not found: {corpus_dir}", file=sys.stderr)
        print(f"Available: {list(DATA_DIR.iterdir()) if DATA_DIR.exists() else 'DATA_DIR missing'}", file=sys.stderr)

    print(f"Training Lab starting", file=sys.stderr)
    print(f"  Seed: {SEED}", file=sys.stderr)
    print(f"  Corpus: {CORPUS_NAME}", file=sys.stderr)
    print(f"  Match: {MATCH_ID}", file=sys.stderr)
    print(f"  Safety cap: {MAX_RUNS} runs", file=sys.stderr)
    print(f"  Training budget: {TOTAL_TRAINING_BUDGET}s ({TOTAL_TRAINING_BUDGET // 60} min cumulative)", file=sys.stderr)
    print(f"  Per-run time budget: {MIN_TIME_BUDGET}-{MAX_TIME_BUDGET}s (default {DEFAULT_TIME_BUDGET}s)", file=sys.stderr)
    print(f"  Match time limit: {MATCH_TIME_LIMIT}s", file=sys.stderr)
    print(f"  Port: {port}", file=sys.stderr)

    app.run(host="0.0.0.0", port=port, debug=False)
