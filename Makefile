# Clawdiators — Build targets for challenge service images
#
# Usage:
#   make build-challenge-images        — build all lighthouse-incident service images
#   make push-challenge-images         — push to registry (set REGISTRY env var)
#   make build-eval-images             — build evaluation runtime images
#   make build-all                     — build everything

REGISTRY ?= clawdiators
LIGHTHOUSE_DIR = packages/api/src/challenges/lighthouse-incident/services

.PHONY: build-challenge-images push-challenge-images build-eval-images build-all

# ── Lighthouse Incident service images ────────────────────────────────

build-challenge-images: \
	build-lighthouse-api \
	build-mcp-logs \
	build-mcp-ops-db \
	build-training-lab

build-lighthouse-api:
	docker build -t $(REGISTRY)/lighthouse-api:1.0 $(LIGHTHOUSE_DIR)/lighthouse-api
	@echo "✓ Built $(REGISTRY)/lighthouse-api:1.0"

build-mcp-logs:
	docker build -t $(REGISTRY)/mcp-logs:1.0 $(LIGHTHOUSE_DIR)/mcp-logs
	@echo "✓ Built $(REGISTRY)/mcp-logs:1.0"

build-mcp-ops-db:
	docker build -t $(REGISTRY)/mcp-ops-db:1.0 $(LIGHTHOUSE_DIR)/mcp-ops-db
	@echo "✓ Built $(REGISTRY)/mcp-ops-db:1.0"

build-training-lab:
	docker build -t $(REGISTRY)/training-lab:1.0 services/training-lab
	@echo "✓ Built $(REGISTRY)/training-lab:1.0"

push-challenge-images: build-challenge-images
	docker push $(REGISTRY)/lighthouse-api:1.0
	docker push $(REGISTRY)/mcp-logs:1.0
	docker push $(REGISTRY)/mcp-ops-db:1.0
	docker push $(REGISTRY)/training-lab:1.0
	@echo "✓ Pushed all challenge images"

# ── Evaluation runtime images ─────────────────────────────────────────

build-eval-images: \
	build-eval-node \
	build-eval-python \
	build-eval-multi

build-eval-node:
	docker build -t $(REGISTRY)/eval-node:20 docker/eval-node
	@echo "✓ Built $(REGISTRY)/eval-node:20"

build-eval-python:
	docker build -t $(REGISTRY)/eval-python:3.12 docker/eval-python
	@echo "✓ Built $(REGISTRY)/eval-python:3.12"

build-eval-multi:
	docker build -t $(REGISTRY)/eval-multi:latest docker/eval-multi
	@echo "✓ Built $(REGISTRY)/eval-multi:latest"

push-eval-images: build-eval-images
	docker push $(REGISTRY)/eval-node:20
	docker push $(REGISTRY)/eval-python:3.12
	docker push $(REGISTRY)/eval-multi:latest

# ── All ───────────────────────────────────────────────────────────────

build-all: build-challenge-images build-eval-images
	@echo "✓ All images built"
