"""
GRN Lab — Gene Regulatory Network Inference

Flask service that generates a true gene regulatory network from SEED,
simulates expression data (wild-type + perturbation time series), and
scores agent-submitted inferred adjacency matrices against the hidden
ground truth using AUROC, AUPR, and related metrics.

Endpoints:
  GET  /health          — Health check
  GET  /info            — Dataset description (genes, timepoints, perturbations)
  GET  /data            — Full expression data (genes x timepoints x conditions)
  GET  /baseline        — Baseline inference code (Pearson correlation)
  POST /run             — Run agent code in subprocess, score output
  POST /submit-network  — Directly submit adjacency matrix for scoring
  GET  /runs            — List all submissions with scores
  GET  /runs/<id>       — Specific submission details
  GET  /metrics         — Scoring metrics for the platform
"""

import json
import os
import subprocess
import sys
import tempfile
import time

import numpy as np
from flask import Flask, jsonify, request
from sklearn.metrics import (
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

app = Flask(__name__)

SEED = int(os.environ.get("SEED", "42"))
MATCH_ID = os.environ.get("MATCH_ID", "local")
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN", "")
PORT = int(os.environ.get("PORT", "3000"))

MAX_RUNS = int(os.environ.get("MAX_RUNS", "30"))
MATCH_TIME_LIMIT = int(os.environ.get("MATCH_TIME_LIMIT", "10800"))
START_TIME = time.time()

N_GENES = 20
N_TIMEPOINTS = 50
N_KNOCKDOWNS = 10
N_OVEREXPRESSIONS = 5
N_PERTURBATIONS = N_KNOCKDOWNS + N_OVEREXPRESSIONS
N_CONDITIONS = 1 + N_PERTURBATIONS  # wild-type + perturbations
TARGET_EDGES = 50
SPARSITY = TARGET_EDGES / (N_GENES * N_GENES)  # ~0.125

runs = []


# ── Network Generation (deterministic from SEED) ────────────────────────

def generate_true_network(seed):
    """Generate a sparse directed regulatory network with activating/repressing edges."""
    rng = np.random.RandomState(seed)

    # Generate sparse adjacency: each entry has SPARSITY probability of being an edge
    mask = rng.random((N_GENES, N_GENES)) < SPARSITY
    np.fill_diagonal(mask, False)  # no self-regulation

    # Edge weights: positive = activating, negative = repressing
    # Magnitude uniformly in [0.3, 1.5]
    magnitudes = rng.uniform(0.3, 1.5, size=(N_GENES, N_GENES))
    signs = rng.choice([-1, 1], size=(N_GENES, N_GENES), p=[0.35, 0.65])
    weights = magnitudes * signs * mask.astype(float)

    # Time delays: 1-3 steps per edge
    delays = rng.randint(1, 4, size=(N_GENES, N_GENES)) * mask.astype(int)

    # Ensure we have roughly TARGET_EDGES edges (adjust if needed)
    actual_edges = int(mask.sum())
    if actual_edges < TARGET_EDGES - 10:
        # Add more edges randomly
        zeros = np.argwhere(~mask & ~np.eye(N_GENES, dtype=bool))
        add_count = min(TARGET_EDGES - actual_edges, len(zeros))
        add_idx = rng.choice(len(zeros), size=add_count, replace=False)
        for idx in add_idx:
            i, j = zeros[idx]
            mask[i, j] = True
            weights[i, j] = rng.uniform(0.3, 1.5) * rng.choice([-1, 1], p=[0.35, 0.65])
            delays[i, j] = rng.randint(1, 4)
    elif actual_edges > TARGET_EDGES + 10:
        # Remove excess edges randomly
        ones = np.argwhere(mask)
        remove_count = actual_edges - TARGET_EDGES
        remove_idx = rng.choice(len(ones), size=remove_count, replace=False)
        for idx in remove_idx:
            i, j = ones[idx]
            mask[i, j] = False
            weights[i, j] = 0.0
            delays[i, j] = 0

    n_edges = int(mask.sum())
    n_activating = int((weights > 0).sum())
    n_repressing = int((weights < 0).sum())

    return {
        "adjacency": weights,
        "mask": mask,
        "delays": delays,
        "n_edges": n_edges,
        "n_activating": n_activating,
        "n_repressing": n_repressing,
    }


# ── Expression Data Simulation ──────────────────────────────────────────

def simulate_expression(network, seed):
    """
    Simulate gene expression dynamics using a simplified ODE model:
        dx/dt = A_delayed @ x + noise
    where A_delayed incorporates time delays.

    Returns expression data for wild-type and perturbation conditions.
    """
    rng = np.random.RandomState(seed + 1000)
    A = network["adjacency"]
    delays = network["delays"]
    mask = network["mask"]

    # Scale A so the system is stable (spectral radius < 1)
    spectral_radius = np.max(np.abs(np.linalg.eigvals(A)))
    if spectral_radius > 0:
        A_scaled = A * (0.85 / max(spectral_radius, 1e-8))
    else:
        A_scaled = A

    all_conditions = []
    condition_labels = []

    def run_dynamics(initial, perturbation_gene=None, perturbation_type=None):
        """Run time-series dynamics for one condition."""
        X = np.zeros((N_TIMEPOINTS, N_GENES))
        X[0] = initial + rng.normal(0, 0.05, N_GENES)

        for t in range(1, N_TIMEPOINTS):
            # Compute regulatory input with time delays
            reg_input = np.zeros(N_GENES)
            for delay_val in [1, 2, 3]:
                if t >= delay_val:
                    delay_mask = (delays == delay_val) & mask
                    A_delay = A_scaled * delay_mask.astype(float)
                    reg_input += A_delay @ X[t - delay_val]

            # Decay toward basal + regulatory input
            decay_rate = 0.15
            basal = 1.0  # basal expression level
            dx = -decay_rate * (X[t - 1] - basal) + 0.25 * reg_input
            X[t] = X[t - 1] + dx + rng.normal(0, 0.02, N_GENES)

            # Enforce perturbation constraints
            if perturbation_gene is not None:
                if perturbation_type == "knockdown":
                    X[t, perturbation_gene] = 0.0
                elif perturbation_type == "overexpression":
                    X[t, perturbation_gene] = 3.0 * basal

            # Keep expression non-negative
            X[t] = np.maximum(X[t], 0.0)

        return X

    # Wild-type condition
    initial = rng.uniform(0.5, 1.5, N_GENES)
    wt_data = run_dynamics(initial)
    all_conditions.append(wt_data)
    condition_labels.append({"type": "wild_type", "gene": None})

    # Knockdown perturbations (10 genes)
    knockdown_genes = rng.choice(N_GENES, size=N_KNOCKDOWNS, replace=False).tolist()
    for gene in knockdown_genes:
        kd_initial = initial.copy()
        kd_initial[gene] = 0.0
        kd_data = run_dynamics(kd_initial, perturbation_gene=gene, perturbation_type="knockdown")
        all_conditions.append(kd_data)
        condition_labels.append({"type": "knockdown", "gene": int(gene)})

    # Overexpression perturbations (5 genes)
    overexpr_genes = rng.choice(N_GENES, size=N_OVEREXPRESSIONS, replace=False).tolist()
    for gene in overexpr_genes:
        oe_initial = initial.copy()
        oe_initial[gene] = 3.0
        oe_data = run_dynamics(oe_initial, perturbation_gene=gene, perturbation_type="overexpression")
        all_conditions.append(oe_data)
        condition_labels.append({"type": "overexpression", "gene": int(gene)})

    # Stack: (n_conditions, n_timepoints, n_genes)
    expression_tensor = np.stack(all_conditions, axis=0)

    return expression_tensor, condition_labels


# ── Scoring ─────────────────────────────────────────────────────────────

def score_adjacency(predicted, true_network):
    """Score a predicted adjacency matrix against the true network."""
    true_adj = true_network["mask"].astype(float)
    n = N_GENES

    # Flatten, excluding diagonal
    mask_off_diag = ~np.eye(n, dtype=bool)
    y_true = true_adj[mask_off_diag].flatten()
    y_pred_raw = np.array(predicted)[mask_off_diag].flatten()

    # Use absolute values as confidence scores for ranking
    y_scores = np.abs(y_pred_raw)

    # AUROC
    try:
        auroc = float(roc_auc_score(y_true, y_scores))
    except ValueError:
        auroc = 0.5

    # AUPR
    try:
        aupr = float(average_precision_score(y_true, y_scores))
    except ValueError:
        aupr = 0.0

    # Binary predictions at optimal threshold (for F1, precision, recall)
    # Try multiple thresholds, pick best F1
    best_f1 = 0.0
    best_thresh = 0.0
    thresholds = np.percentile(y_scores[y_scores > 0], np.arange(10, 95, 5)) if (y_scores > 0).any() else [0.1]
    for thresh in thresholds:
        y_bin = (y_scores >= thresh).astype(int)
        if y_bin.sum() == 0:
            continue
        f1 = float(f1_score(y_true, y_bin, zero_division=0))
        if f1 > best_f1:
            best_f1 = f1
            best_thresh = float(thresh)

    y_binary = (y_scores >= best_thresh).astype(int) if best_thresh > 0 else (y_scores > 0).astype(int)

    precision_val = float(precision_score(y_true, y_binary, zero_division=0))
    recall_val = float(recall_score(y_true, y_binary, zero_division=0))

    # Precision@k (k = true edge count)
    k = int(y_true.sum())
    if k > 0:
        top_k_idx = np.argsort(-y_scores)[:k]
        precision_at_k = float(y_true[top_k_idx].sum() / k)
    else:
        precision_at_k = 0.0

    # Edge statistics
    predicted_edges = int(y_binary.sum())
    true_positives = int((y_binary * y_true).sum())
    false_positives = int((y_binary * (1 - y_true)).sum())
    false_negatives = int(((1 - y_binary) * y_true).sum())

    # Sign accuracy (among correctly predicted edges)
    true_weights = true_network["adjacency"]
    sign_correct = 0
    sign_total = 0
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if true_adj[i, j] > 0 and abs(predicted[i][j]) >= best_thresh:
                sign_total += 1
                if (predicted[i][j] > 0) == (true_weights[i, j] > 0):
                    sign_correct += 1

    sign_accuracy = float(sign_correct / max(1, sign_total))

    # Confidence calibration: correlation between predicted confidence and true edge existence
    try:
        calibration_corr = float(np.corrcoef(y_scores, y_true)[0, 1])
        if np.isnan(calibration_corr):
            calibration_corr = 0.0
    except Exception:
        calibration_corr = 0.0

    return {
        "auroc": round(auroc, 6),
        "aupr": round(aupr, 6),
        "f1": round(best_f1, 6),
        "precision": round(precision_val, 6),
        "recall": round(recall_val, 6),
        "precision_at_k": round(precision_at_k, 6),
        "optimal_threshold": round(best_thresh, 6),
        "predicted_edges": predicted_edges,
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "true_edge_count": k,
        "sign_accuracy": round(sign_accuracy, 6),
        "confidence_calibration": round(calibration_corr, 6),
    }


# ── Generate data on startup ────────────────────────────────────────────

TRUE_NETWORK = generate_true_network(SEED)
EXPRESSION_DATA, CONDITION_LABELS = simulate_expression(TRUE_NETWORK, SEED)

# Pre-compute baseline (Pearson correlation) for reference
def compute_baseline():
    """Baseline: absolute Pearson correlation across all conditions concatenated."""
    # Concatenate all conditions into one long time series
    all_data = EXPRESSION_DATA.reshape(-1, N_GENES)  # (n_conditions * n_timepoints, n_genes)
    corr_matrix = np.corrcoef(all_data.T)  # (n_genes, n_genes)
    np.fill_diagonal(corr_matrix, 0.0)
    return score_adjacency(np.abs(corr_matrix).tolist(), TRUE_NETWORK)

BASELINE_SCORES = compute_baseline()


# ── Flask Routes ────────────────────────────────────────────────────────


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "grn-lab"})


@app.route("/info", methods=["GET"])
def info():
    return jsonify({
        "challenge": "gene-regulatory-network-inference",
        "description": (
            "Infer a gene regulatory network from expression data. "
            "You are given time-series gene expression measurements under "
            "wild-type and perturbation (knockdown/overexpression) conditions. "
            "Submit a predicted 20x20 weighted directed adjacency matrix. "
            "Positive weights indicate activating regulation, negative weights "
            "indicate repressing regulation. Scored by AUROC and AUPR against "
            "the hidden true network."
        ),
        "dataset": {
            "n_genes": N_GENES,
            "n_timepoints": N_TIMEPOINTS,
            "n_conditions": N_CONDITIONS,
            "n_perturbations": N_PERTURBATIONS,
            "perturbation_types": {
                "knockdown": N_KNOCKDOWNS,
                "overexpression": N_OVEREXPRESSIONS,
            },
            "data_shape": f"{N_CONDITIONS} conditions x {N_TIMEPOINTS} timepoints x {N_GENES} genes",
            "description": (
                f"Time-series expression data for {N_GENES} genes across "
                f"{N_TIMEPOINTS} timepoints. Includes 1 wild-type condition, "
                f"{N_KNOCKDOWNS} single-gene knockdowns, and "
                f"{N_OVEREXPRESSIONS} overexpressions."
            ),
        },
        "submission": {
            "format": "20x20 weighted directed adjacency matrix (list of lists)",
            "endpoint": "POST /submit-network with {\"adjacency_matrix\": [[...], ...]}",
            "alternative": "POST /run with {\"code\": \"...\"} to run inference code",
            "scoring": "AUROC, AUPR, precision@k, F1 against hidden true network",
        },
        "max_runs": MAX_RUNS,
        "runs_remaining": MAX_RUNS - len(runs),
        "hints": [
            "Perturbation data is very informative for inferring edge directionality.",
            "Knockdown of gene X reveals which genes are downstream of X.",
            "Consider methods like GENIE3, Granger causality, or NOTEARS.",
            "Combining correlation with perturbation-based directional evidence is effective.",
            "The baseline (Pearson correlation) achieves AUROC ~0.58.",
            "Good methods should reach AUROC 0.75-0.85; excellent methods 0.85-0.93.",
        ],
    })


@app.route("/data", methods=["GET"])
def get_data():
    """Return full expression data as JSON."""
    # Convert numpy to nested lists
    data_list = EXPRESSION_DATA.tolist()  # (n_conditions, n_timepoints, n_genes)

    gene_names = [f"gene_{i:02d}" for i in range(N_GENES)]

    return jsonify({
        "gene_names": gene_names,
        "conditions": CONDITION_LABELS,
        "expression_data": data_list,
        "shape": {
            "n_conditions": N_CONDITIONS,
            "n_timepoints": N_TIMEPOINTS,
            "n_genes": N_GENES,
        },
        "notes": [
            "expression_data[c][t][g] = expression level of gene g at timepoint t in condition c",
            "Condition 0 is wild-type; subsequent conditions are perturbations.",
            "Knockdown sets target gene expression to 0.",
            "Overexpression sets target gene expression to ~3x basal level.",
        ],
    })


@app.route("/baseline", methods=["GET"])
def baseline():
    """Return baseline inference code and its scores."""
    baseline_code = """import json, sys
import numpy as np

# Load expression data from stdin
data = json.load(sys.stdin)
expression = np.array(data["expression_data"])  # (n_conditions, n_timepoints, n_genes)
n_genes = expression.shape[2]

# Baseline: Pearson correlation across all conditions concatenated
all_data = expression.reshape(-1, n_genes)  # (n_conditions * n_timepoints, n_genes)
corr = np.corrcoef(all_data.T)  # (n_genes, n_genes)
np.fill_diagonal(corr, 0.0)

# Use absolute correlation as edge confidence
adjacency = np.abs(corr).tolist()

# Output adjacency matrix as JSON
print(json.dumps({"adjacency_matrix": adjacency}))
"""
    return jsonify({
        "description": (
            "Baseline method: absolute Pearson correlation across all conditions. "
            "This captures co-expression but cannot determine directionality. "
            "Expected AUROC ~0.58."
        ),
        "code": baseline_code,
        "baseline_scores": BASELINE_SCORES,
    })


@app.route("/run", methods=["POST"])
def run_code():
    """Run agent-submitted inference code, score the output."""
    elapsed = time.time() - START_TIME
    if elapsed > MATCH_TIME_LIMIT:
        return jsonify({
            "error": "time_limit_exceeded",
            "message": f"Match time limit of {MATCH_TIME_LIMIT}s exceeded.",
            "elapsed_seconds": round(elapsed, 1),
        }), 400

    if len(runs) >= MAX_RUNS:
        return jsonify({
            "error": "run_limit_reached",
            "message": f"Maximum {MAX_RUNS} runs allowed. Use GET /runs to review results.",
            "runs_completed": len(runs),
        }), 429

    data = request.get_json(silent=True) or {}
    code = data.get("code", "")
    if not code.strip():
        return jsonify({"error": "missing_code", "message": "Provide 'code' field with Python inference code."}), 400

    # Prepare expression data as JSON for stdin
    input_data = json.dumps({
        "expression_data": EXPRESSION_DATA.tolist(),
        "conditions": CONDITION_LABELS,
        "gene_names": [f"gene_{i:02d}" for i in range(N_GENES)],
        "n_genes": N_GENES,
        "n_timepoints": N_TIMEPOINTS,
        "n_conditions": N_CONDITIONS,
    })

    # Write agent code to temp file and run
    run_id = f"run-{len(runs):03d}"
    start = time.time()
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
            f.write(code)
            code_path = f.name

        run_env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "PYTHONUNBUFFERED": "1",
        }
        result = subprocess.run(
            [sys.executable, code_path],
            input=input_data,
            capture_output=True,
            text=True,
            timeout=120,
            env=run_env,
        )
        os.unlink(code_path)

        runtime = round(time.time() - start, 3)

        if result.returncode != 0:
            run_record = {
                "run_id": run_id,
                "status": "error",
                "error": "execution_failed",
                "stderr": result.stderr[:2000],
                "runtime_seconds": runtime,
                "submitted_at": round(elapsed, 1),
            }
            runs.append(run_record)
            return jsonify(run_record), 400

        # Parse output — expect JSON with adjacency_matrix
        try:
            output = json.loads(result.stdout.strip())
            adj_matrix = output.get("adjacency_matrix")
            if adj_matrix is None:
                raise ValueError("Output must contain 'adjacency_matrix' key")
        except (json.JSONDecodeError, ValueError) as e:
            run_record = {
                "run_id": run_id,
                "status": "error",
                "error": "invalid_output",
                "message": str(e),
                "stdout_preview": result.stdout[:1000],
                "runtime_seconds": runtime,
                "submitted_at": round(elapsed, 1),
            }
            runs.append(run_record)
            return jsonify(run_record), 400

        # Validate matrix dimensions
        adj_array = np.array(adj_matrix, dtype=float)
        if adj_array.shape != (N_GENES, N_GENES):
            run_record = {
                "run_id": run_id,
                "status": "error",
                "error": "invalid_dimensions",
                "message": f"Expected {N_GENES}x{N_GENES} matrix, got {adj_array.shape}",
                "runtime_seconds": runtime,
                "submitted_at": round(elapsed, 1),
            }
            runs.append(run_record)
            return jsonify(run_record), 400

        # Score the submission
        scores = score_adjacency(adj_array.tolist(), TRUE_NETWORK)

        run_record = {
            "run_id": run_id,
            "status": "success",
            "scores": scores,
            "runtime_seconds": runtime,
            "submitted_at": round(elapsed, 1),
            "method": "code_execution",
        }
        runs.append(run_record)
        return jsonify(run_record)

    except subprocess.TimeoutExpired:
        os.unlink(code_path)
        runtime = round(time.time() - start, 3)
        run_record = {
            "run_id": run_id,
            "status": "error",
            "error": "timeout",
            "message": "Code execution exceeded 120 second time limit.",
            "runtime_seconds": runtime,
            "submitted_at": round(elapsed, 1),
        }
        runs.append(run_record)
        return jsonify(run_record), 400

    except Exception as e:
        runtime = round(time.time() - start, 3)
        run_record = {
            "run_id": run_id,
            "status": "error",
            "error": "internal_error",
            "message": str(e)[:500],
            "runtime_seconds": runtime,
            "submitted_at": round(elapsed, 1),
        }
        runs.append(run_record)
        return jsonify(run_record), 500


@app.route("/submit-network", methods=["POST"])
def submit_network():
    """Directly submit a 20x20 weighted directed adjacency matrix for scoring."""
    elapsed = time.time() - START_TIME
    if elapsed > MATCH_TIME_LIMIT:
        return jsonify({
            "error": "time_limit_exceeded",
            "message": f"Match time limit of {MATCH_TIME_LIMIT}s exceeded.",
            "elapsed_seconds": round(elapsed, 1),
        }), 400

    if len(runs) >= MAX_RUNS:
        return jsonify({
            "error": "run_limit_reached",
            "message": f"Maximum {MAX_RUNS} runs allowed. Use GET /runs to review results.",
            "runs_completed": len(runs),
        }), 429

    data = request.get_json(silent=True) or {}
    adj_matrix = data.get("adjacency_matrix")
    if adj_matrix is None:
        return jsonify({
            "error": "missing_field",
            "message": "Provide 'adjacency_matrix' as a 20x20 list of lists.",
        }), 400

    run_id = f"run-{len(runs):03d}"

    try:
        adj_array = np.array(adj_matrix, dtype=float)
    except (ValueError, TypeError) as e:
        run_record = {
            "run_id": run_id,
            "status": "error",
            "error": "invalid_matrix",
            "message": f"Could not parse adjacency matrix: {str(e)[:200]}",
            "submitted_at": round(elapsed, 1),
        }
        runs.append(run_record)
        return jsonify(run_record), 400

    if adj_array.shape != (N_GENES, N_GENES):
        run_record = {
            "run_id": run_id,
            "status": "error",
            "error": "invalid_dimensions",
            "message": f"Expected {N_GENES}x{N_GENES} matrix, got {adj_array.shape}",
            "submitted_at": round(elapsed, 1),
        }
        runs.append(run_record)
        return jsonify(run_record), 400

    if np.any(np.isnan(adj_array)) or np.any(np.isinf(adj_array)):
        run_record = {
            "run_id": run_id,
            "status": "error",
            "error": "invalid_values",
            "message": "Adjacency matrix contains NaN or Inf values.",
            "submitted_at": round(elapsed, 1),
        }
        runs.append(run_record)
        return jsonify(run_record), 400

    # Score the submission
    scores = score_adjacency(adj_array.tolist(), TRUE_NETWORK)

    run_record = {
        "run_id": run_id,
        "status": "success",
        "scores": scores,
        "submitted_at": round(elapsed, 1),
        "method": "direct_submission",
    }
    runs.append(run_record)
    return jsonify(run_record)


@app.route("/runs", methods=["GET"])
def list_runs():
    """List all submissions with scores."""
    summaries = []
    for run in runs:
        summary = {
            "run_id": run["run_id"],
            "status": run["status"],
            "submitted_at": run["submitted_at"],
            "method": run.get("method"),
        }
        if run["status"] == "success":
            summary["auroc"] = run["scores"]["auroc"]
            summary["aupr"] = run["scores"]["aupr"]
            summary["f1"] = run["scores"]["f1"]
        elif run["status"] == "error":
            summary["error"] = run.get("error")
        summaries.append(summary)

    return jsonify({
        "runs": summaries,
        "total": len(runs),
        "remaining": MAX_RUNS - len(runs),
    })


@app.route("/runs/<run_id>", methods=["GET"])
def get_run(run_id):
    """Get specific submission details."""
    for run in runs:
        if run["run_id"] == run_id:
            return jsonify(run)
    return jsonify({"error": "not_found", "message": f"Run '{run_id}' not found."}), 404


@app.route("/metrics", methods=["GET"])
def metrics():
    """Scoring metrics — called by the platform at submission time."""
    elapsed = time.time() - START_TIME

    best_auroc = 0.0
    best_aupr = 0.0
    successful_runs = 0

    for run in runs:
        if run["status"] == "success":
            successful_runs += 1
            auroc = run["scores"]["auroc"]
            aupr = run["scores"]["aupr"]
            if auroc > best_auroc:
                best_auroc = auroc
            if aupr > best_aupr:
                best_aupr = aupr

    return jsonify({
        "best_auroc": round(best_auroc, 6),
        "best_aupr": round(best_aupr, 6),
        "baseline_auroc": BASELINE_SCORES["auroc"],
        "baseline_aupr": BASELINE_SCORES["aupr"],
        "runs_count": len(runs),
        "successful_runs": successful_runs,
        "max_runs": MAX_RUNS,
        "true_edge_count": TRUE_NETWORK["n_edges"],
        "n_activating": TRUE_NETWORK["n_activating"],
        "n_repressing": TRUE_NETWORK["n_repressing"],
        "elapsed_seconds": round(elapsed, 1),
    })


if __name__ == "__main__":
    print(f"GRN Lab starting | SEED={SEED} | edges={TRUE_NETWORK['n_edges']} "
          f"({TRUE_NETWORK['n_activating']} act, {TRUE_NETWORK['n_repressing']} rep) | "
          f"baseline AUROC={BASELINE_SCORES['auroc']:.4f}", flush=True)
    app.run(host="0.0.0.0", port=PORT, debug=False)
