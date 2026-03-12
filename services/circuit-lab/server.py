"""
Circuit Lab — Pre-trained Transformer for Mechanistic Interpretability

Flask service that trains a small 2-layer transformer on modular addition
at startup (until grokked), then exposes it for agents to analyse.
Agents submit analysis code via POST /run, which executes in a subprocess
with access to the trained model and helper functions for capturing
activations, attention patterns, ablation, and probing.

Endpoints:
  GET  /health          — Health check
  GET  /model-info      — Architecture details and baseline accuracy
  GET  /baseline        — Starter analysis code snippets
  POST /run             — Submit analysis code, get JSON results
  POST /verify-circuit  — Ablate claimed circuit, compare to random ablation
  GET  /runs            — List all runs
  GET  /runs/<id>       — Specific run details
  GET  /metrics         — Scoring metrics (best circuit quality, ablation results)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import shutil
import textwrap
import threading
import time

from flask import Flask, jsonify, request

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SEED = int(os.environ.get("SEED", "42"))
MATCH_ID = os.environ.get("MATCH_ID", "local")
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN", "")
PORT = int(os.environ.get("PORT", "3000"))

MAX_RUNS = int(os.environ.get("MAX_RUNS", "50"))
RUN_TIMEOUT = int(os.environ.get("RUN_TIMEOUT", "60"))
MATCH_TIME_LIMIT = int(os.environ.get("MATCH_TIME_LIMIT", "10800"))

MATCH_START_TIME = time.time()
MODEL_DIR = os.path.join(os.path.dirname(__file__) or ".", "_model")

# ---------------------------------------------------------------------------
# Seed-derived prime
# ---------------------------------------------------------------------------

def _select_prime(seed: int) -> int:
    """Pick a prime in [59, 113] deterministically from seed."""
    primes = [59, 61, 67, 71, 73, 79, 83, 89, 97, 101, 103, 107, 109, 113]
    import hashlib
    h = int(hashlib.sha256(str(seed).encode()).hexdigest()[:8], 16)
    return primes[h % len(primes)]

P = _select_prime(SEED)

# Architecture constants
N_LAYERS = 2
N_HEADS = 4
D_MODEL = 128
D_HEAD = D_MODEL // N_HEADS  # 32
D_MLP = D_MODEL * 4          # 512

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

runs: list[dict] = []
runs_lock = threading.Lock()
model_ready = threading.Event()
baseline_accuracy: float = 0.0
training_info: dict = {}


# ---------------------------------------------------------------------------
# Model definition (self-contained, also written to temp dirs for agent code)
# ---------------------------------------------------------------------------

MODEL_SOURCE = textwrap.dedent('''\
import math
import torch
import torch.nn as nn
import torch.nn.functional as F


class Attention(nn.Module):
    def __init__(self, d_model, n_heads):
        super().__init__()
        self.n_heads = n_heads
        self.d_head = d_model // n_heads
        self.W_Q = nn.Linear(d_model, d_model, bias=False)
        self.W_K = nn.Linear(d_model, d_model, bias=False)
        self.W_V = nn.Linear(d_model, d_model, bias=False)
        self.W_O = nn.Linear(d_model, d_model, bias=False)

    def forward(self, x, return_attn=False):
        B, T, C = x.shape
        q = self.W_Q(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        k = self.W_K(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        v = self.W_V(x).view(B, T, self.n_heads, self.d_head).transpose(1, 2)
        attn = (q @ k.transpose(-2, -1)) / math.sqrt(self.d_head)
        attn = F.softmax(attn, dim=-1)
        out = (attn @ v).transpose(1, 2).contiguous().view(B, T, C)
        out = self.W_O(out)
        if return_attn:
            return out, attn
        return out


class MLP(nn.Module):
    def __init__(self, d_model, d_mlp):
        super().__init__()
        self.W_in = nn.Linear(d_model, d_mlp, bias=True)
        self.W_out = nn.Linear(d_mlp, d_model, bias=True)

    def forward(self, x):
        return self.W_out(F.gelu(self.W_in(x)))


class TransformerBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_mlp):
        super().__init__()
        self.ln1 = nn.LayerNorm(d_model)
        self.attn = Attention(d_model, n_heads)
        self.ln2 = nn.LayerNorm(d_model)
        self.mlp = MLP(d_model, d_mlp)

    def forward(self, x, return_attn=False):
        if return_attn:
            attn_out, attn_weights = self.attn(self.ln1(x), return_attn=True)
            x = x + attn_out
            x = x + self.mlp(self.ln2(x))
            return x, attn_weights
        x = x + self.attn(self.ln1(x))
        x = x + self.mlp(self.ln2(x))
        return x


class ModularAdditionTransformer(nn.Module):
    """
    2-layer transformer for (a + b) mod p.
    Input: 3 tokens [a, b, =] -> predict output at position 2.
    """
    def __init__(self, p, n_layers=2, n_heads=4, d_model=128, d_mlp=512):
        super().__init__()
        self.p = p
        self.n_layers = n_layers
        self.n_heads = n_heads
        self.d_model = d_model
        self.d_mlp = d_mlp
        # Embedding: p values + 1 special "=" token
        self.tok_embed = nn.Embedding(p + 1, d_model)
        self.pos_embed = nn.Embedding(3, d_model)
        self.blocks = nn.ModuleList([
            TransformerBlock(d_model, n_heads, d_mlp) for _ in range(n_layers)
        ])
        self.ln_final = nn.LayerNorm(d_model)
        self.unembed = nn.Linear(d_model, p, bias=False)

    def forward(self, x, return_intermediates=False):
        B, T = x.shape
        positions = torch.arange(T, device=x.device).unsqueeze(0).expand(B, T)
        h = self.tok_embed(x) + self.pos_embed(positions)

        intermediates = {"embeddings": h.detach()}
        attn_weights_all = []

        for i, block in enumerate(self.blocks):
            h, attn_w = block(h, return_attn=True)
            attn_weights_all.append(attn_w.detach())
            intermediates[f"layer_{i}_output"] = h.detach()

        h = self.ln_final(h)
        logits = self.unembed(h[:, -1, :])  # predict at last position

        if return_intermediates:
            intermediates["attention_weights"] = attn_weights_all
            intermediates["final_hidden"] = h.detach()
            return logits, intermediates
        return logits


def make_dataset(p):
    """Create full (a+b) mod p dataset. Returns inputs [B,3] and targets [B]."""
    pairs = []
    targets = []
    eq_token = p  # special "=" token id
    for a in range(p):
        for b in range(p):
            pairs.append([a, b, eq_token])
            targets.append((a + b) % p)
    return torch.tensor(pairs, dtype=torch.long), torch.tensor(targets, dtype=torch.long)
''')


# ---------------------------------------------------------------------------
# Helper functions source (injected into agent's subprocess)
# ---------------------------------------------------------------------------

HELPERS_SOURCE = textwrap.dedent('''\
import json
import sys
import torch
import os

# Silence warnings
import warnings
warnings.filterwarnings("ignore")

# Import model definition
sys.path.insert(0, os.environ.get("_MODEL_SRC_DIR", "."))
from _model_def import (
    ModularAdditionTransformer, make_dataset,
)

_P = int(os.environ["_CIRCUIT_LAB_P"])
_MODEL_PATH = os.environ["_CIRCUIT_LAB_MODEL_PATH"]
_D_MODEL = int(os.environ.get("_CIRCUIT_LAB_D_MODEL", "128"))
_N_HEADS = int(os.environ.get("_CIRCUIT_LAB_N_HEADS", "4"))
_N_LAYERS = int(os.environ.get("_CIRCUIT_LAB_N_LAYERS", "2"))
_D_MLP = int(os.environ.get("_CIRCUIT_LAB_D_MLP", "512"))


def load_model():
    """Load the pre-trained grokked transformer. Returns (model, p)."""
    model = ModularAdditionTransformer(
        p=_P, n_layers=_N_LAYERS, n_heads=_N_HEADS,
        d_model=_D_MODEL, d_mlp=_D_MLP,
    )
    model.load_state_dict(torch.load(_MODEL_PATH, map_location="cpu", weights_only=True))
    model.eval()
    return model, _P


def get_activations(model, inputs, layer):
    """
    Get activations at a specific layer.
    Args:
        model: the transformer
        inputs: tensor of shape [B, 3]
        layer: int, 0-indexed layer number
    Returns: dict with "residual" [B, 3, d_model], "attn_out", "mlp_out"
    """
    with torch.no_grad():
        B, T = inputs.shape
        positions = torch.arange(T, device=inputs.device).unsqueeze(0).expand(B, T)
        h = model.tok_embed(inputs) + model.pos_embed(positions)

        for i, block in enumerate(model.blocks):
            ln1_out = block.ln1(h)
            attn_out, attn_w = block.attn(ln1_out, return_attn=True)
            h_post_attn = h + attn_out
            ln2_out = block.ln2(h_post_attn)
            mlp_out = block.mlp(ln2_out)
            h = h_post_attn + mlp_out

            if i == layer:
                return {
                    "residual": h.numpy().tolist(),
                    "attn_out": attn_out.numpy().tolist(),
                    "mlp_out": mlp_out.numpy().tolist(),
                    "attention_weights": attn_w.numpy().tolist(),
                }
    return {"error": f"Layer {layer} not found (model has {_N_LAYERS} layers)"}


def get_attention_patterns(model, inputs):
    """
    Get attention weight matrices for all layers and heads.
    Args:
        model: the transformer
        inputs: tensor of shape [B, 3]
    Returns: dict mapping "layer_0", "layer_1" etc. to [B, n_heads, 3, 3] lists
    """
    with torch.no_grad():
        _, intermediates = model(inputs, return_intermediates=True)
        result = {}
        for i, attn_w in enumerate(intermediates["attention_weights"]):
            result[f"layer_{i}"] = attn_w.numpy().tolist()
        return result


def ablate_components(model, heads=None, neurons=None, inputs=None, targets=None):
    """
    Ablate specified components and measure accuracy.
    Args:
        model: the transformer
        heads: list of [layer, head_idx] pairs to zero out
        neurons: list of [layer, neuron_idx] pairs to zero out in MLP
        inputs: tensor [B, 3]
        targets: tensor [B]
    Returns: dict with accuracy, correct count, total count
    """
    import copy
    heads = heads or []
    neurons = neurons or []

    if inputs is None or targets is None:
        inputs, targets = make_dataset(_P)

    ablated = copy.deepcopy(model)
    ablated.eval()

    # Zero out attention heads
    for layer_idx, head_idx in heads:
        if layer_idx < len(ablated.blocks):
            block = ablated.blocks[layer_idx]
            d_head = _D_MODEL // _N_HEADS
            start = head_idx * d_head
            end = start + d_head
            with torch.no_grad():
                block.attn.W_O.weight[:, start:end] = 0.0

    # Zero out MLP neurons
    for layer_idx, neuron_idx in neurons:
        if layer_idx < len(ablated.blocks):
            block = ablated.blocks[layer_idx]
            with torch.no_grad():
                block.mlp.W_out.weight[:, neuron_idx] = 0.0
                if neuron_idx < block.mlp.W_in.weight.shape[0]:
                    block.mlp.W_in.weight[neuron_idx, :] = 0.0
                    if block.mlp.W_in.bias is not None:
                        block.mlp.W_in.bias[neuron_idx] = 0.0

    with torch.no_grad():
        logits = ablated(inputs)
        preds = logits.argmax(dim=-1)
        correct = (preds == targets).sum().item()
        total = targets.shape[0]

    return {
        "accuracy": correct / total,
        "correct": correct,
        "total": total,
        "heads_ablated": len(heads),
        "neurons_ablated": len(neurons),
    }


def run_probe(activations, labels, test_frac=0.2):
    """
    Train a linear probing classifier on activations.
    Args:
        activations: list or tensor of shape [N, d]
        labels: list or tensor of shape [N]
        test_frac: fraction held out for test
    Returns: dict with train_acc, test_acc, n_train, n_test
    """
    import torch.nn as nn
    import torch.optim as optim

    if not isinstance(activations, torch.Tensor):
        activations = torch.tensor(activations, dtype=torch.float32)
    if not isinstance(labels, torch.Tensor):
        labels = torch.tensor(labels, dtype=torch.long)

    N = activations.shape[0]
    n_test = max(1, int(N * test_frac))
    n_train = N - n_test

    # Deterministic split
    perm = torch.randperm(N, generator=torch.Generator().manual_seed(42))
    train_idx = perm[:n_train]
    test_idx = perm[n_train:]

    X_train, y_train = activations[train_idx], labels[train_idx]
    X_test, y_test = activations[test_idx], labels[test_idx]

    n_classes = int(labels.max().item()) + 1
    d_in = activations.shape[1]

    probe = nn.Linear(d_in, n_classes)
    opt = optim.Adam(probe.parameters(), lr=1e-2)

    for _ in range(200):
        logits = probe(X_train)
        loss = nn.functional.cross_entropy(logits, y_train)
        opt.zero_grad()
        loss.backward()
        opt.step()

    with torch.no_grad():
        train_acc = (probe(X_train).argmax(-1) == y_train).float().mean().item()
        test_acc = (probe(X_test).argmax(-1) == y_test).float().mean().item()

    return {
        "train_acc": round(train_acc, 4),
        "test_acc": round(test_acc, 4),
        "n_train": n_train,
        "n_test": n_test,
    }
''')


# ---------------------------------------------------------------------------
# Training (runs once at startup)
# ---------------------------------------------------------------------------

def _train_model():
    """Train the modular addition transformer to grokking. Blocks until done."""
    global baseline_accuracy, training_info

    import torch
    import torch.nn as nn

    # Make everything deterministic
    torch.manual_seed(SEED)

    # We need the model classes — exec the model source in a temp namespace
    ns = {}
    exec(MODEL_SOURCE, ns)
    ModularAdditionTransformer = ns["ModularAdditionTransformer"]
    make_dataset = ns["make_dataset"]

    model = ModularAdditionTransformer(
        p=P, n_layers=N_LAYERS, n_heads=N_HEADS,
        d_model=D_MODEL, d_mlp=D_MLP,
    )

    inputs, targets = make_dataset(P)
    N = inputs.shape[0]  # p*p

    # Train/test split: 50% train, 50% test (standard for grokking experiments)
    torch.manual_seed(SEED)
    perm = torch.randperm(N)
    n_train = N // 2
    train_idx = perm[:n_train]
    test_idx = perm[n_train:]

    train_inputs, train_targets = inputs[train_idx], targets[train_idx]
    test_inputs, test_targets = inputs[test_idx], targets[test_idx]

    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1.0)
    criterion = nn.CrossEntropyLoss()

    max_epochs = 30000
    batch_size = min(512, n_train)
    log_interval = 500

    print(f"[circuit-lab] Training transformer on ({P}): p={P}, "
          f"n_train={n_train}, n_test={N - n_train}", file=sys.stderr)
    print(f"[circuit-lab] Architecture: {N_LAYERS} layers, {N_HEADS} heads, "
          f"d_model={D_MODEL}, d_mlp={D_MLP}", file=sys.stderr)

    train_start = time.time()
    grokked_epoch = None

    for epoch in range(1, max_epochs + 1):
        model.train()

        # Shuffle training data
        g = torch.Generator().manual_seed(SEED + epoch)
        shuffle = torch.randperm(n_train, generator=g)

        epoch_loss = 0.0
        n_batches = 0
        for i in range(0, n_train, batch_size):
            idx = shuffle[i:i + batch_size]
            logits = model(train_inputs[idx])
            loss = criterion(logits, train_targets[idx])
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item()
            n_batches += 1

        if epoch % log_interval == 0 or epoch == 1:
            model.eval()
            with torch.no_grad():
                train_logits = model(train_inputs)
                train_acc = (train_logits.argmax(-1) == train_targets).float().mean().item()
                test_logits = model(test_inputs)
                test_acc = (test_logits.argmax(-1) == test_targets).float().mean().item()

            elapsed = time.time() - train_start
            print(f"[circuit-lab] Epoch {epoch:5d} | "
                  f"loss={epoch_loss / n_batches:.4f} | "
                  f"train_acc={train_acc:.4f} | "
                  f"test_acc={test_acc:.4f} | "
                  f"{elapsed:.1f}s", file=sys.stderr)

            # Grokking: test accuracy > 95%
            if test_acc > 0.95 and grokked_epoch is None:
                grokked_epoch = epoch
                print(f"[circuit-lab] GROKKED at epoch {epoch}!", file=sys.stderr)

            # Stop once firmly grokked (99%+ test accuracy)
            if test_acc > 0.99:
                print(f"[circuit-lab] Reached {test_acc:.4f} test accuracy, stopping.",
                      file=sys.stderr)
                break

    # Final evaluation
    model.eval()
    with torch.no_grad():
        all_logits = model(inputs)
        all_acc = (all_logits.argmax(-1) == targets).float().mean().item()
        test_logits = model(test_inputs)
        test_acc = (test_logits.argmax(-1) == test_targets).float().mean().item()
        train_logits = model(train_inputs)
        train_acc = (train_logits.argmax(-1) == train_targets).float().mean().item()

    baseline_accuracy = all_acc
    training_info = {
        "epochs_trained": epoch,
        "grokked_epoch": grokked_epoch,
        "final_train_acc": round(train_acc, 6),
        "final_test_acc": round(test_acc, 6),
        "full_dataset_acc": round(all_acc, 6),
        "training_time_secs": round(time.time() - train_start, 1),
        "n_train": n_train,
        "n_test": N - n_train,
    }

    # Save model
    os.makedirs(MODEL_DIR, exist_ok=True)
    model_path = os.path.join(MODEL_DIR, "model.pt")
    torch.save(model.state_dict(), model_path)

    # Save model definition source for subprocess use
    model_def_path = os.path.join(MODEL_DIR, "_model_def.py")
    with open(model_def_path, "w") as f:
        f.write(MODEL_SOURCE)

    print(f"[circuit-lab] Model saved to {model_path}", file=sys.stderr)
    print(f"[circuit-lab] Training info: {json.dumps(training_info)}", file=sys.stderr)

    model_ready.set()


# ---------------------------------------------------------------------------
# Code execution
# ---------------------------------------------------------------------------

def _execute_analysis(code: str, run_id: str) -> dict:
    """Run agent analysis code in a subprocess with model access."""
    tmpdir = tempfile.mkdtemp(prefix=f"circuit-lab-{run_id}-")

    try:
        # Write agent code
        agent_script = os.path.join(tmpdir, "agent_code.py")
        with open(agent_script, "w") as f:
            # Inject helpers, then agent code
            f.write("# --- Circuit Lab Helpers ---\n")
            f.write(HELPERS_SOURCE)
            f.write("\n\n# --- Agent Code ---\n")
            f.write(code)

        # Copy model definition
        shutil.copy2(
            os.path.join(MODEL_DIR, "_model_def.py"),
            os.path.join(tmpdir, "_model_def.py"),
        )

        env = {
            "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            "PYTHONUNBUFFERED": "1",
            "_CIRCUIT_LAB_P": str(P),
            "_CIRCUIT_LAB_MODEL_PATH": os.path.join(MODEL_DIR, "model.pt"),
            "_CIRCUIT_LAB_D_MODEL": str(D_MODEL),
            "_CIRCUIT_LAB_N_HEADS": str(N_HEADS),
            "_CIRCUIT_LAB_N_LAYERS": str(N_LAYERS),
            "_CIRCUIT_LAB_D_MLP": str(D_MLP),
            "_MODEL_SRC_DIR": tmpdir,
        }

        start = time.time()

        proc = subprocess.run(
            [sys.executable, "agent_code.py"],
            cwd=tmpdir,
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT,
            env=env,
        )

        elapsed = time.time() - start

        # Parse JSON results from stdout (last JSON object)
        result_data = None
        stdout_lines = proc.stdout.strip().split("\n") if proc.stdout else []
        for line in reversed(stdout_lines):
            line = line.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
                if isinstance(parsed, dict):
                    result_data = parsed
                    break
            except (json.JSONDecodeError, ValueError):
                continue

        stderr_tail = proc.stderr[-3000:] if proc.stderr else ""

        if proc.returncode != 0 and result_data is None:
            return {
                "run_id": run_id,
                "status": "error",
                "error": f"Code failed (exit {proc.returncode}): {stderr_tail}",
                "result": None,
                "elapsed_secs": round(elapsed, 2),
                "stdout": proc.stdout[-3000:] if proc.stdout else "",
                "stderr": stderr_tail,
            }

        return {
            "run_id": run_id,
            "status": "completed",
            "result": result_data,
            "elapsed_secs": round(elapsed, 2),
            "stdout": proc.stdout[-3000:] if proc.stdout else "",
            "stderr": stderr_tail,
            "error": None,
        }

    except subprocess.TimeoutExpired:
        return {
            "run_id": run_id,
            "status": "timeout",
            "error": f"Analysis code exceeded {RUN_TIMEOUT}s timeout",
            "result": None,
            "elapsed_secs": RUN_TIMEOUT,
            "stdout": "",
            "stderr": "",
        }

    except Exception as e:
        return {
            "run_id": run_id,
            "status": "error",
            "error": f"Internal error: {str(e)}",
            "result": None,
            "elapsed_secs": 0,
            "stdout": "",
            "stderr": "",
        }

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _verify_circuit_internal(heads: list, neurons: list) -> dict:
    """Ablate the claimed circuit and a random comparison set."""
    import torch
    import copy
    import hashlib as _hl

    # Load model
    ns = {}
    exec(MODEL_SOURCE, ns)
    ModularAdditionTransformer = ns["ModularAdditionTransformer"]
    make_dataset = ns["make_dataset"]

    model = ModularAdditionTransformer(
        p=P, n_layers=N_LAYERS, n_heads=N_HEADS,
        d_model=D_MODEL, d_mlp=D_MLP,
    )
    model.load_state_dict(
        torch.load(os.path.join(MODEL_DIR, "model.pt"),
                    map_location="cpu", weights_only=True)
    )
    model.eval()

    inputs, targets = make_dataset(P)

    # Baseline accuracy
    with torch.no_grad():
        base_logits = model(inputs)
        base_acc = (base_logits.argmax(-1) == targets).float().mean().item()

    def _ablate(m, head_list, neuron_list):
        ablated = copy.deepcopy(m)
        ablated.eval()
        for layer_idx, head_idx in head_list:
            if layer_idx < len(ablated.blocks):
                block = ablated.blocks[layer_idx]
                d_head = D_MODEL // N_HEADS
                start = head_idx * d_head
                end = start + d_head
                with torch.no_grad():
                    block.attn.W_O.weight[:, start:end] = 0.0
        for layer_idx, neuron_idx in neuron_list:
            if layer_idx < len(ablated.blocks):
                block = ablated.blocks[layer_idx]
                with torch.no_grad():
                    block.mlp.W_out.weight[:, neuron_idx] = 0.0
                    if neuron_idx < block.mlp.W_in.weight.shape[0]:
                        block.mlp.W_in.weight[neuron_idx, :] = 0.0
                        if block.mlp.W_in.bias is not None:
                            block.mlp.W_in.bias[neuron_idx] = 0.0
        with torch.no_grad():
            logits = ablated(inputs)
            acc = (logits.argmax(-1) == targets).float().mean().item()
        return acc

    # Ablate claimed circuit
    circuit_acc = _ablate(model, heads, neurons)

    # Random ablation of same size for comparison
    n_heads_to_ablate = len(heads)
    n_neurons_to_ablate = len(neurons)

    # Deterministic random selection based on SEED + claim hash
    claim_str = json.dumps({"heads": heads, "neurons": neurons}, sort_keys=True)
    rand_seed = int(_hl.sha256(f"{SEED}:{claim_str}".encode()).hexdigest()[:8], 16)
    g = torch.Generator().manual_seed(rand_seed)

    # All possible heads: N_LAYERS * N_HEADS
    all_heads = [(l, h) for l in range(N_LAYERS) for h in range(N_HEADS)]
    head_perm = torch.randperm(len(all_heads), generator=g)
    random_heads = [all_heads[head_perm[i].item()]
                    for i in range(min(n_heads_to_ablate, len(all_heads)))]

    # All possible neurons: N_LAYERS * D_MLP
    all_neurons_count = N_LAYERS * D_MLP
    neuron_perm = torch.randperm(all_neurons_count, generator=g)
    random_neurons = []
    for i in range(min(n_neurons_to_ablate, all_neurons_count)):
        idx = neuron_perm[i].item()
        random_neurons.append([idx // D_MLP, idx % D_MLP])

    random_acc = _ablate(model, random_heads, random_neurons)

    # Circuit quality: how much more does ablating the claimed circuit hurt
    # compared to random ablation? Higher = better circuit identification.
    # quality = (base - circuit) / (base - random + eps)
    eps = 1e-6
    base_minus_circuit = base_acc - circuit_acc
    base_minus_random = base_acc - random_acc
    circuit_quality = base_minus_circuit / (base_minus_random + eps) if base_minus_random > eps else (
        10.0 if base_minus_circuit > 0.1 else 1.0
    )

    return {
        "circuit_accuracy": round(circuit_acc, 6),
        "random_accuracy": round(random_acc, 6),
        "baseline_accuracy": round(base_acc, 6),
        "accuracy_drop_circuit": round(base_acc - circuit_acc, 6),
        "accuracy_drop_random": round(base_acc - random_acc, 6),
        "circuit_quality": round(circuit_quality, 4),
        "heads_ablated": heads,
        "neurons_ablated": neurons,
        "random_heads_ablated": random_heads,
        "random_neurons_ablated": [[l, n] for l, n in random_neurons],
        "n_heads": len(heads),
        "n_neurons": len(neurons),
    }


# ---------------------------------------------------------------------------
# Match time helper
# ---------------------------------------------------------------------------

def _match_time_remaining() -> float:
    elapsed = time.time() - MATCH_START_TIME
    return max(0.0, MATCH_TIME_LIMIT - elapsed)


# ---------------------------------------------------------------------------
# Flask Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "service": "circuit-lab",
        "model_ready": model_ready.is_set(),
        "seed": SEED,
        "p": P,
    })


@app.route("/model-info", methods=["GET"])
def model_info():
    if not model_ready.is_set():
        return jsonify({
            "error": "Model is still training. Please wait and retry.",
            "status": "training",
        }), 503

    return jsonify({
        "task": "modular_addition",
        "task_description": f"(a + b) mod {P}",
        "p": P,
        "n_layers": N_LAYERS,
        "n_heads": N_HEADS,
        "d_model": D_MODEL,
        "d_head": D_HEAD,
        "d_mlp": D_MLP,
        "vocab_size": P + 1,
        "sequence_length": 3,
        "input_format": "[a, b, =] where a,b in [0,p-1] and = is token id p",
        "output": f"prediction at position 2 (= token), classes 0..{P-1}",
        "baseline_accuracy": round(baseline_accuracy, 6),
        "training_info": training_info,
        "total_attention_heads": N_LAYERS * N_HEADS,
        "total_mlp_neurons": N_LAYERS * D_MLP,
        "available_helpers": [
            "load_model() -> (model, p)",
            "get_activations(model, inputs, layer) -> dict with residual, attn_out, mlp_out, attention_weights",
            "get_attention_patterns(model, inputs) -> dict mapping layer_i to attention weights",
            "ablate_components(model, heads=[], neurons=[], inputs=None, targets=None) -> accuracy dict",
            "run_probe(activations, labels, test_frac=0.2) -> probe accuracy dict",
            "make_dataset(p) -> (inputs, targets) tensors",
        ],
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    })


@app.route("/baseline", methods=["GET"])
def baseline_code():
    """Return starter analysis code snippets for agents."""
    if not model_ready.is_set():
        return jsonify({
            "error": "Model is still training. Please wait and retry.",
            "status": "training",
        }), 503

    starter_code = textwrap.dedent(f'''\
# --- Starter Analysis Code for Circuit Lab ---
# Available helpers: load_model, get_activations, get_attention_patterns,
#                    ablate_components, run_probe, make_dataset
# Print a JSON dict to stdout as your result.

import torch
import json

model, p = load_model()
inputs, targets = make_dataset(p)

# --- Example 1: Random ablation baseline ---
import random
random.seed(42)
n_heads_total = {N_LAYERS} * {N_HEADS}  # {N_LAYERS * N_HEADS} total heads
random_heads = [[random.randint(0, {N_LAYERS - 1}), random.randint(0, {N_HEADS - 1})] for _ in range(2)]
random_result = ablate_components(model, heads=random_heads, inputs=inputs, targets=targets)

# --- Example 2: Attention pattern analysis ---
attn = get_attention_patterns(model, inputs[:100])

# --- Example 3: Simple probing at layer 0 ---
acts = get_activations(model, inputs[:500], layer=0)
# Probe whether residual stream at position 0 encodes input a
residual = torch.tensor(acts["residual"])  # [500, 3, {D_MODEL}]
pos0_acts = residual[:, 0, :]  # activations at first token position
a_labels = inputs[:500, 0]  # the 'a' values
probe_result = run_probe(pos0_acts, a_labels)

results = {{
    "random_ablation": random_result,
    "attention_layers": list(attn.keys()),
    "probe_a_at_pos0": probe_result,
}}
print(json.dumps(results))
''')

    return jsonify({
        "starter_code": starter_code,
        "p": P,
        "n_layers": N_LAYERS,
        "n_heads": N_HEADS,
        "d_model": D_MODEL,
        "d_mlp": D_MLP,
        "tips": [
            "The model has grokked (a+b) mod p. Key circuits likely involve Fourier features.",
            "Attention heads may implement 'copy' or 'frequency' operations.",
            "MLP neurons may compute nonlinear functions of Fourier components.",
            "Try probing for (a+b) mod p at different layers to see where the answer forms.",
            "Systematic ablation: try each head individually, then combinations.",
            "Use get_activations to capture residual stream at each layer.",
            "The circuit likely uses a small subset of the 8 total attention heads.",
        ],
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    })


@app.route("/run", methods=["POST"])
def run_code():
    """Execute agent analysis code with access to the trained model."""
    if not model_ready.is_set():
        return jsonify({
            "error": "Model is still training. Please wait and retry.",
            "status": "training",
        }), 503

    with runs_lock:
        if len(runs) >= MAX_RUNS:
            return jsonify({
                "error": f"Maximum {MAX_RUNS} runs reached.",
                "runs_remaining": 0,
                "match_time_remaining_secs": round(_match_time_remaining(), 1),
            }), 429

    data = request.get_json(force=True, silent=True)
    if not data or "code" not in data:
        return jsonify({
            "error": 'Request must include "code" field with analysis code.',
        }), 400

    code = data["code"]
    if not isinstance(code, str) or len(code) < 10:
        return jsonify({
            "error": "code must be a string of at least 10 characters.",
        }), 400

    if len(code) > 100_000:
        return jsonify({
            "error": "code exceeds 100KB limit.",
        }), 400

    # Syntax check
    try:
        compile(code, "<agent_code>", "exec")
    except SyntaxError as e:
        return jsonify({
            "error": f"SyntaxError at line {e.lineno}: {e.msg}",
            "status": "syntax_error",
        }), 422

    with runs_lock:
        run_id = f"run-{len(runs):03d}"

    result = _execute_analysis(code, run_id)
    result["submitted_at"] = time.time() - MATCH_START_TIME

    with runs_lock:
        runs.append(result)

    # Return without full stdout/stderr for cleaner response
    response = {
        "run_id": result["run_id"],
        "status": result["status"],
        "result": result["result"],
        "elapsed_secs": result["elapsed_secs"],
        "error": result["error"],
        "runs_remaining": MAX_RUNS - len(runs),
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    }
    if result["status"] == "error":
        response["stderr"] = result.get("stderr", "")

    return jsonify(response)


@app.route("/verify-circuit", methods=["POST"])
def verify_circuit():
    """Ablate a claimed circuit and compare to random ablation."""
    if not model_ready.is_set():
        return jsonify({
            "error": "Model is still training. Please wait and retry.",
            "status": "training",
        }), 503

    data = request.get_json(force=True, silent=True)
    if not data:
        return jsonify({
            "error": 'Request must include "heads" and/or "neurons".',
        }), 400

    heads = data.get("heads", [])
    neurons = data.get("neurons", [])

    if not heads and not neurons:
        return jsonify({
            "error": "Must specify at least one head or neuron to ablate.",
        }), 400

    # Validate heads format
    for h in heads:
        if not isinstance(h, (list, tuple)) or len(h) != 2:
            return jsonify({
                "error": f"Each head must be [layer, head_idx], got: {h}",
            }), 400
        layer_idx, head_idx = h
        if not (0 <= layer_idx < N_LAYERS):
            return jsonify({
                "error": f"Layer index {layer_idx} out of range [0, {N_LAYERS - 1}]",
            }), 400
        if not (0 <= head_idx < N_HEADS):
            return jsonify({
                "error": f"Head index {head_idx} out of range [0, {N_HEADS - 1}]",
            }), 400

    # Validate neurons format
    for n in neurons:
        if not isinstance(n, (list, tuple)) or len(n) != 2:
            return jsonify({
                "error": f"Each neuron must be [layer, neuron_idx], got: {n}",
            }), 400
        layer_idx, neuron_idx = n
        if not (0 <= layer_idx < N_LAYERS):
            return jsonify({
                "error": f"Layer index {layer_idx} out of range [0, {N_LAYERS - 1}]",
            }), 400
        if not (0 <= neuron_idx < D_MLP):
            return jsonify({
                "error": f"Neuron index {neuron_idx} out of range [0, {D_MLP - 1}]",
            }), 400

    result = _verify_circuit_internal(heads, neurons)

    # Store as a run too
    run_record = {
        "run_id": f"verify-{len(runs):03d}",
        "status": "completed",
        "result": result,
        "elapsed_secs": 0,
        "stdout": "",
        "stderr": "",
        "error": None,
        "submitted_at": time.time() - MATCH_START_TIME,
        "type": "verify-circuit",
    }
    with runs_lock:
        runs.append(run_record)

    result["match_time_remaining_secs"] = round(_match_time_remaining(), 1)
    return jsonify(result)


@app.route("/runs", methods=["GET"])
def list_runs():
    with runs_lock:
        summaries = []
        for r in runs:
            summaries.append({
                "run_id": r["run_id"],
                "status": r["status"],
                "elapsed_secs": r.get("elapsed_secs"),
                "error": r.get("error"),
                "type": r.get("type", "analysis"),
                "submitted_at": r.get("submitted_at"),
                "has_result": r.get("result") is not None,
            })

        return jsonify({
            "runs": summaries,
            "total": len(runs),
            "remaining": MAX_RUNS - len(runs),
            "match_time_remaining_secs": round(_match_time_remaining(), 1),
        })


@app.route("/runs/<run_id>", methods=["GET"])
def get_run(run_id: str):
    with runs_lock:
        for r in runs:
            if r["run_id"] == run_id:
                return jsonify({
                    "run_id": r["run_id"],
                    "status": r["status"],
                    "result": r.get("result"),
                    "elapsed_secs": r.get("elapsed_secs"),
                    "error": r.get("error"),
                    "stdout": r.get("stdout", ""),
                    "stderr": r.get("stderr", ""),
                    "type": r.get("type", "analysis"),
                    "submitted_at": r.get("submitted_at"),
                    "match_time_remaining_secs": round(_match_time_remaining(), 1),
                })

    return jsonify({"error": f"Run '{run_id}' not found"}), 404


@app.route("/metrics", methods=["GET"])
def metrics():
    """Scoring metrics endpoint — called by the platform at submission time."""
    with runs_lock:
        # Find best circuit quality from verify-circuit runs
        best_circuit_quality = 0.0
        best_verify = None
        verify_runs = []
        analysis_runs = []

        for r in runs:
            if r.get("type") == "verify-circuit" and r.get("result"):
                verify_runs.append(r)
                q = r["result"].get("circuit_quality", 0)
                if q > best_circuit_quality:
                    best_circuit_quality = q
                    best_verify = r
            elif r.get("status") == "completed" and r.get("result"):
                analysis_runs.append(r)

        # Collect all ablation results from analysis runs
        ablation_results = []
        probe_results = []
        for r in analysis_runs:
            res = r.get("result", {})
            if not res:
                continue
            # Look for ablation-like results
            for key, val in res.items():
                if isinstance(val, dict):
                    if "accuracy" in val and "heads_ablated" in val:
                        ablation_results.append(val)
                    if "test_acc" in val and "train_acc" in val:
                        probe_results.append(val)

        best_probe_acc = max(
            (p.get("test_acc", 0) for p in probe_results),
            default=0.0,
        )

    return jsonify({
        "total_runs": len(runs),
        "analysis_runs": len(analysis_runs),
        "verify_runs": len(verify_runs),
        "max_runs": MAX_RUNS,
        "best_circuit_quality": round(best_circuit_quality, 4),
        "best_verify_result": best_verify["result"] if best_verify else None,
        "best_probe_accuracy": round(best_probe_acc, 4),
        "ablation_count": len(ablation_results),
        "probe_count": len(probe_results),
        "baseline_accuracy": round(baseline_accuracy, 6),
        "p": P,
        "training_info": training_info,
        "elapsed_seconds": round(time.time() - MATCH_START_TIME, 1),
        "match_time_remaining_secs": round(_match_time_remaining(), 1),
    })


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"[circuit-lab] Starting service", file=sys.stderr)
    print(f"[circuit-lab] SEED={SEED}, P={P}, MATCH_ID={MATCH_ID}", file=sys.stderr)
    print(f"[circuit-lab] Max runs: {MAX_RUNS}, Run timeout: {RUN_TIMEOUT}s", file=sys.stderr)

    # Train model in background thread so Flask can start responding to /health
    train_thread = threading.Thread(target=_train_model, daemon=True)
    train_thread.start()

    print(f"[circuit-lab] Model training started in background...", file=sys.stderr)
    print(f"[circuit-lab] Server starting on port {PORT}", file=sys.stderr)

    app.run(host="0.0.0.0", port=PORT, debug=False)
