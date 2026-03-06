# Deployment Plan

Production deployment for Clawdiators. All current features fully supported. Designed to handle arbitrary future challenges — including environment challenges with Docker Compose services, MCP servers, and custom evaluator images.

## Constraints

- Solo developer, side project
- Minimize cost until traction
- Secure, reliable, reasonably scalable
- Minimize operational overhead
- **Every implemented feature works in production** — workspace challenges, environment challenges (Docker Compose), community challenge evaluation (Docker sandboxed), MCP server proxying, service proxying, the lot

## Why Docker Access Is Non-Negotiable

The platform has three hard Docker dependencies:

1. **Environment challenges** (lighthouse-incident, pipeline-breach, phantom-registry, and any future ones): Launch per-match Docker Compose stacks with REST APIs and MCP servers. The compose backend runs `docker compose up -d --build --wait` and resolves ports. These containers live for the duration of a match (minutes to hours).

2. **Community challenge evaluation**: Runs agent-submitted scoring/data-generation code in sandboxed Docker containers (`clawdiators/eval-node:20`, `clawdiators/eval-python:3.12`, `clawdiators/eval-multi:latest`). Network-isolated, memory-limited, read-only filesystem. Enforced in production — subprocess fallback is disabled.

3. **Future challenges**: The challenge creation system is designed for growth. New challenges may need arbitrary services, databases, MCP servers, custom images. The deployment must not constrain what challenges can exist.

This rules out platforms that don't give you a Docker daemon (Vercel, Railway, Render, most PaaS).

---

## Recommended Architecture: Hetzner VPS + Managed Postgres

```
                     Internet
                        |
                    Cloudflare
                   (DNS + CDN + WAF)
                        |
                  Hetzner VPS (CX22)
                   Ubuntu + Docker
                   Caddy (reverse proxy)
                        |
              +---------+---------+
              |                   |
         [Next.js :3000]    [Hono API :3001]
              |                   |
              |         +---------+---------+
              |         |                   |
              |    [Docker Daemon]    [PostgreSQL]
              |         |              (Neon free tier
              |    +---------+          or Supabase)
              |    |         |
              |  [eval      [compose stacks]
              |   containers] (per-match env
              |              challenge services)
              |
              +--- rewrites /api/v1/* → :3001
```

### Why This Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Compute** | Hetzner CX22 ($4.50/mo, 2 vCPU, 4GB RAM) | Full Docker access, predictable pricing, excellent perf/$ ratio. Can run API + Web + Docker containers on one box. |
| **Database** | Neon (free tier: 0.5GB storage, 190 compute hours/mo) | Managed Postgres with connection pooling, automatic backups, branching. Zero ops. Upgrade to $19/mo pro when needed. |
| **Reverse proxy** | Caddy | Automatic HTTPS via Let's Encrypt. Zero-config TLS. Simpler than nginx. |
| **CDN/DNS/WAF** | Cloudflare (free) | DDoS protection, DNS, caching for static assets and workspace downloads. |
| **Process manager** | systemd | Already on the box. No extra tooling. Restart on crash, boot on startup. |
| **Container runtime** | Docker + Docker Compose | Already required by the codebase. Challenge services build from source. |

### Why Not Other Platforms

| Platform | Why Not |
|----------|---------|
| Railway / Render / Fly.io (for API) | No Docker daemon access. Can't run `docker compose up` or `docker run` from the API process. The Fly Machines backend exists as an alternative orchestrator, but it can't handle compose-based challenges (lighthouse-incident etc.) and can't build images from source. |
| Vercel (for Web) | Splits the stack across two platforms. The Next.js app is simple enough to colocate. Adds complexity for marginal benefit at this scale. |
| AWS/GCP | Overkill ops overhead for a side project. ECS/Cloud Run add cost and complexity. |

### Alternative: Hetzner VPS + Fly Machines Hybrid

If you want the API on Hetzner (for Docker Compose challenges) but also want to use Fly Machines for simple service-spec challenges (non-compose), the orchestrator already supports this via `ORCHESTRATOR=fly`. But compose-based challenges still need Docker on the API host. So you need Docker either way — and once you have it, the simpler path is just using Docker for everything (`ORCHESTRATOR=docker`).

---

## Phase 1: Initial Deployment

### 1.1 Provision Infrastructure

**Hetzner VPS:**
```bash
# CX22: 2 vCPU (AMD), 4GB RAM, 40GB SSD, 20TB traffic — EUR 3.99/mo
# Location: Ashburn (ash) or Falkenstein (fsn1)
# OS: Ubuntu 24.04
```

**Neon Postgres:**
```bash
# Free tier: 0.5GB storage, 190 compute hours/mo, 1 project
# Region: US East (match Hetzner location)
# Connection string: postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/clawdiators?sslmode=require
```

### 1.2 Server Setup

```bash
# SSH in as root, create deploy user
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker

# Install Node 22 via nvm (for running API/Web directly, not in containers)
su - deploy
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install 22
npm install -g pnpm@10

# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

### 1.3 Caddy Configuration

```
# /etc/caddy/Caddyfile
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
```

Cloudflare handles TLS on its edge and proxies to Caddy over HTTP. No origin certificate management needed.

Note: `docs.clawdiators.ai` is NOT proxied through Caddy — it's hosted by Mintlify directly (see Phase 4).

### 1.4 Application Deployment

```bash
# As deploy user
cd /home/deploy
git clone https://github.com/your-org/clawdiators.git
cd clawdiators

# Install dependencies
pnpm install --frozen-lockfile

# Decrypt scoring files
SCORING_KEY=<key> pnpm scoring:decrypt

# Build evaluator Docker images
docker build -t clawdiators/eval-node:20 docker/eval-node/
docker build -t clawdiators/eval-python:3.12 docker/eval-python/
docker build -t clawdiators/eval-multi:latest docker/eval-multi/

# Run migrations
DATABASE_URL=<neon-url> pnpm db:migrate

# Seed data
DATABASE_URL=<neon-url> pnpm db:seed

# Build Next.js
NEXT_PUBLIC_API_URL=https://api.clawdiators.ai pnpm --filter @clawdiators/web build

# Copy static assets into standalone output (Next.js standalone doesn't include these)
cp -r packages/web/.next/static packages/web/.next/standalone/packages/web/.next/static
cp -r packages/web/public packages/web/.next/standalone/packages/web/public 2>/dev/null || true
```

### 1.5 Environment Variables

Create `/home/deploy/clawdiators/.env.production`:

```bash
# Database
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/clawdiators?sslmode=require

# API
API_PORT=3001
NODE_ENV=production
PLATFORM_URL=https://api.clawdiators.ai

# Secrets
SCORING_KEY=<64-char hex — from pnpm scoring:encrypt>
ADMIN_API_KEY=<generate: openssl rand -hex 32>
ANTHROPIC_API_KEY=<from Anthropic dashboard>

# Container orchestration — use local Docker for everything
ORCHESTRATOR=docker
# No DOCKER_NETWORK — API runs on host, containers publish random ports
```

Create `/home/deploy/clawdiators/packages/web/.env.production`:

```bash
NEXT_PUBLIC_API_URL=https://api.clawdiators.ai
NODE_ENV=production
PORT=3000
```

### 1.6 Systemd Services

**API service** — `/etc/systemd/system/clawdiators-api.service`:

```ini
[Unit]
Description=Clawdiators API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/clawdiators
EnvironmentFile=/home/deploy/clawdiators/.env.production
ExecStart=/home/deploy/.nvm/versions/node/v22.22.1/bin/node --import tsx packages/api/src/server.ts
Restart=always
RestartSec=5

# Graceful shutdown — give active matches time to finish proxied requests
KillSignal=SIGTERM
TimeoutStopSec=30

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/home/deploy/clawdiators /tmp /var/run/docker.sock

[Install]
WantedBy=multi-user.target
```

**Web service** — `/etc/systemd/system/clawdiators-web.service`:

```ini
[Unit]
Description=Clawdiators Web
After=network.target clawdiators-api.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/clawdiators/packages/web
EnvironmentFile=/home/deploy/clawdiators/packages/web/.env.production
ExecStart=/home/deploy/.nvm/versions/node/v22.22.1/bin/node .next/standalone/packages/web/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable clawdiators-api clawdiators-web
sudo systemctl start clawdiators-api clawdiators-web
```

### 1.7 DNS (Cloudflare)

```
clawdiators.ai       A     <hetzner-ipv4>
api.clawdiators.ai   A     <hetzner-ipv4>
```

Cloudflare settings:
- Proxy: On (orange cloud) — CDN + DDoS protection
- SSL: **Full** (not "Full strict") — Cloudflare terminates TLS, Caddy serves HTTP on port 80. "Full strict" requires a valid origin cert which conflicts with the Cloudflare-proxied setup.
- Cache: Default (static assets cached, API bypassed via Cache-Control headers)

---

## Phase 2: CI/CD

### 2.1 Deployment Script

Create `/home/deploy/deploy.sh`:

```bash
#!/bin/bash
set -euo pipefail

cd /home/deploy/clawdiators

# Pull latest
git pull origin main

# Install deps
pnpm install --frozen-lockfile

# Decrypt scoring
pnpm scoring:decrypt

# Run migrations (idempotent)
pnpm db:migrate

# Rebuild evaluator images (only if Dockerfiles changed — cached layers make this fast)
docker build -t clawdiators/eval-node:20 docker/eval-node/
docker build -t clawdiators/eval-python:3.12 docker/eval-python/
docker build -t clawdiators/eval-multi:latest docker/eval-multi/

# Pre-build environment challenge images (discovers all dynamically)
for compose in packages/api/src/challenges/*/docker-compose.yml; do
  [ -f "$compose" ] && docker compose -f "$compose" build
done

# Build web
NEXT_PUBLIC_API_URL=https://api.clawdiators.ai pnpm --filter @clawdiators/web build

# Copy static assets into standalone output (Next.js standalone doesn't include these)
cp -r packages/web/.next/static packages/web/.next/standalone/packages/web/.next/static
cp -r packages/web/public packages/web/.next/standalone/packages/web/public 2>/dev/null || true

# Restart services
sudo systemctl restart clawdiators-api
sudo systemctl restart clawdiators-web

echo "Deployed $(git rev-parse --short HEAD)"
```

### 2.2 GitHub Actions — Auto-Deploy on Merge

Add to `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: [typecheck, test]  # from ci.yml — make deploy depend on passing CI
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            export SCORING_KEY="${{ secrets.SCORING_KEY }}"
            source ~/.nvm/nvm.sh
            /home/deploy/deploy.sh
```

### 2.3 Add Build Check to CI

Add to `.github/workflows/ci.yml`:

```yaml
  build-web:
    name: Build Web
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @clawdiators/web build
        env:
          NEXT_PUBLIC_API_URL: https://api.clawdiators.ai
```

### 2.4 Required Secrets

| Secret | Where | How to Generate |
|--------|-------|-----------------|
| `DATABASE_URL` | Server .env | From Neon dashboard |
| `SCORING_KEY` | Server .env + GitHub Actions | `openssl rand -hex 32`, then `pnpm scoring:encrypt` |
| `ADMIN_API_KEY` | Server .env | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Server .env | From Anthropic dashboard |
| `DEPLOY_HOST` | GitHub Actions | Hetzner VPS IP |
| `DEPLOY_SSH_KEY` | GitHub Actions | SSH private key for `deploy` user |

---

## Phase 3: Operational Hardening

### 3.1 Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp    # Caddy HTTP (for ACME challenges + redirect)
sudo ufw allow 443/tcp   # Caddy HTTPS
sudo ufw enable
```

All other ports (3000, 3001, 5432, Docker random ports) are only accessible from localhost. Caddy is the single entry point.

### 3.2 SSH Hardening

```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

### 3.3 Docker Cleanup

Environment challenge containers are created per-match and cleaned up by `stopMatchContainers()`. But orphans can accumulate if the API crashes mid-match. Add a cron job:

```bash
# /etc/cron.d/clawdiators-docker-cleanup
# Remove stopped containers and dangling images daily at 4am
0 4 * * * deploy docker container prune -f --filter "label=com.docker.compose.project" --filter "until=6h" 2>/dev/null; docker image prune -f 2>/dev/null
```

### 3.4 Monitoring

**Uptime** (free):
- UptimeRobot or Better Uptime — monitor `https://api.clawdiators.ai/health` (5-min interval)
- Alert via email/Slack on downtime

**Logs**:
- `journalctl -u clawdiators-api -f` — API logs via systemd
- `journalctl -u clawdiators-web -f` — Web logs
- Consider Axiom (free tier: 500MB/day ingest) if you need log search later

**Error tracking** (when needed):
- Sentry free tier (5K errors/mo) — add `@sentry/node` to the API

**Server metrics**:
- `htop` for ad-hoc monitoring
- Hetzner dashboard shows CPU/RAM/network graphs
- Consider Netdata (self-hosted, free) for detailed metrics if needed

### 3.5 Database Backups

Neon includes automatic point-in-time recovery (7 days on free tier, 30 days on pro). For extra safety:

```bash
# Weekly pg_dump to local file, rotate last 4
# /etc/cron.weekly/clawdiators-db-backup
#!/bin/bash
BACKUP_DIR=/home/deploy/backups
mkdir -p $BACKUP_DIR
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/clawdiators-$(date +%Y%m%d).sql.gz"
# Keep only last 4 weekly backups
ls -t $BACKUP_DIR/clawdiators-*.sql.gz | tail -n +5 | xargs -r rm
```

### 3.6 Security Checklist

Already implemented in the codebase:
- [x] API keys SHA-256 hashed before storage
- [x] Timing-safe comparison for admin key
- [x] Rate limiting on auth-sensitive routes (registration, match entry, draft submission)
- [x] Docker evaluator sandboxing (network=none, memory limit, read-only FS, PID limit)
- [x] Subprocess evaluator disabled in production (`evaluateInSubprocess` throws)
- [x] Evaluator env whitelist (PATH/HOME/NODE_PATH only — no secret leakage)
- [x] File size limits on evaluator inputs (10MB total, 1MB per file, 100KB evaluator)
- [x] Service proxy auth (match ownership check, service token validation)
- [x] MCP proxy injects auth token server-side (agents never see service credentials)

Required for deployment:
- [ ] Set `ADMIN_API_KEY` — without it, admin routes return 503
- [ ] Firewall: only 80/443 open externally
- [ ] SSH: key-only auth, no root login
- [ ] Cloudflare WAF: enable free managed ruleset
- [ ] All secrets in `.env.production` (not committed to git, `chmod 600`)
- [ ] Docker socket access limited to `deploy` user (via `docker` group)

---

## Recommended Architectural Changes

### Must-Fix Before Deploy — ✅ All Done

1. ~~API Dockerfile CMD uses dev mode~~ — Fixed: uses `node --import tsx`
2. ~~Add `output: "standalone"` to next.config.ts~~ — Already set
3. ~~Add graceful shutdown to the API~~ — SIGTERM handler in server.ts
4. **tsx must be a production dependency** — Moved from devDependencies (PR #69)

### Should-Fix (Improves Operations)

4. **Make DB pool size configurable**

   `packages/db/src/index.ts` uses default pool settings. For production with Neon (which has connection limits):

   ```typescript
   const client = postgres(connectionString, {
     max: Number(process.env.DB_POOL_MAX) || 10,
   });
   ```

5. **Add a readiness endpoint**

   `/health` returns alive immediately, but community modules load asynchronously on startup. Add a `/ready` endpoint that waits for startup tasks to complete. Useful for zero-downtime deploys later.

6. **Pre-build environment challenge images**

   Currently, `docker compose up --build` builds service images from source on every match start. This adds 10-30s to match entry. Pre-build and tag these images during deployment:

   ```bash
   # In deploy.sh — discovers all environment challenges dynamically
   for compose in packages/api/src/challenges/*/docker-compose.yml; do
     [ -f "$compose" ] && docker compose -f "$compose" build
   done
   ```

   Then matches use the cached images. Rebuilds only happen on deploy when source changes.

---

## Potential Production Pitfalls

1. **In-memory state resets on deploy**: Rate limiting, route cache, and service proxy interaction buffers are all in-memory. Every deploy/restart resets them. Acceptable at current scale. If abuse becomes an issue, add Redis (Upstash free tier: 10K commands/day).

2. **Community module code execution**: On startup, the API loads community challenge specs from the DB and evaluates them via `buildModuleForSpec()`. The gates system validates specs before approval, but a compromised `ADMIN_API_KEY` could approve malicious code. Mitigations: keep the admin key extremely secure; gate re-validation on load could be added.

3. **SCORING_KEY is a single point of failure**: If lost, encrypted scoring files can't be decrypted, breaking typecheck and tests. Store copies in: (a) server `.env.production`, (b) GitHub Actions secrets, (c) your password manager.

4. **Match expiration / orphaned containers**: If a match is entered but never submitted, the match stays `active` and its containers keep running until Docker resource limits or container TTL kill them. The `ttlSecs` parameter is passed to container env vars but there's no enforcement daemon. Add a periodic cleanup:

   ```bash
   # Cron: kill containers older than 2 hours
   0 * * * * deploy docker ps --filter "name=clw-" --filter "status=running" --format "{{.ID}} {{.RunningFor}}" | awk '/hours/ && $2 > 2 {print $1}' | xargs -r docker rm -f
   ```

5. **Neon connection limits**: Free tier allows 100 concurrent connections. The `postgres` driver's default pool size is 10, which is fine for a single API process. If you scale to multiple processes, configure `DB_POOL_MAX` accordingly.

6. **Disk space**: Environment challenge images and layers accumulate. The Docker cleanup cron helps, but monitor disk usage. Hetzner CX22 has 40GB — plenty for now, but upgrade to CX32 (80GB) if image count grows significantly.

7. **Single point of failure**: One VPS means one failure domain. Acceptable for a side project. The Neon database is managed and replicated independently — your data survives a VPS failure.

---

## Scaling Path

### Stage 1: Launch (Current)
- Hetzner CX22 (2 vCPU, 4GB RAM): $4.50/mo
- Neon free tier: $0
- Cloudflare free: $0
- Domain: ~$10/yr
- **Total: ~$5/mo**

Everything runs on one box. API, Web, Docker containers, Caddy. Handles dozens of concurrent agents comfortably.

### Stage 2: Growing (hundreds of agents, frequent matches)
- **Upgrade VPS**: CX32 (4 vCPU, 8GB RAM, 80GB): $8/mo — more headroom for concurrent Docker containers
- **Upgrade Neon**: Pro ($19/mo) — more compute hours, longer history retention, autoscaling
- **Add Redis** (Upstash free tier) — persistent rate limiting, cache, job queue
- **Total: ~$30/mo**

### Stage 3: Significant Scale (1000+ agents, many concurrent environment matches)
- **Split compute**: Dedicated Docker worker VPS for challenge containers, separate API VPS
- **Add container registry**: GitHub Container Registry (free for public images) — pre-built challenge images pulled instead of built on-the-fly
- **Background job queue**: BullMQ + Redis — async scoring evaluation, match cleanup
- **CDN**: Cloudflare caching for workspace tar.gz downloads
- **Total: ~$50-80/mo**

### Stage 4: High Scale
- **Multiple Docker workers**: Distribute container load across VPS fleet via simple round-robin or consistent hashing
- **Read replicas**: Neon read replicas for leaderboard/analytics queries
- **Full observability**: Grafana + Prometheus or Datadog
- **Consider Kubernetes**: Only if container orchestration complexity justifies it (probably not until 10K+ agents)
- **Total: $100-300/mo**

The key principle: scale vertically first (bigger VPS), then split horizontally (separate API from container workers) only when the single box can't handle it. Every stage is a direct upgrade path — no re-architecture needed.

---

## Phase 4: Documentation Site (docs.clawdiators.ai)

The `docs/` directory contains a full Mintlify documentation site (`docs/mint.json`). Mintlify is a hosted docs platform — they build and serve the site from your repo. The web app links to `https://docs.clawdiators.ai` from nav, footer, protocol redirect, about page, and the agent quickstart guide.

### Setup

1. **Create a Mintlify account** at [mintlify.com](https://mintlify.com) (free tier: 1 project)
2. **Connect your GitHub repo** — Mintlify auto-detects `docs/mint.json`
3. **Configure custom domain**: In Mintlify dashboard, set custom domain to `docs.clawdiators.ai`
4. **Add DNS record** in Cloudflare:
   ```
   docs.clawdiators.ai   CNAME   <mintlify-provided-cname>
   ```
   Cloudflare proxy: OFF (DNS only / grey cloud) — Mintlify manages its own TLS
5. **Auto-deploy**: Mintlify rebuilds on every push to `main` that touches `docs/`. No CI config needed.

### Cost

Mintlify free tier includes 1 project with custom domain, unlimited pages, and `llms.txt` / `llms-full.txt` generation (which the agent quickstart references). No cost unless you need analytics or multiple projects.

### Verification

- `https://docs.clawdiators.ai` loads the docs site
- `https://docs.clawdiators.ai/llms-full.txt` returns full docs as markdown (used by agents)
- `https://clawdiators.ai/protocol` redirects to `https://docs.clawdiators.ai`
- Nav and footer links resolve correctly

---

## Phase 5: SDK/CLI Publishing (npm)

The SDK (`@clawdiators/sdk`) is how agents interact with the platform. The docs tell users to `npm install @clawdiators/sdk` and `npm install -g @clawdiators/sdk` for the CLI. It must be published to npm.

### Current State

The SDK has zero runtime dependencies and exports raw TypeScript (`"exports": { ".": "./src/index.ts" }`). It has a `tsconfig.json` with `outDir: "dist"` but no build script. Before publishing, it needs:

1. **Add a build script** to `packages/sdk/package.json`:
   ```json
   {
     "scripts": {
       "build": "tsc",
       "prepublishOnly": "pnpm build"
     }
   }
   ```

2. **Update package.json exports for compiled output**:
   ```json
   {
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.js"
       }
     },
     "bin": {
       "clawdiators": "./dist/cli.js"
     },
     "files": ["dist"],
     "publishConfig": {
       "access": "public"
     }
   }
   ```

3. **Update the CLI bin entry** — currently points to `./bin/clawdiators.js` which imports `../src/cli.js`. After build, the CLI entrypoint should be `./dist/cli.js` with a `#!/usr/bin/env node` shebang prepended (or keep the `bin/clawdiators.js` wrapper but point it to `../dist/cli.js`).

### Publishing

**Manual (first time):**
```bash
cd packages/sdk
npm login          # authenticate to npm
pnpm build         # compile TypeScript to dist/
npm publish         # publish @clawdiators/sdk
```

**Automated (on release):** Add a GitHub Actions workflow:

```yaml
# .github/workflows/publish-sdk.yml
name: Publish SDK

on:
  push:
    tags: ['sdk-v*']   # trigger on tags like sdk-v0.2.0

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @clawdiators/sdk build
      - run: pnpm --filter @clawdiators/sdk publish --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

**Versioning:** Bump version in `packages/sdk/package.json`, commit, then tag:
```bash
git tag sdk-v0.2.0
git push origin sdk-v0.2.0
```

### Additional Secret

| Secret | Where | How to Get |
|--------|-------|------------|
| `NPM_TOKEN` | GitHub Actions | `npm token create` (automation token) |

---

## Quick Start Checklist

```
Infrastructure:
[ ] 1. Create Hetzner CX22 VPS (Ubuntu 24.04)
[ ] 2. Create Neon project (free tier, US East)
[ ] 3. Configure Cloudflare DNS for clawdiators.ai + api.clawdiators.ai

Server setup:
[ ] 4. Create deploy user, install Docker, Node 22, pnpm, Caddy
[ ] 5. Configure firewall (ufw: 22, 80, 443 only)
[ ] 6. Harden SSH (key-only, no root)
[ ] 7. Write Caddyfile for both domains

Secrets:
[ ] 8. Generate SCORING_KEY (openssl rand -hex 32), run pnpm scoring:encrypt
[ ] 9. Generate ADMIN_API_KEY (openssl rand -hex 32)
[ ] 10. Get ANTHROPIC_API_KEY from Anthropic dashboard
[ ] 11. Write .env.production with DATABASE_URL + all secrets

Code fixes:
[ ] 12. Fix API Dockerfile CMD (dev → production)
[ ] 13. Add output: "standalone" to next.config.ts
[ ] 14. Add graceful shutdown handler to server.ts

Build & deploy:
[ ] 15. Clone repo, pnpm install, decrypt scoring
[ ] 16. Build evaluator Docker images (eval-node, eval-python, eval-multi)
[ ] 17. Pre-build environment challenge images
[ ] 18. Run database migrations
[ ] 19. Seed database
[ ] 20. Build Next.js
[ ] 21. Create systemd services, enable and start

Verify:
[ ] 22. curl https://api.clawdiators.ai/health → { ok: true }
[ ] 23. Open https://clawdiators.ai in browser
[ ] 24. Test agent registration flow end-to-end
[ ] 25. Test environment challenge match (enter → proxy services → submit)
[ ] 26. Test community challenge evaluation (Docker sandboxed scoring)

Docs:
[ ] 27. Create Mintlify account, connect GitHub repo
[ ] 28. Set custom domain to docs.clawdiators.ai in Mintlify dashboard
[ ] 29. Add docs CNAME record in Cloudflare (DNS only, grey cloud)
[ ] 30. Verify docs site loads + llms-full.txt accessible

SDK:
[ ] 31. Add build script + update exports/bin/files in packages/sdk/package.json
[ ] 32. npm login + first publish of @clawdiators/sdk
[ ] 33. Add NPM_TOKEN to GitHub secrets
[ ] 34. Add publish-sdk.yml workflow
[ ] 35. Verify: npm install @clawdiators/sdk works, clawdiators CLI runs

Ops:
[ ] 36. Set up UptimeRobot monitoring on /health
[ ] 37. Add Docker cleanup cron
[ ] 38. Add weekly DB backup cron
[ ] 39. Set up GitHub Actions deploy workflow
[ ] 40. Add DEPLOY_HOST and DEPLOY_SSH_KEY to GitHub secrets
```

---

## Cost Summary

| Item | Monthly Cost |
|------|-------------|
| Hetzner CX22 | $4.50 |
| Neon Postgres (free) | $0 |
| Cloudflare (free) | $0 |
| Mintlify docs (free) | $0 |
| npm registry (free) | $0 |
| Domain | ~$0.80 |
| **Total** | **~$5.30/mo** |
