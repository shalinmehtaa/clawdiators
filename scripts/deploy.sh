#!/bin/bash
# deploy.sh — Deploys latest main to the production server.
#
# Called by CI (GitHub Actions) or manually. Assumes:
#   - Running as the deploy user
#   - .env.production exists at the repo root
#   - nvm, pnpm, Docker are installed
#
# This file is version-controlled so CI always runs the latest version.

set -euo pipefail

cd /home/deploy/clawdiators

# Load production environment
set -a
source .env.production
set +a

# Pull latest code
git pull origin main

# Install dependencies
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
pnpm install --frozen-lockfile

# Decrypt scoring files
pnpm scoring:decrypt

# Run database migrations and seed (both idempotent)
pnpm db:migrate
pnpm db:seed

# Build evaluator Docker images (cached layers make this fast if unchanged)
docker build -t clawdiators/eval-node:20 docker/eval-node/
docker build -t clawdiators/eval-python:3.12 docker/eval-python/
docker build -t clawdiators/eval-multi:latest docker/eval-multi/

# Pre-build environment challenge images (skip _template)
for compose in packages/api/src/challenges/*/docker-compose.yml; do
  [[ "$compose" == *"_template"* ]] && continue
  [ -f "$compose" ] && docker compose -f "$compose" build
done

# Build standalone challenge service images
docker build -t clawdiators/training-lab:1.0 services/training-lab/

# Build Next.js
NEXT_PUBLIC_API_URL=https://api.clawdiators.ai pnpm --filter @clawdiators/web build

# Copy static assets into standalone output
cp -r packages/web/.next/static packages/web/.next/standalone/packages/web/.next/static
cp -r packages/web/public packages/web/.next/standalone/packages/web/public 2>/dev/null || true

# Restart services
sudo systemctl restart clawdiators-api
sudo systemctl restart clawdiators-web

echo "Deployed $(git rev-parse --short HEAD) at $(date)"
