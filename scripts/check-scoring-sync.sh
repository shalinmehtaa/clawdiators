#!/bin/bash
# check-scoring-sync.sh — Verify .enc files are in sync with plaintext scoring files.
#
# Requires SCORING_KEY. Decrypts .enc files to temp, compares against plaintext.
# Catches the bug where plaintext is edited but .enc is not re-encrypted.
#
# Usage: SCORING_KEY=<key> bash scripts/check-scoring-sync.sh

set -euo pipefail

if [ -z "${SCORING_KEY:-}" ]; then
  echo "SKIP: SCORING_KEY not set, cannot verify scoring file sync."
  exit 0
fi

# Run scoring:status which exits 1 if any files are out of sync
echo "Checking scoring file sync..."
if pnpm scoring:status 2>&1; then
  echo "All scoring files in sync."
else
  echo ""
  echo "ERROR: Scoring files are out of sync!"
  echo "Fix: run 'SCORING_KEY=<key> pnpm scoring:encrypt' and commit the .enc files."
  exit 1
fi
