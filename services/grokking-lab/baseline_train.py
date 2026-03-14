"""
Baseline training script for grokking on modular addition.

Defines a small 2-layer transformer that learns (a + b) mod p.
This is the default code agents start from — agents can modify the model
architecture, optimizer, schedule, data augmentation, etc. to accelerate grokking.

Usage:
    The runner harness imports this and calls train(p, device).
    Agents can submit modified versions of this file.
"""

import math
import torch
import torch.nn as nn
import torch.nn.functional as F


# ── Model ─────────────────────────────────────────────────────────────

class ModularAdditionTransformer(nn.Module):
    """
    Small transformer for modular addition: given tokens (a, b, =),
    predict (a + b) mod p at the position of the = token.

    Architecture:
      - Token embedding (p + 1 special tokens) + positional embedding (3 positions)
      - n_layers transformer blocks with n_heads attention heads
      - Final linear head from d_model -> p (classification over residues)
    """

    def __init__(self, p, d_model=128, n_heads=4, n_layers=2, dropout=0.0):
        super().__init__()
        self.p = p
        self.d_model = d_model
        self.n_layers = n_layers

        # Vocabulary: 0..p-1 for digits, p for the = token
        self.tok_embed = nn.Embedding(p + 1, d_model)
        self.pos_embed = nn.Embedding(3, d_model)  # 3 positions: a, b, =

        # Transformer layers
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=n_heads,
            dim_feedforward=4 * d_model,
            dropout=dropout,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)

        self.ln_f = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, p)

    def forward(self, x):
        """
        x: (batch, 3) tensor of token ids — [a, b, eq_token]
        Returns: (batch, p) logits for the answer at the = position
        """
        B, S = x.shape
        positions = torch.arange(S, device=x.device).unsqueeze(0).expand(B, S)

        h = self.tok_embed(x) + self.pos_embed(positions)
        h = self.transformer(h)
        h = self.ln_f(h)

        # Read off the last position (the = token)
        logits = self.head(h[:, -1, :])
        return logits


# ── Dataset ───────────────────────────────────────────────────────────

def make_dataset(p, frac_train=0.3, seed=0):
    """
    Create the full modular addition dataset: all (a, b) pairs mod p.
    Split into train/val deterministically based on seed.

    Returns:
        train_inputs: (N_train, 3) — [a, b, p]  (p is the = token)
        train_labels: (N_train,)
        val_inputs: (N_val, 3)
        val_labels: (N_val,)
    """
    rng = torch.Generator().manual_seed(seed)

    eq_token = p  # special token for =
    all_pairs = []
    all_labels = []

    for a in range(p):
        for b in range(p):
            all_pairs.append([a, b, eq_token])
            all_labels.append((a + b) % p)

    inputs = torch.tensor(all_pairs, dtype=torch.long)
    labels = torch.tensor(all_labels, dtype=torch.long)

    # Shuffle and split
    n_total = len(labels)
    perm = torch.randperm(n_total, generator=rng)
    inputs = inputs[perm]
    labels = labels[perm]

    n_train = int(n_total * frac_train)
    train_inputs = inputs[:n_train]
    train_labels = labels[:n_train]
    val_inputs = inputs[n_train:]
    val_labels = labels[n_train:]

    return train_inputs, train_labels, val_inputs, val_labels


# ── Training ──────────────────────────────────────────────────────────

def train(p, device="cpu"):
    """
    Train a 2-layer transformer on (a + b) mod p.

    This is the baseline configuration. Agents should modify this function
    (model architecture, optimizer, schedule, etc.) to make grokking happen
    faster — i.e., reduce the epoch at which val_acc crosses 0.95.

    Args:
        p: prime modulus
        device: 'cpu' or 'cuda'

    Returns:
        dict with keys:
            - model_state_dict: the final model weights
            - training_history: list of dicts with per-epoch metrics
            - config: dict of hyperparameters used
    """
    # Hyperparameters
    d_model = 128
    n_heads = 4
    n_layers = 2
    dropout = 0.0
    lr = 1e-3
    weight_decay = 0.01
    epochs = 7500
    frac_train = 0.3
    batch_size = 512
    log_every = 25  # log metrics every N epochs

    # Setup
    torch.manual_seed(42)
    model = ModularAdditionTransformer(
        p, d_model=d_model, n_heads=n_heads, n_layers=n_layers, dropout=dropout
    ).to(device)

    optimizer = torch.optim.AdamW(
        model.parameters(), lr=lr, weight_decay=weight_decay, betas=(0.9, 0.98)
    )

    train_inputs, train_labels, val_inputs, val_labels = make_dataset(
        p, frac_train=frac_train, seed=0
    )
    train_inputs = train_inputs.to(device)
    train_labels = train_labels.to(device)
    val_inputs = val_inputs.to(device)
    val_labels = val_labels.to(device)

    n_train = len(train_labels)

    history = []

    for epoch in range(epochs + 1):
        # ── Train step ────────────────────────────────────────────────
        model.train()

        # Shuffle training data each epoch
        perm = torch.randperm(n_train, device=device)
        train_loss_accum = 0.0
        train_correct = 0
        n_batches = 0

        for i in range(0, n_train, batch_size):
            idx = perm[i : i + batch_size]
            x = train_inputs[idx]
            y = train_labels[idx]

            logits = model(x)
            loss = F.cross_entropy(logits, y)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            train_loss_accum += loss.item()
            train_correct += (logits.argmax(dim=-1) == y).sum().item()
            n_batches += 1

        # ── Logging ───────────────────────────────────────────────────
        if epoch % log_every == 0 or epoch == epochs:
            model.eval()
            with torch.no_grad():
                # Full train metrics
                train_logits = model(train_inputs)
                train_loss = F.cross_entropy(train_logits, train_labels).item()
                train_acc = (
                    (train_logits.argmax(dim=-1) == train_labels).float().mean().item()
                )

                # Full val metrics
                val_logits = model(val_inputs)
                val_loss = F.cross_entropy(val_logits, val_labels).item()
                val_acc = (
                    (val_logits.argmax(dim=-1) == val_labels).float().mean().item()
                )

                # Weight norm
                weight_norm = sum(
                    p.norm().item() ** 2 for p in model.parameters()
                ) ** 0.5

                # Gradient norm (from last training step)
                grad_norm = sum(
                    p.grad.norm().item() ** 2
                    for p in model.parameters()
                    if p.grad is not None
                ) ** 0.5

            history.append(
                {
                    "epoch": epoch,
                    "train_loss": round(train_loss, 6),
                    "train_acc": round(train_acc, 6),
                    "val_loss": round(val_loss, 6),
                    "val_acc": round(val_acc, 6),
                    "weight_norm": round(weight_norm, 4),
                    "grad_norm": round(grad_norm, 6),
                }
            )

    return {
        "model_state_dict": model.state_dict(),
        "training_history": history,
        "config": {
            "d_model": d_model,
            "n_heads": n_heads,
            "n_layers": n_layers,
            "dropout": dropout,
            "lr": lr,
            "weight_decay": weight_decay,
            "epochs": epochs,
            "frac_train": frac_train,
            "batch_size": batch_size,
            "optimizer": "adamw",
        },
    }
