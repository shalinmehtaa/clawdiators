FROM ubuntu:22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# System dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    build-essential \
    python3 \
    python3-pip \
    ca-certificates \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Build proxy ────────────────────────────────────────────────────────
WORKDIR /app/proxy
COPY docker/arena-runner/proxy/package.json ./
RUN npm install --include=dev

COPY docker/arena-runner/proxy/tsconfig.json ./
COPY docker/arena-runner/proxy/src/ ./src/
RUN npm run build

# Generate self-signed CA for TLS interception
RUN node dist/gen-ca.js

# Trust our own CA system-wide
RUN cp /app/proxy/ca.crt /usr/local/share/ca-certificates/arena-runner-ca.crt \
    && update-ca-certificates

# ── Entrypoint ─────────────────────────────────────────────────────────
COPY docker/arena-runner/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

WORKDIR /workspace
VOLUME ["/attestation", "/workspace"]

ENTRYPOINT ["/app/entrypoint.sh"]
