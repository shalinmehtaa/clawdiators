#!/bin/bash
# provision.sh — Sets up a fresh Ubuntu 24.04 Hetzner VPS for Clawdiators
#
# Run as root on a new server. Creates a deploy user, installs all
# dependencies, configures systemd services, Caddy, firewall, and cron jobs.
#
# After running:
#   1. Copy .env.production files to the server
#   2. Run deploy.sh once as the deploy user
#   3. Update DEPLOY_HOST in GitHub Actions secrets
#   4. Update Cloudflare DNS A records
#
# Usage:
#   scp scripts/provision.sh root@<server-ip>:/root/
#   ssh root@<server-ip> ./provision.sh

set -euo pipefail

# ─── Configuration ──────────────────────────────────────────────────────────

DEPLOY_USER="deploy"
REPO_URL="https://github.com/clawdiators-ai/clawdiators.git"
NODE_VERSION="22"
PNPM_VERSION="10"
APP_DIR="/home/${DEPLOY_USER}/clawdiators"

# ─── Preflight ──────────────────────────────────────────────────────────────

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: Run this script as root."
  exit 1
fi

echo "=== Clawdiators Server Provisioning ==="
echo ""
echo "This will set up:"
echo "  - Deploy user (${DEPLOY_USER})"
echo "  - Docker + Docker Compose"
echo "  - Node.js ${NODE_VERSION} + pnpm ${PNPM_VERSION}"
echo "  - Caddy reverse proxy"
echo "  - Systemd services for API + Web"
echo "  - Firewall (SSH, HTTP, HTTPS only)"
echo "  - PostgreSQL in Docker (self-hosted)"
echo "  - Cron jobs (Docker cleanup, DB backups)"
echo ""
read -rp "Continue? [y/N] " confirm
[[ "$confirm" =~ ^[yY]$ ]] || exit 0

# ─── System Updates ─────────────────────────────────────────────────────────

echo ""
echo "=== Updating system packages ==="
apt update && apt upgrade -y
apt install -y curl git ufw jq unzip

# ─── Create Deploy User ─────────────────────────────────────────────────────

echo ""
echo "=== Creating deploy user ==="
if id "${DEPLOY_USER}" &>/dev/null; then
  echo "User ${DEPLOY_USER} already exists, skipping."
else
  adduser --disabled-password --gecos "" "${DEPLOY_USER}"
fi
usermod -aG sudo "${DEPLOY_USER}"

# Allow sudo without password for deploy user (for systemctl restart)
echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart clawdiators-*, /usr/bin/systemctl stop clawdiators-*, /usr/bin/systemctl start clawdiators-*, /usr/bin/systemctl daemon-reload" > /etc/sudoers.d/clawdiators
chmod 440 /etc/sudoers.d/clawdiators

# Copy root's authorized_keys to deploy user (so you can SSH as deploy)
mkdir -p /home/${DEPLOY_USER}/.ssh
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys /home/${DEPLOY_USER}/.ssh/authorized_keys
  chown -R ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/.ssh
  chmod 700 /home/${DEPLOY_USER}/.ssh
  chmod 600 /home/${DEPLOY_USER}/.ssh/authorized_keys
fi

# ─── Install Docker ─────────────────────────────────────────────────────────

echo ""
echo "=== Installing Docker ==="
if command -v docker &>/dev/null; then
  echo "Docker already installed, skipping."
else
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable docker
usermod -aG docker "${DEPLOY_USER}"

# ─── Install Node.js via nvm ────────────────────────────────────────────────

echo ""
echo "=== Installing Node.js ${NODE_VERSION} ==="
su - "${DEPLOY_USER}" -c "
  if [ ! -d ~/.nvm ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
  fi
  export NVM_DIR=\"\$HOME/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  nvm install ${NODE_VERSION}
  nvm alias default ${NODE_VERSION}
  npm install -g pnpm@${PNPM_VERSION}
"

# Resolve the actual node binary path for systemd
NODE_BIN=$(su - "${DEPLOY_USER}" -c "
  export NVM_DIR=\"\$HOME/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  which node
")
echo "Node binary: ${NODE_BIN}"

# ─── Install Caddy ──────────────────────────────────────────────────────────

echo ""
echo "=== Installing Caddy ==="
if command -v caddy &>/dev/null; then
  echo "Caddy already installed, skipping."
else
  apt install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt update && apt install -y caddy
fi

# ─── Configure Caddy ────────────────────────────────────────────────────────

echo ""
echo "=== Configuring Caddy ==="
cat > /etc/caddy/Caddyfile << 'CADDYEOF'
# Cloudflare terminates TLS — Caddy serves HTTP on port 80.
# Cloudflare SSL mode must be set to "Full" (not "Full strict").

:80 {
    @web host clawdiators.ai
    handle @web {
        reverse_proxy localhost:3000
    }

    @api host api.clawdiators.ai
    handle @api {
        reverse_proxy localhost:3001
    }
}
CADDYEOF

systemctl enable caddy
systemctl restart caddy

# ─── Systemd Services ───────────────────────────────────────────────────────

echo ""
echo "=== Creating systemd services ==="

cat > /etc/systemd/system/clawdiators-api.service << EOF
[Unit]
Description=Clawdiators API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=${DEPLOY_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env.production
ExecStart=${NODE_BIN} --max-old-space-size=1024 --import tsx packages/api/src/server.ts
Restart=always
RestartSec=5

# Graceful shutdown — give active matches time to finish proxied requests
KillSignal=SIGTERM
TimeoutStopSec=30

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/${DEPLOY_USER}/clawdiators /tmp /var/run/docker.sock

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/clawdiators-web.service << EOF
[Unit]
Description=Clawdiators Web
After=network.target clawdiators-api.service

[Service]
Type=simple
User=${DEPLOY_USER}
WorkingDirectory=${APP_DIR}/packages/web
EnvironmentFile=${APP_DIR}/packages/web/.env.production
ExecStart=${NODE_BIN} --max-old-space-size=512 .next/standalone/packages/web/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
# Don't enable yet — they'll fail without the app code and .env files
echo "Systemd services created (not started — run deploy.sh first)."

# ─── Firewall ───────────────────────────────────────────────────────────────

echo ""
echo "=== Configuring firewall ==="
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "Firewall enabled: SSH, HTTP, HTTPS only."

# ─── SSH Hardening ──────────────────────────────────────────────────────────

echo ""
echo "=== Hardening SSH ==="
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl restart sshd

# ─── Create Directories ─────────────────────────────────────────────────────

echo ""
echo "=== Creating directories ==="
su - "${DEPLOY_USER}" -c "mkdir -p /home/${DEPLOY_USER}/backups"

# ─── Clone Repository ───────────────────────────────────────────────────────

echo ""
echo "=== Cloning repository ==="
if [ -d "${APP_DIR}" ]; then
  echo "Repository already exists at ${APP_DIR}, skipping clone."
else
  su - "${DEPLOY_USER}" -c "git clone ${REPO_URL} ${APP_DIR}"
fi

# ─── Create Deploy Script ───────────────────────────────────────────────────

echo ""
echo "=== Creating deploy script ==="
cat > /home/${DEPLOY_USER}/deploy.sh << 'DEPLOYEOF'
#!/bin/bash
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

# Run database migrations
pnpm db:migrate

# Build evaluator Docker images (cached layers make this fast if unchanged)
docker build -t clawdiators/eval-node:20 docker/eval-node/
docker build -t clawdiators/eval-python:3.12 docker/eval-python/
docker build -t clawdiators/eval-multi:latest docker/eval-multi/

# Pre-build environment challenge images (skip _template)
for compose in packages/api/src/challenges/*/docker-compose.yml; do
  [[ "$compose" == *"_template"* ]] && continue
  [ -f "$compose" ] && docker compose -f "$compose" build
done

# Build Next.js
NEXT_PUBLIC_API_URL=https://api.clawdiators.ai pnpm --filter @clawdiators/web build

# Copy static assets into standalone output
cp -r packages/web/.next/static packages/web/.next/standalone/packages/web/.next/static
cp -r packages/web/public packages/web/.next/standalone/packages/web/public 2>/dev/null || true

# Restart services
sudo systemctl restart clawdiators-api
sudo systemctl restart clawdiators-web

echo "Deployed $(git rev-parse --short HEAD) at $(date)"
DEPLOYEOF

chown ${DEPLOY_USER}:${DEPLOY_USER} /home/${DEPLOY_USER}/deploy.sh
chmod +x /home/${DEPLOY_USER}/deploy.sh

# ─── Cron Jobs ──────────────────────────────────────────────────────────────

echo ""
echo "=== Setting up cron jobs ==="

# Docker cleanup: remove stopped containers and dangling images daily at 4am
cat > /etc/cron.d/clawdiators-docker-cleanup << EOF
0 4 * * * ${DEPLOY_USER} docker container prune -f --filter "until=6h" 2>/dev/null; docker image prune -f 2>/dev/null
EOF

# DB backup: weekly pg_dump (Sunday 3am), keep last 4
cat > /etc/cron.d/clawdiators-db-backup << 'EOF'
0 3 * * 0 deploy bash -c 'source /home/deploy/clawdiators/.env.production && pg_dump "$DATABASE_URL" 2>/dev/null | gzip > /home/deploy/backups/clawdiators-$(date +\%Y\%m\%d).sql.gz && ls -t /home/deploy/backups/clawdiators-*.sql.gz | tail -n +5 | xargs -r rm'
EOF

# Orphaned container cleanup: kill match containers older than 2 hours
cat > /etc/cron.d/clawdiators-container-ttl << 'EOF'
0 * * * * deploy docker ps --filter "name=clw-" --filter "status=running" --format "{{.ID}} {{.RunningFor}}" 2>/dev/null | awk '/hours/ && $2 > 2 {print $1}' | xargs -r docker rm -f 2>/dev/null
EOF

chmod 644 /etc/cron.d/clawdiators-*

# ─── Self-Hosted Postgres (Docker) ──────────────────────────────────────────

echo ""
echo "=== Setting up PostgreSQL in Docker ==="

# Generate a random password for Postgres
PG_PASSWORD=$(openssl rand -hex 24)

cat > ${APP_DIR}/docker-compose.prod.yml << EOF
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      POSTGRES_DB: clawdiators
      POSTGRES_USER: clawdiators
      POSTGRES_PASSWORD: ${PG_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    deploy:
      resources:
        limits:
          memory: 2g
    shm_size: 256mb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U clawdiators"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
EOF

chown ${DEPLOY_USER}:${DEPLOY_USER} ${APP_DIR}/docker-compose.prod.yml

# Start Postgres
su - "${DEPLOY_USER}" -c "cd ${APP_DIR} && docker compose -f docker-compose.prod.yml up -d"

echo ""
echo "=== PostgreSQL started ==="
echo "Connection string: postgresql://clawdiators:${PG_PASSWORD}@localhost:5432/clawdiators"
echo ""
echo "Add this to ${APP_DIR}/.env.production:"
echo "  DATABASE_URL=postgresql://clawdiators:${PG_PASSWORD}@localhost:5432/clawdiators"

# ─── Summary ────────────────────────────────────────────────────────────────

echo ""
echo "============================================"
echo "  Provisioning complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo ""
echo "  1. Create ${APP_DIR}/.env.production with:"
echo "     DATABASE_URL=postgresql://clawdiators:${PG_PASSWORD}@localhost:5432/clawdiators"
echo "     API_PORT=3001"
echo "     NODE_ENV=production"
echo "     PLATFORM_URL=https://api.clawdiators.ai"
echo "     SCORING_KEY=<from pnpm scoring:encrypt>"
echo "     ADMIN_API_KEY=$(openssl rand -hex 32)"
echo "     ANTHROPIC_API_KEY=<from Anthropic dashboard>"
echo "     ORCHESTRATOR=docker"
echo ""
echo "  2. Create ${APP_DIR}/packages/web/.env.production with:"
echo "     NEXT_PUBLIC_API_URL=https://api.clawdiators.ai"
echo "     NODE_ENV=production"
echo "     PORT=3000"
echo ""
echo "  3. Run the first deploy:"
echo "     su - deploy"
echo "     SCORING_KEY=<key> /home/deploy/deploy.sh"
echo ""
echo "  4. Enable and start services:"
echo "     sudo systemctl enable clawdiators-api clawdiators-web"
echo "     sudo systemctl start clawdiators-api clawdiators-web"
echo ""
echo "  5. Update GitHub Actions secrets:"
echo "     DEPLOY_HOST=<this server's IP>"
echo "     DEPLOY_SSH_KEY=<SSH private key for deploy user>"
echo ""
echo "  6. Update Cloudflare DNS A records to point to this server"
echo ""
echo "  Postgres password: ${PG_PASSWORD}"
echo "  (save this — it won't be shown again)"
echo ""
