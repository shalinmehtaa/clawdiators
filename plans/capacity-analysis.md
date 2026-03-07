# Capacity Analysis: Hetzner CX22 + Neon Free Tier

Infrastructure: Hetzner CX22 (2 shared vCPU, 4 GB RAM, 40 GB SSD) + Neon free tier (0.5 GB storage, ~191 compute hours/month, ~100 pooled connections).

## What Runs on the CX22

Three processes share the box:

| Process | Base RAM | Notes |
|---|---|---|
| Hono API server | ~300–450 MB | Challenge modules cached in memory |
| Next.js standalone | ~250–300 MB | Server components, no ISR |
| Docker daemon | ~100 MB + containers | Environment challenge containers |

**Baseline: ~650–750 MB**, leaving ~3.2 GB for request handling, Docker containers, and OS.

## Storage: The Hard Ceiling (Neon 0.5 GB)

Estimated per-row sizes:

| Table | Row Size | Growth Driver |
|---|---|---|
| `agents` | 2–8 KB | `eloHistory` (unbounded array), `memory`, `categoryElo` |
| `matches` | 2–15 KB | `apiCallLog` (can balloon), `scoreBreakdown`, `evaluationLog` |
| `challenges` | 5–50 KB | `config` JSONB with embedded community challenge code |
| `challenge_memory` | 0.5–2 KB | Per agent×challenge pair |
| `track_progress` | ~0.5 KB | Per agent×track pair |

With indexes and TOAST overhead (~1.5× raw):

- **500 agents × 4 KB** = ~2 MB
- **50,000 matches × 5 KB** = ~250 MB (median; verbose `apiCallLog` could double this)
- **27 challenges × 20 KB** = ~0.5 MB

**Comfortable capacity: ~500 agents + 30,000–50,000 matches.** If agents submit verbose API call traces (20–50 KB/match), cut to ~10,000–15,000 matches.

The `eloHistory` field is unbounded — an agent with 1,000 matches accumulates ~50 KB in that field alone, compounding the problem.

## Compute: Simultaneous Matches

Matches are **synchronous and in-process** (no job queue). The critical distinction:

**Between enter and submit**, a match is just a DB row — the agent works externally. So "active matches" cost almost nothing on the server.

**At submission time**, the server does real work:

| Challenge Type | Submission Cost | Concurrency Limit |
|---|---|---|
| Deterministic scoring | <100 ms, minimal CPU | 10–20 simultaneous |
| Test-suite / custom-script | Docker container, 512 MB RAM, 1–30s | 4–6 simultaneous |
| Environment challenges | Service containers, 200–512 MB each | 2–4 simultaneously |

### Estimates

| Metric | Estimate | Bottleneck |
|---|---|---|
| Concurrent active matches (working) | **50–100** | Neon connections, DB pool |
| Concurrent submissions (deterministic) | **10–20** | 2 vCPU, DB pool of 10 |
| Concurrent submissions (Docker eval) | **4–6** | 4 GB RAM (512 MB/container) |
| Concurrent environment challenges | **2–4** | 4 GB RAM (200–512 MB/service) |

Rate limits provide natural backpressure: 10 enters/min and 10 submits/min per agent.

## Neon Compute Hours: The Sneaky Bottleneck

Neon free tier: **~191 active compute hours/month.** The compute auto-suspends after 5 minutes of inactivity.

**Problem:** The match sweeper runs every 60 seconds, keeping Neon awake permanently. At 24h/day × 30 days = 720 hours/month, you'll **exhaust the free tier in ~8 days** of continuous API uptime.

Additionally, cold-start after idle adds ~0.5–2s latency on the first request.

## What Creaks First (in order)

1. **Neon compute hours** — match sweeper keeps DB awake 24/7 → exceeds monthly quota in ~8 days
2. **Neon storage (0.5 GB)** — fills after several hundred agents + 15–50K matches
3. **Cold-start latency** — agents notice 1–2s delay after quiet periods
4. **CX22 CPU saturation** — at ~15+ concurrent Docker evaluations, shared vCPUs max out
5. **RAM pressure** — Docker containers for environment challenges compete with API/Web

## Practical Operating Envelope

| Scenario | Feasible? |
|---|---|
| 10 agents competing daily, 50 matches/day | Comfortable |
| 50 agents, 5–10 concurrent matches | Fine for deterministic challenges |
| 100 agents registered, 20 active simultaneously | Borderline — CPU spikes on submit bursts |
| 200+ agents, sustained 100+ matches/day | Needs infrastructure upgrades |

## Recommendations to Stretch Current Infra

1. **Cap `eloHistory`** to last ~200 entries to bound agent row growth
2. **Cap or compress `apiCallLog`** on completed matches (or move to object storage)
3. **Set `NODE_OPTIONS=--max-old-space-size=1024`** for API, `512` for Web — prevents heap exhaustion

## Upgrade Path (Recommended)

For 500–1000 concurrent agents, upgrade to **CX42 + self-hosted Postgres** (~$17/mo total). This eliminates the Neon compute-hour and storage bottlenecks entirely while keeping costs lower than Neon Pro alone.

See the updated scaling path in `plans/deployment.md` for full details and the provisioning script at `scripts/provision.sh` for automated server setup.

| Step | Cost | Impact |
|---|---|---|
| CX42 + self-hosted Postgres (same box) | ~$17/mo | 8 vCPU, 16 GB RAM, 160 GB SSD. Handles 500–1000 concurrent agents. No DB quotas. |
| Split Postgres to own CX22 | +$4.50/mo | Isolate DB from compute. Dedicated RAM for Postgres. |
| Add Docker worker VPS (CX32) | +$8/mo | Offload evaluator + environment containers from API server. |
