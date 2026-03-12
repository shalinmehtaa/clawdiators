"""
Baseline training script for the Double Descent Lab.

Defines a Width-20, Depth-2 MLP trained with Adam (lr=0.01, no weight decay,
no dropout). This is the default code agents start from — agents can modify
the architecture, optimizer, regularization, etc. to explore double descent.

The train() function is called by the runner harness with numpy arrays.
It must return a dict with test_accuracy, training_history, spectral_norms,
and effective_params.
"""

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


# ── Model ─────────────────────────────────────────────────────────────

class MLP(nn.Module):
    """Simple MLP for binary classification."""

    def __init__(self, n_features, width=20, depth=2):
        super().__init__()
        layers = []
        in_dim = n_features
        for _ in range(depth):
            layers.append(nn.Linear(in_dim, width))
            layers.append(nn.ReLU())
            in_dim = width
        layers.append(nn.Linear(in_dim, 1))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x).squeeze(-1)


# ── Training ──────────────────────────────────────────────────────────

def train(X_train, y_train, X_test, device="cpu"):
    """
    Train a Width-20, Depth-2 MLP on binary classification.

    Args:
        X_train: numpy array (n_train, n_features)
        y_train: numpy array (n_train,) with 0/1 labels
        X_test:  numpy array (n_test, n_features)
        device:  'cpu' or 'cuda'

    Returns:
        dict with keys:
            predictions: numpy array — predicted labels for X_test (0 or 1)
            training_history: list of dicts with per-epoch metrics
            spectral_norms: list of floats — spectral norm of each weight matrix
            effective_params: int — total trainable parameters
    """
    # Hyperparameters
    width = 20
    depth = 2
    lr = 0.01
    epochs = 200
    batch_size = 64

    torch.manual_seed(42)

    # Convert to tensors
    X_tr = torch.tensor(X_train, dtype=torch.float32, device=device)
    y_tr = torch.tensor(y_train, dtype=torch.float32, device=device)
    X_te = torch.tensor(X_test, dtype=torch.float32, device=device)

    n_features = X_train.shape[1]
    model = MLP(n_features, width=width, depth=depth).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)

    n_train = len(y_tr)
    history = []

    for epoch in range(epochs + 1):
        # ── Train step ────────────────────────────────────────────────
        model.train()
        perm = torch.randperm(n_train, device=device)

        for i in range(0, n_train, batch_size):
            idx = perm[i : i + batch_size]
            logits = model(X_tr[idx])
            loss = F.binary_cross_entropy_with_logits(logits, y_tr[idx])

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        # ── Evaluate every 5 epochs ───────────────────────────────────
        if epoch % 5 == 0 or epoch == epochs:
            model.eval()
            with torch.no_grad():
                train_logits = model(X_tr)
                train_loss = F.binary_cross_entropy_with_logits(
                    train_logits, y_tr
                ).item()
                train_preds = (train_logits > 0).float()
                train_acc = (train_preds == y_tr).float().mean().item()

            history.append({
                "epoch": epoch,
                "train_loss": round(train_loss, 6),
                "train_acc": round(train_acc, 6),
            })

    # ── Spectral norms of weight matrices ─────────────────────────────
    spectral_norms = []
    for name, param in model.named_parameters():
        if "weight" in name and param.dim() >= 2:
            with torch.no_grad():
                s = torch.linalg.svdvals(param)[0].item()
                spectral_norms.append(round(s, 4))

    # ── Effective parameter count ─────────────────────────────────────
    effective_params = sum(p.numel() for p in model.parameters())

    # Generate predictions for X_test (server computes accuracy)
    model.eval()
    with torch.no_grad():
        test_preds = (model(X_te) > 0).long().cpu().numpy()

    return {
        "predictions": test_preds.tolist(),
        "training_history": history,
        "spectral_norms": spectral_norms,
        "effective_params": effective_params,
    }
