"""
Data preparation for autoresearch challenge.

Downloads Shakespeare's Complete Works from Project Gutenberg and writes
binary files (raw bytes) for byte-level tokenization.

The corpus is split 90/10 into train/val.

Usage:
    python build_data.py
"""

import os
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# Project Gutenberg: Complete Works of William Shakespeare (~5.4MB)
SHAKESPEARE_URL = "https://www.gutenberg.org/cache/epub/100/pg100.txt"

# Fallback mirror
SHAKESPEARE_FALLBACK = "https://www.gutenberg.org/ebooks/100.txt.utf-8"


def _strip_gutenberg_header_footer(text: str) -> str:
    """Remove Project Gutenberg boilerplate from start and end."""
    # Find start marker
    start_markers = [
        "*** START OF THE PROJECT GUTENBERG EBOOK",
        "*** START OF THIS PROJECT GUTENBERG EBOOK",
        "*END*THE SMALL PRINT",
    ]
    start_idx = 0
    for marker in start_markers:
        idx = text.find(marker)
        if idx != -1:
            # Skip past the marker line
            start_idx = text.find("\n", idx) + 1
            break

    # Find end marker
    end_markers = [
        "*** END OF THE PROJECT GUTENBERG EBOOK",
        "*** END OF THIS PROJECT GUTENBERG EBOOK",
        "End of the Project Gutenberg EBook",
        "End of Project Gutenberg",
    ]
    end_idx = len(text)
    for marker in end_markers:
        idx = text.find(marker)
        if idx != -1:
            end_idx = idx
            break

    return text[start_idx:end_idx].strip()


def download_shakespeare() -> str:
    """Download Shakespeare's Complete Works from Project Gutenberg."""
    for url in [SHAKESPEARE_URL, SHAKESPEARE_FALLBACK]:
        try:
            print(f"  Downloading from {url}...")
            req = urllib.request.Request(url, headers={"User-Agent": "ClawdiatorsBot/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                text = resp.read().decode("utf-8")
            print(f"  Downloaded {len(text):,} chars")
            return text
        except Exception as e:
            print(f"  Download failed: {e}")

    raise RuntimeError("Could not download Shakespeare corpus from any source")


def build():
    """Download corpus and write train/val splits."""
    out_dir = os.path.join(DATA_DIR, "shakespeare")
    os.makedirs(out_dir, exist_ok=True)

    train_path = os.path.join(out_dir, "train.bin")
    val_path = os.path.join(out_dir, "val.bin")

    if os.path.exists(train_path) and os.path.exists(val_path):
        train_size = os.path.getsize(train_path)
        val_size = os.path.getsize(val_path)
        # Only skip if files are reasonably large (>1MB)
        if train_size > 1_000_000:
            print(f"  shakespeare: already exists (train={train_size:,}B, val={val_size:,}B)")
            return
        print(f"  shakespeare: existing files too small ({train_size:,}B), rebuilding...")

    raw_text = download_shakespeare()
    text = _strip_gutenberg_header_footer(raw_text)
    print(f"  Stripped to {len(text):,} chars (removed Gutenberg boilerplate)")

    # Convert to bytes (UTF-8)
    raw = text.encode("utf-8")

    # Split 90/10
    split_point = int(len(raw) * 0.9)
    train_data = raw[:split_point]
    val_data = raw[split_point:]

    with open(train_path, "wb") as f:
        f.write(train_data)
    with open(val_path, "wb") as f:
        f.write(val_data)

    print(f"  Written: train={len(train_data):,}B, val={len(val_data):,}B")


def main():
    print(f"Building Shakespeare corpus in {DATA_DIR}/")
    print()
    build()
    print()
    print("Done.")


if __name__ == "__main__":
    main()
