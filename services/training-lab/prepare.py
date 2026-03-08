"""
Fixed evaluation harness for autoresearch challenge.

This file is READ-ONLY for agents. It provides:
  - Constants (context length, time budget, vocab size)
  - Byte-level tokenizer
  - Data loading with BOS-aligned packing
  - evaluate_bpb() — the ground truth metric

Agents import from this file in their train.py but CANNOT modify it.
The training service enforces this by always using the bundled copy.

Mirrors the role of prepare.py in Karpathy's autoresearch.
"""

import os
import math
import struct
import torch

# ---------------------------------------------------------------------------
# Constants (fixed, do not modify)
# ---------------------------------------------------------------------------

MAX_SEQ_LEN = 256        # context length (tokens = bytes for byte-level)
TIME_BUDGET = 180        # training time budget in seconds (3 minutes)
EVAL_TOKENS = 2 * 65536  # ~131K tokens for validation eval
VOCAB_SIZE = 256         # byte-level tokenizer: one token per byte value
BOS_TOKEN = 0            # use null byte as BOS marker

# ---------------------------------------------------------------------------
# Data directory
# ---------------------------------------------------------------------------

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))

# ---------------------------------------------------------------------------
# Byte-level tokenizer
# ---------------------------------------------------------------------------

class ByteTokenizer:
    """
    Trivial byte-level tokenizer. Every byte value (0-255) is a token.
    No BPE, no merging — just raw bytes.
    """

    def __init__(self):
        self.vocab_size = VOCAB_SIZE
        self.bos_token_id = BOS_TOKEN

    def encode(self, text: str) -> list[int]:
        """Encode text to list of byte values."""
        return list(text.encode("utf-8"))

    def decode(self, ids: list[int]) -> str:
        """Decode byte values back to text (lossy for invalid UTF-8)."""
        return bytes(ids).decode("utf-8", errors="replace")

    def get_vocab_size(self) -> int:
        return self.vocab_size

    def get_bos_token_id(self) -> int:
        return self.bos_token_id


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _load_shard(filepath: str) -> torch.Tensor:
    """Load a binary shard file as a 1-D tensor of uint8 byte values."""
    with open(filepath, "rb") as f:
        data = f.read()
    return torch.frombuffer(bytearray(data), dtype=torch.uint8).long()


def _get_data_files(split: str) -> list[str]:
    """Get sorted list of data shard files for a split."""
    prefix = f"{split}_"
    files = [
        os.path.join(DATA_DIR, f)
        for f in sorted(os.listdir(DATA_DIR))
        if f.startswith(prefix) and f.endswith(".bin")
    ]
    if not files:
        # Fallback: look for split.bin (single file)
        single = os.path.join(DATA_DIR, f"{split}.bin")
        if os.path.exists(single):
            files = [single]
    assert len(files) > 0, f"No data files found for split '{split}' in {DATA_DIR}"
    return files


def make_dataloader(
    B: int,
    T: int,
    split: str = "train",
    device: str = "cpu",
):
    """
    Infinite iterator yielding (inputs, targets) batches.

    BOS-aligned packing: each row starts with a BOS token.
    Documents are packed sequentially with BOS separators.
    100% utilization (no padding).

    Args:
        B: batch size
        T: sequence length (should be MAX_SEQ_LEN)
        split: "train" or "val"
        device: torch device string

    Yields:
        (inputs, targets): both shape (B, T), dtype long
    """
    assert split in ("train", "val"), f"split must be 'train' or 'val', got '{split}'"

    data_files = _get_data_files(split)
    row_len = T + 1  # +1 because targets are shifted by 1

    # Load all data for this split into one big tensor
    all_data = torch.cat([_load_shard(f) for f in data_files])

    # Insert BOS tokens at document boundaries
    # For simplicity with byte-level data, we treat the entire corpus as one
    # continuous stream and just prepend BOS at the start of each row
    n_tokens = len(all_data)
    pos = 0

    while True:
        # Build a batch
        batch = torch.empty((B, row_len), dtype=torch.long)
        for row in range(B):
            batch[row, 0] = BOS_TOKEN
            remaining = row_len - 1
            if pos + remaining > n_tokens:
                # Wrap around
                first_part = n_tokens - pos
                batch[row, 1:1 + first_part] = all_data[pos:pos + first_part]
                pos = 0
                second_part = remaining - first_part
                batch[row, 1 + first_part:] = all_data[pos:pos + second_part]
                pos = second_part
            else:
                batch[row, 1:] = all_data[pos:pos + remaining]
                pos += remaining

        inputs = batch[:, :-1].to(device)
        targets = batch[:, 1:].to(device)
        yield inputs, targets


# ---------------------------------------------------------------------------
# Evaluation (DO NOT CHANGE — this is the fixed metric)
# ---------------------------------------------------------------------------

@torch.no_grad()
def evaluate_bpb(model, B: int, device: str = "cpu") -> float:
    """
    Bits per byte (BPB): the standard evaluation metric.

    For byte-level tokenization, this simplifies to:
        BPB = mean cross-entropy loss / ln(2)

    Since every token IS a byte, we don't need the token_bytes mapping
    that autoresearch uses for BPE. Every token has exactly 1 byte.

    Uses fixed MAX_SEQ_LEN so results are comparable across configs.

    Args:
        model: the language model (must accept (x, targets) and return loss)
        B: batch size for evaluation
        device: torch device string

    Returns:
        val_bpb: float, lower is better
    """
    model.eval()
    val_loader = make_dataloader(B, MAX_SEQ_LEN, "val", device)
    steps = max(1, EVAL_TOKENS // (B * MAX_SEQ_LEN))

    total_loss = 0.0
    total_tokens = 0

    for _ in range(steps):
        x, y = next(val_loader)
        # Model should return mean cross-entropy loss when given targets
        loss = model(x, y)
        if hasattr(loss, 'item'):
            loss_val = loss.item()
        else:
            loss_val = float(loss)
        total_loss += loss_val * (B * MAX_SEQ_LEN)
        total_tokens += B * MAX_SEQ_LEN

    # Convert nats to bits: divide by ln(2)
    mean_loss_nats = total_loss / total_tokens
    bpb = mean_loss_nats / math.log(2)

    model.train()
    return bpb


# ---------------------------------------------------------------------------
# Utility: get data stats
# ---------------------------------------------------------------------------

def get_data_stats() -> dict:
    """Return basic stats about the loaded data."""
    train_files = _get_data_files("train")
    val_files = _get_data_files("val")

    train_tokens = sum(os.path.getsize(f) for f in train_files)
    val_tokens = sum(os.path.getsize(f) for f in val_files)

    return {
        "train_tokens": train_tokens,
        "val_tokens": val_tokens,
        "train_files": len(train_files),
        "val_files": len(val_files),
        "vocab_size": VOCAB_SIZE,
        "max_seq_len": MAX_SEQ_LEN,
        "time_budget_secs": TIME_BUDGET,
        "eval_tokens": EVAL_TOKENS,
    }


# ---------------------------------------------------------------------------
# Main (for testing)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Autoresearch prepare.py — fixed evaluation harness")
    print()

    stats = get_data_stats()
    for k, v in stats.items():
        print(f"  {k}: {v}")

    print()
    print("Testing dataloader...")
    loader = make_dataloader(4, MAX_SEQ_LEN, "val")
    x, y = next(loader)
    print(f"  Batch shape: x={x.shape}, y={y.shape}")
    print(f"  x[0, :10] = {x[0, :10].tolist()}")

    tok = ByteTokenizer()
    sample = tok.decode(x[0, :50].tolist())
    print(f"  Decoded: {sample[:80]}...")
    print()
    print("Ready.")
