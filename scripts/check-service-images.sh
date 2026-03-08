#!/bin/bash
# check-service-images.sh — Validate service image tags are consistent and up-to-date.
#
# Catches two classes of bugs:
#   1. Image tag in .image file doesn't match the tag in the challenge's index.ts
#   2. Service source files changed but .image tag wasn't bumped (content hash check)
#
# Runs in CI without Docker.

set -euo pipefail

errors=0

# ── Check 1: .image tag matches index.ts ServiceSpec image ──

for imagefile in services/*/.image; do
  [ -f "$imagefile" ] || continue
  svc_name=$(basename "$(dirname "$imagefile")")
  image_tag=$(head -1 "$imagefile" | tr -d '[:space:]')

  # Find which challenge index.ts references this service by name
  for index_ts in packages/api/src/challenges/*/index.ts; do
    [ -f "$index_ts" ] || continue

    # Check if this index.ts references this service name
    if grep -q "name: \"$svc_name\"" "$index_ts" 2>/dev/null; then
      # Extract the image tag from index.ts
      ts_image=$(grep -A1 "name: \"$svc_name\"" "$index_ts" | grep 'image:' | sed 's/.*image: *"\([^"]*\)".*/\1/')

      if [ -n "$ts_image" ] && [ "$ts_image" != "$image_tag" ]; then
        echo "ERROR: Image tag mismatch for service '$svc_name':"
        echo "  .image file: $image_tag"
        echo "  $index_ts: $ts_image"
        errors=$((errors + 1))
      fi
    fi
  done
done

# ── Check 2: Service source changed but image tag not bumped ──
# Compare current content hash of service dir against a stored hash in .image-hash.
# If .image-hash doesn't exist, skip (first time — generate it).

for imagefile in services/*/.image; do
  [ -f "$imagefile" ] || continue
  svc_dir=$(dirname "$imagefile")
  hashfile="$svc_dir/.image-hash"

  # Compute hash of all tracked source files in the service dir (excluding .image and .image-hash)
  current_hash=$(git ls-files "$svc_dir" | grep -v '\.image$' | grep -v '\.image-hash$' | sort | xargs cat 2>/dev/null | sha256sum | cut -d' ' -f1)

  if [ -f "$hashfile" ]; then
    stored_hash=$(head -1 "$hashfile" | tr -d '[:space:]')
    if [ "$current_hash" != "$stored_hash" ]; then
      image_tag=$(head -1 "$imagefile" | tr -d '[:space:]')
      echo "WARNING: Service source in $svc_dir changed but .image tag ($image_tag) may not have been bumped."
      echo "  If you changed service source files, bump the version in $imagefile and update .image-hash."
      echo "  Run: sha256sum of sources > $hashfile"
      # Don't fail on this — it's a warning, not always a bug (e.g. README changes)
    fi
  fi
done

if [ "$errors" -gt 0 ]; then
  echo ""
  echo "Found $errors service image error(s)."
  echo "Fix: ensure .image file and index.ts ServiceSpec image tags match."
  exit 1
fi

echo "All service image tags verified."
