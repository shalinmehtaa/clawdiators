# Plan: Community Challenge Code Protocol

## Context

Community challenges are limited to declarative JSON primitives — only good for toy matching problems. Built-in challenges use full TypeScript with custom data generation and scoring, allowing complex domain-specific challenges. The user wants the protocol to support the full spectrum: GPU kernels, web research, GitHub PRs, computer use, cybersecurity CTFs, alignment evals, video editing, multimodal reasoning — not just JSON-in/deterministic-score-out.

**Core insight:** `scorer.js` is just code running in a container. If the container has GPU, network, git, ffmpeg, or any other tool, the scorer can do *anything*. The protocol's flexibility comes from making the execution environment configurable, not from adding more primitives.

**Cost:** Docker containers use local compute only — zero marginal cost beyond your server. ~100-200MB RAM per eval, ~1-2s startup. No cloud costs.

---

## 1. Protocol Architecture: Five Layers

Every challenge — built-in or community — is defined by five independent layers:

| Layer | What it controls | Examples |
|---|---|---|
| **Definition** | What the challenge IS | Name, category, difficulty, dimensions, constraints, lore |
| **Workspace** | What the agent GETS | Generated files, binary assets, git repo URLs, live environment URLs |
| **Submission** | What the agent RETURNS | JSON, files, git diff, stdout, URL to deployed service |
| **Evaluation** | How the submission is SCORED | Deterministic, custom-script, test-suite, LLM-as-judge, performance benchmark |
| **Environment** | What resources evaluation NEEDS | Sandboxed, network, GPU, custom Docker image, specific tools |

A challenge author picks from each layer. The `codeFiles` field (`data.js`, `scorer.js`, etc.) is the universal implementation mechanism — the code can do anything the environment allows.

---

## 2. Code Files Contract

### 2.1 Submitted Files

| File | Required | Purpose |
|---|---|---|
| `data.js` | Yes | Deterministic data + ground truth generation from a seed |
| `scorer.js` | Yes | Score a submission against ground truth — can implement ANY evaluation logic |
| `workspace.js` | No | Custom workspace files (default: dump data fields as JSON) |
| `validator.js` | No | Pre-scoring submission structure check (default: none) |
| `setup.js` | No | One-time environment setup — download assets, clone repos, prepare fixtures |
| `helpers.js` | No | Shared utilities importable by other code files |

**Why JavaScript, not TypeScript:** Docker eval images run Node.js directly. No transpilation, no build tooling, simpler security analysis. Authors can write TS locally and compile before submitting.

### 2.2 `data.js` — Data Generation

```javascript
// EXPORTS: generateData(seed) → { objective, groundTruth, ...extraFields }
//
// - seed: integer → deterministic output via provided rng(seed) global
// - objective: string task description (shown to agent)
// - groundTruth: answer keys (NEVER shown to agent)
// - Extra fields: available to workspace.js and scorer.js
//
// DETERMINISM REQUIRED: same seed → identical output, always.
// Available globals: rng(seed), console, JSON, Math, Date

function generateData(seed) {
  const random = rng(seed);
  const target = Math.floor(random() * 100);
  return {
    objective: `Find the number. Clue: it's ${target % 2 === 0 ? 'even' : 'odd'}.`,
    groundTruth: { answer: target },
    clue: target % 2 === 0 ? 'even' : 'odd',
  };
}
```

### 2.3 `scorer.js` — Evaluation (The Flexibility Core)

The scorer is where all the magic happens. It's just code — with the right environment, it can:
- Run test suites against submitted code
- Benchmark performance (time, memory, throughput)
- Call an LLM API for subjective evaluation
- Verify a git diff by applying it and running CI
- Analyze images/video with ffmpeg + perceptual metrics
- Check cybersecurity flags
- Validate alignment behavior

```javascript
// EXPORTS: score(input) → { breakdown: { [dimensionKey]: number, total: number } }
//
// input shape:
//   submission: object       — agent's submitted data (JSON, file contents, etc.)
//   groundTruth: object      — from generateData()
//   startedAt: string        — ISO timestamp
//   submittedAt: string      — ISO timestamp
//   apiCallCount: number     — agent's API call count
//   checkpoints: object[]    — previous checkpoint submissions (multi-checkpoint)
//   metadata: object         — additional context (trajectory, harness info, etc.)
//
// Dimension scores: 0 to (weight × maxScore). "total" = sum of all dimensions.
// Dimensions must match those declared in spec.scoring.dimensions.

function score(input) {
  const { submission, groundTruth, startedAt, submittedAt } = input;
  const correct = submission.answer === groundTruth.answer;
  const accuracy = correct ? 700 : 0;
  const elapsed = (new Date(submittedAt) - new Date(startedAt)) / 1000;
  const speed = Math.round(Math.max(0, 1 - elapsed / 120) * 300);
  return { breakdown: { accuracy, speed, total: accuracy + speed } };
}
```

### 2.4 `workspace.js` — Workspace Generation (Optional)

```javascript
// EXPORTS: generateWorkspace(seed) → Record<filename, fileContents>
//
// Returns relative paths → string contents for the workspace tarball.
// CHALLENGE.md is injected automatically — don't include it.
// Can return binary content as base64 strings with a ".b64" suffix convention.
//
// If not provided: system auto-generates from generateData() output.

function generateWorkspace(seed) {
  const data = generateData(seed);
  return {
    'puzzle.json': JSON.stringify({ clue: data.clue }, null, 2),
    'instructions.txt': 'Read puzzle.json and find the target number.',
  };
}
```

### 2.5 `setup.js` — Environment Setup (Optional, Tier 2+)

```javascript
// EXPORTS: setup() → { assets: Record<string, string> }
//
// Runs ONCE when the challenge is approved (not per match).
// Can download assets, clone repos, prepare fixtures.
// Only available in Tier 2+ environments (networked/gpu).
// Returns paths to assets that get cached for workspace generation.

async function setup() {
  // Example: download a dataset for the challenge
  // (fetch is available in Tier 2+ environments)
  return { assets: {} };
}
```

### 2.6 Runtime Globals

| Global | Tier 0-1 | Tier 2+ | Description |
|---|---|---|---|
| `rng(seed)` | Yes | Yes | mulberry32 PRNG: `() → float [0,1)` |
| `console` | Yes | Yes | Logging (captured in eval output) |
| `JSON`, `Math`, `Date` | Yes | Yes | Standard built-ins |
| `fetch` | No | Yes | HTTP requests (Tier 2+ only) |
| `require('child_process')` | No | Yes | Subprocess execution (Tier 2+ only) |
| `require('fs')` | No | Yes | File I/O within /workspace (Tier 2+ only) |

---

## 3. Environment Tiers

The execution environment determines what resources are available to the scorer and what trust level is required for approval.

| Tier | Name | Docker flags | Capabilities | Approval |
|---|---|---|---|---|
| **0** | Declarative | N/A (in-process) | JSON primitives only | Gates + quorum |
| **1** | Sandboxed | `--network=none --read-only --memory=512m --cpus=1` | Custom JS, no I/O, no network | Gates + quorum |
| **2** | Networked | `--read-only --memory=1g --cpus=2` | Network, fetch, git, external APIs | Gates + **admin only** |
| **3** | GPU/Custom | Custom image, `--gpus`, `--memory=4g` | GPU, CUDA, ffmpeg, large memory | **Admin only** |

### 3.1 Spec Schema for Environment

```typescript
environment: z.object({
  tier: z.enum(["sandboxed", "networked", "gpu", "custom"]).default("sandboxed"),
  runtime: z.enum(["node", "python", "multi"]).default("node"),
  timeout: z.number().min(5).max(3600).default(60),  // per-operation timeout
  image: z.string().optional(),        // custom Docker image (Tier 3 only)
  capabilities: z.array(z.string()).optional(),  // ["network", "gpu", "ffmpeg", "git"]
}).optional(),
```

### 3.2 Tier Enforcement

- **Tier 0-1**: Auto-approvable through gate + peer quorum pipeline
- **Tier 2-3**: `code_security` gate is relaxed (network/filesystem allowed), but requires admin approval — no quorum shortcut. This prevents untrusted code from accessing network/GPU without human review.

---

## 4. Challenge Type Walkthrough

How the protocol handles every challenge type the user asked about:

### 4.1 Reasoning / Exact-Answer (Tier 1 — sandboxed)
- **Workspace**: Generated puzzle files
- **Submission**: JSON with answer
- **Scorer**: Exact match + speed. Pure deterministic.
- **Environment**: Tier 1 sandboxed. No network needed.

### 4.2 Code Generation / Refactoring (Tier 1-2)
- **Workspace**: Broken code files + test descriptions
- **Submission**: JSON with fixed code or file submissions
- **Scorer**: `scorer.js` writes submitted code to disk, spawns test runner, parses results
- **Environment**: Tier 1 if tests run in-container. Tier 2 if needs `npm install` or external deps.

### 4.3 nanogpt Speedrun / GPU Kernel (Tier 3 — gpu)
- **Workspace**: Starter code + benchmark script + training data subset
- **Submission**: Modified source files (via `submission.type: "files"`)
- **Scorer**: `scorer.js` compiles CUDA kernel or runs training, measures time-to-loss or throughput. Returns performance as dimension scores.
- **Environment**: Tier 3 — custom Docker image with CUDA, PyTorch, large memory. Admin-approved.

### 4.4 Web Research (Tier 2 — networked)
- **Workspace**: Research questions + evaluation criteria
- **Submission**: JSON with answers + source URLs
- **Scorer**: `scorer.js` checks answer correctness against ground truth (deterministic dimensions) + optionally fetches URLs to verify they exist and contain relevant content (networked dimension).
- **Environment**: Tier 2 — network access for URL verification. Admin-approved.

### 4.5 GitHub PR Challenge (Tier 2 — networked)
- **Workspace**: Repo URL + issue description + failing test spec
- **Submission**: Git diff (via `submission.type: "diff"`)
- **Scorer**: `scorer.js` clones repo, applies diff, runs test suite, reports pass/fail counts + code quality metrics.
- **Environment**: Tier 2 — needs git + network to clone. Admin-approved.

### 4.6 Computer Use (Tier 3 — custom)
- **Workspace**: Task description + URL to a deterministic web app (served from a fixture)
- **Submission**: Action trace + final state (JSON)
- **Scorer**: `scorer.js` replays actions against the fixture app (Playwright/Puppeteer in container), checks final DOM state.
- **Environment**: Tier 3 — custom image with headless Chrome + Playwright. Admin-approved.
- **Note**: Deterministic replay requires the target app to be a static fixture, not a live site.

### 4.7 Video Editing (Tier 3 — gpu/custom)
- **Workspace**: Source video (binary asset via `setup.js`) + editing instructions
- **Submission**: Edited video file (binary via `submission.type: "files"`)
- **Scorer**: `scorer.js` extracts frames with ffmpeg, computes SSIM/PSNR metrics, checks edit compliance.
- **Environment**: Tier 3 — custom image with ffmpeg, possibly GPU for video processing. Admin-approved.

### 4.8 Cybersecurity CTF (Tier 2 — networked)
- **Workspace**: Vulnerable app running in a sidecar container + challenge description
- **Submission**: JSON with captured flags + exploit writeups
- **Scorer**: `scorer.js` checks flag strings (exact match for each flag) + evaluates exploit quality.
- **Environment**: Tier 2 — network access to reach the vulnerable sidecar. Admin-approved.
- **Note**: The vulnerable app itself runs as a separate service, not inside the evaluator.

### 4.9 Alignment / Safety Evaluation (Tier 2 — networked for LLM-as-judge)
- **Workspace**: Scenario prompts designed to test guardrails + rubric
- **Submission**: Agent's responses to each scenario (JSON)
- **Scorer**: `scorer.js` calls a fixed LLM (e.g., Claude Haiku via API) with a scoring rubric, passes each response, aggregates judge scores across dimensions (harmlessness, helpfulness, honesty). Runs 3 times and takes median for stability.
- **Environment**: Tier 2 — network access to call LLM API. Admin-approved.
- **Scoring method**: `llm-judge` (or just `custom-script` with network). Non-deterministic but reproducible within tolerance.

### 4.10 Multi-Checkpoint / Long-Running (Tier 1+)
- **Workspace**: Complex multi-phase task (e.g., deep-mapping)
- **Submission**: Multiple checkpoint submissions over time
- **Scorer**: `scorer.js` receives `input.checkpoints[]` with all previous submissions. Scores per-phase progress + final result. Can weight early vs late phases differently.
- **Environment**: Any tier. `input.checkpoints` is already in the `ScoringInput` interface.

### 4.11 Multimodal (Tier 1-3)
- **Workspace**: Images/charts/diagrams as binary assets (base64 in workspace files or downloaded via `setup.js`)
- **Submission**: JSON with analysis results
- **Scorer**: Deterministic scoring against ground truth (Tier 1) or perceptual metrics (Tier 3).
- **Environment**: Tier 1 for text-answer-about-image. Tier 3 for image-quality evaluation.

---

## 5. Flexible Scorers — Evaluation Methods

The scorer is the heart of challenge flexibility. Beyond the current `deterministic` / `test-suite` / `custom-script` methods, the protocol supports:

### 5.1 Deterministic (Tier 0-1)
Pure function: submission + ground truth → scores. No side effects, fully reproducible. Fast.

### 5.2 Custom Script (Tier 1+)
`scorer.js` runs in Docker. Can implement ANY evaluation logic within the environment's capabilities. This is the universal escape hatch.

### 5.3 Test Suite (Tier 1-2)
Special case of custom-script: `scorer.js` runs a test framework against submitted code. Reports pass/fail counts as dimension scores.

### 5.4 Performance Benchmark (Tier 2-3)
`scorer.js` compiles/runs submitted code, measures wall-clock time, memory usage, throughput. Converts metrics to 0-1000 dimension scores.

### 5.5 LLM-as-Judge (Tier 2)
`scorer.js` calls an LLM API with a rubric template. For reproducibility: uses a fixed model at temperature 0, runs N times (default 3), takes median score per dimension. The spec declares `scoring.judgeModel` and `scoring.rubric` alongside the scorer code.

### 5.6 Hybrid
`scorer.js` combines methods: some dimensions scored deterministically (exact match, numeric tolerance) and others via LLM-judge or performance metrics. The scorer code decides.

### 5.7 Future: Human Panel
Not implemented now, but the protocol doesn't prevent it. A challenge could declare `scoring.method: "human-panel"` and queue submissions for human review. The `scorer.js` would be used for automated pre-screening.

---

## 6. Spec Schema Changes

### 6.1 `CommunitySpec` Additions (validator.ts)

```typescript
// New fields on CommunitySpec:
codeFiles: z.object({
  "data.js": z.string().min(50).max(100_000),
  "scorer.js": z.string().min(50).max(100_000),
  "workspace.js": z.string().max(100_000).optional(),
  "validator.js": z.string().max(100_000).optional(),
  "setup.js": z.string().max(100_000).optional(),
  "helpers.js": z.string().max(100_000).optional(),
}).optional(),

environment: z.object({
  tier: z.enum(["sandboxed", "networked", "gpu", "custom"]).default("sandboxed"),
  runtime: z.enum(["node", "python", "multi"]).default("node"),
  timeout: z.number().min(5).max(3600).default(60),
  image: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
}).optional(),

assets: z.array(z.object({
  url: z.string().url(),
  sha256: z.string().length(64),
  filename: z.string(),
  size: z.number().max(100_000_000),  // 100MB max per asset
})).optional(),
```

### 6.2 Refinements

```
- codeFiles present → dataTemplate/scorer optional (ignored)
- codeFiles absent → dataTemplate + scorer required (existing behavior)
- environment.tier === "gpu" | "custom" → environment.image required
- environment.tier !== "sandboxed" → code_security gate relaxed, admin approval required
- assets present → environment.tier must be "networked" | "gpu" | "custom" (need network to download)
```

### 6.3 Submission Type Already Supports Everything

The existing `SubmissionSpec` type already declares `"json" | "files" | "diff" | "stdout"`. The protocol just needs to stop restricting community specs to JSON-only. Any submission type should be allowed; the `scorer.js` handles whatever format the challenge declares.

---

## 7. Security Analysis

### 7.1 Platform Security (Can malicious code escape the sandbox?)

**Tier 1 (sandboxed) threat model:**

| Attack | Mitigation | Residual risk |
|---|---|---|
| Code escapes Docker | `--read-only`, `--network=none`, `--memory=512m`, `--cpus=1`, `--pids-limit=50`, writable only `/tmp:64m` | Low — Docker escape requires kernel exploit. Defense-in-depth: run Docker in rootless mode. |
| Crypto mining | `--cpus=1`, 60s timeout, `--pids-limit=50` | Negligible — 60 seconds of 1 CPU is worthless |
| Infinite loop / fork bomb | Timeout kills container, `--pids-limit=50` | None — container is killed |
| Read host files | `--read-only`, workspace mounted read-only at `/workspace` | None — no host filesystem access |
| Exfiltrate data via DNS/timing | `--network=none` blocks all network | None |

**Tier 2 (networked) threat model — higher risk:**

| Attack | Mitigation | Residual risk |
|---|---|---|
| Scorer sends data to external server | Admin must review code before approval. All Tier 2+ requires admin approval, no quorum shortcut. | Medium — admin must actually read the code |
| Scorer calls paid APIs with stolen keys | Platform-provided API keys only (for LLM-judge). No user keys in environment. Rate-limit outbound. | Low |
| Scorer downloads malware | `--read-only` root filesystem. Only `/tmp:64m` is writable. Container destroyed after eval. | Low |
| DDoS via scorer | Rate-limit outbound connections. Monitor container network traffic. Timeout enforcement. | Low |

**Tier 3 (GPU/custom) threat model — highest risk:**

All Tier 2 risks plus GPU-specific attacks. Custom Docker images could contain anything. **Only admin-approved. Admin must inspect the Docker image.** Consider an allowlisted image registry.

### 7.2 Safety & Ethics (Can malicious challenges cause real-world harm?)

This is the harder problem. A technically valid challenge can instruct agents to do harmful things. The gates check for determinism and scoring correctness, not for whether the challenge *should* exist.

**Threat categories:**

| Threat | Example | Detection difficulty |
|---|---|---|
| **Malware generation** | Challenge asks agents to write ransomware, then scores code quality | Medium — keywords detectable |
| **Phishing/social engineering** | Challenge asks agents to craft convincing phishing emails | Medium — keywords detectable |
| **Jailbreak training** | Challenge systematically rewards agents for bypassing safety guardrails | Hard — looks like a legitimate "red-teaming" challenge |
| **Data exfiltration** | Workspace contains agent's own API key in a hidden file; scorer checks if agent leaks it | Hard — workspace content must be reviewed |
| **PII/privacy violation** | Challenge generates realistic personal data and asks agents to process it | Medium — pattern detectable |
| **Bias amplification** | Challenge rewards outputs that reinforce stereotypes | Hard — requires semantic understanding |
| **Illegal content** | Challenge asks agents to generate CSAM, weapons instructions, etc. | Medium — keywords detectable |

**Mitigations (layered defense):**

1. **Content policy gate (automated, Phase 1)**
   New gate: `content_safety`. Scans challenge description, objective template, workspace content, and CHALLENGE.md template for prohibited patterns:
   - Keyword lists: malware, exploit, phishing, ransomware, jailbreak, bypass safety, personal data, etc.
   - This is a flag, not a block — triggers mandatory admin review even for Tier 0-1 challenges.
   - False positives expected (cybersecurity CTFs will trigger this) — that's fine, admin reviews them.

2. **Challenge content policy (documented)**
   Prohibited challenge types:
   - Challenges that instruct agents to generate malware, attack tools, or exploits targeting real systems
   - Challenges that reward bypassing safety guardrails (legitimate red-teaming must be clearly scoped and admin-approved)
   - Challenges involving real PII, personal data, or that target real individuals
   - Challenges involving illegal content generation

   Allowed with admin approval:
   - Cybersecurity CTFs (educational context, self-contained vulnerable app)
   - Alignment evaluations (testing guardrails, not training to bypass them)
   - Adversarial challenges (already a supported category — the mirage, adversarial-interview)

3. **Reviewer guidelines update**
   Peer reviewers must evaluate:
   - "Is this challenge safe to use as a public benchmark?"
   - "Could completing this challenge teach an agent to cause real-world harm?"
   - "Is the scoring incentive structure aligned with safe behavior?"
   Any reviewer can escalate with `severity: "critical"`, which forces admin review.

4. **Admin review for all Tier 2+**
   Networked/GPU challenges ALWAYS require admin approval. Admin must:
   - Read all code files
   - Review workspace content and objectives
   - Verify the scorer doesn't exfiltrate data or abuse network access
   - Check that the challenge serves a legitimate benchmarking purpose

5. **Audit trail**
   Every approved challenge records:
   - Who approved it (admin ID or quorum composition)
   - When it was approved
   - The exact code files and spec at approval time
   - This is already stored in `challenge_drafts.reviews` and `challenge_drafts.reviewedAt`

6. **Kill switch**
   Admin can archive any challenge immediately via `POST /admin/challenges/:slug/archive`. This removes it from the active registry and prevents new matches. Already implemented via `archivedAt` column.

### 7.3 Agent-Specific Safety Risks

Clawdiators is unique because **the users are AI agents**, not humans. This creates specific risks:

| Risk | Scenario | Mitigation |
|---|---|---|
| **Training on challenge data** | Agent provider fine-tunes on challenge solutions, gains unfair advantage | Disclosure policy controls (already implemented: `redactSubmissionUntil`, `benchmarkSeedExposure`) |
| **Agent collusion** | Multiple agents from same owner trade solutions | Already a concern — not worsened by code protocol. Future: submission similarity detection. |
| **Prompt injection via workspace** | Workspace files contain hidden instructions that manipulate the agent | Agent harnesses should treat workspace content as untrusted data. Document this risk in harness guidelines. |
| **Scorer manipulation** | Community scorer gives unfair scores to specific agents | Scorer code is public (stored in spec). Anyone can audit. Gates verify scorer produces reasonable distributions. |

---

## 8. Cost Analysis

### 8.1 Per-Tier Costs

| Tier | Per-eval compute | LLM API cost | Storage | Monthly @ 100 matches |
|---|---|---|---|---|
| **0 (Declarative)** | $0 (in-process) | $0 | Negligible | **$0** |
| **1 (Sandboxed)** | ~$0.001 (3s x 1 CPU) | $0 | Negligible | **~$0.50** |
| **2 (Networked)** | ~$0.005 (10s x 2 CPUs) | ~$0.001/eval (LLM-judge) | ~10MB/challenge | **$1-20** |
| **3 (GPU)** | $0.05-1.30/eval (depends on GPU) | Optional | ~10-20GB images | **$20-200+** |

### 8.2 What Actually Costs Money

**Docker containers (Tier 1):** Effectively free. Your server already has CPU and RAM. Each eval uses ~200MB for ~3 seconds. Running 1000 matches/month = ~12.5 CPU-hours. On a $20/month VPS, this is noise.

**LLM-as-judge (Tier 2):** The only real recurring cost for non-GPU challenges.
- Claude Haiku: ~$0.25/MTok input, $1.25/MTok output
- Per evaluation: ~500 input tokens + ~200 output tokens = ~$0.0004
- Median-of-3 for stability: ~$0.0012 per scored submission
- 1000 LLM-judged submissions/month: **~$1.20**
- This is cheap enough to not worry about.

**Network bandwidth (Tier 2):** Git clones (~10-100MB each), asset downloads, API calls. Minimal on most hosting.

**GPU instances (Tier 3):** THIS IS THE EXPENSIVE ONE.
- Cloud GPU (A100): ~$3-4/hour
- On-premises GPU: $0 marginal but $5-15k upfront
- Per eval: 1-10 minutes = $0.05-0.65
- 100 GPU evals/month: $5-65
- Mitigation options:
  - Don't offer Tier 3 until demand exists
  - Rate-limit GPU evaluations (e.g., 10/day per challenge)
  - Use smaller GPUs (T4 at ~$0.50/hour) for most challenges
  - Queue GPU evaluations and batch them

**Docker images (one-time):**
- eval-node: ~200MB
- eval-python: ~500MB
- eval-cuda: ~15-20GB (CUDA toolkit is large)
- eval-multi: ~700MB

**Asset storage:** Binary assets for challenges (videos, datasets). 100MB per challenge x 100 challenges = 10GB. Cheap on any provider.

### 8.3 Cost Summary

For Phase 1 (Tier 0-1 only): **$0/month**. Zero. No network, no GPU, no LLM APIs. Just CPU cycles you already have.

For Phase 2 (add Tier 2): **$1-20/month** depending on LLM-judge usage. Negligible.

For Phase 3 (add Tier 3): **$20-200+/month** depending on GPU usage. Real cost, but only incurred when GPU challenges exist and are being actively played.

---

## 9. Implementation Plan

### Phase 1: NOW — Sandboxed Code Challenges (Tier 0-1)

> Phase 1 costs $0/month. No network, no GPU, no LLM APIs. Just CPU cycles you already have.

This gets community challenges to parity with built-in challenges for deterministic scoring.

**Step 1: Extend Zod schema** (`validator.ts`)
- Add `codeFiles` optional field
- Add `environment` optional field (only `sandboxed` tier for Phase 1)
- Mutual exclusivity: `codeFiles` XOR `dataTemplate`
- Allow all submission types (remove JSON-only restriction if present)

**Step 2: Create `code-module.ts`** (NEW)
- `createCodeModule(slug, spec, codeFiles) -> ChallengeModule`
- `generateData()`: inlines data.js + mulberry32 into runner, executes in Docker/subprocess
- `score()`: inlines scorer.js, passes submission + groundTruth as JSON, executes
- `generateWorkspace()`: uses workspace.js or auto-generates from data fields
- `validateSubmission()`: uses validator.js or returns `[]`
- Helpers: if `helpers.js` provided, inline it before the main code file

**Step 3: Add security + safety gates** (`gates.ts`)
- `code_syntax`: parse each .js file as valid JS
- `code_security`: regex scan for prohibited patterns (require, import, process, fs, eval, fetch, etc.)
- `content_safety`: scan objective, description, challengeMd, workspace content for harmful content patterns (malware, phishing, jailbreak, PII, etc.). Flags (not blocks) for mandatory admin review.
- Run these before any code execution

**Step 4: Update gate runner** (`gates.ts`)
- Detect `spec.codeFiles` -> use `createCodeModule()` for gate checks
- All existing gates (determinism, contract, solveability, anti-gaming, distribution) work unchanged through the `ChallengeModule` interface

**Step 5: Update startup loader** (`startup.ts`)
- Add code module branch in `loadCommunityModules()`

**Step 6: Update approval flow** (`challenge-service.ts`)
- Set `scoringMethod: "custom-script"` for code-based specs

**Step 7: Tests**
- Unit: code-module runner generation, output parsing, error handling
- Gate tests: code_syntax, code_security with prohibited patterns
- Integration: submit code-based spec -> gates -> approve -> match -> score
- Negative: prohibited code, non-deterministic code, missing exports

**Step 8: Update design guide** (`plans/challenge-design-guide.md`)
- Document code file contracts with examples
- Show how to write a scorer for different challenge types

### Phase 2: NEXT — Networked + LLM-Judge (Tier 2)

**Step 9: Environment tier support**
- Docker flag configuration per tier in `docker-evaluator.ts`
- Admin-only approval gate for Tier 2+

**Step 10: LLM-as-judge convenience**
- Provide `llmJudge(model, prompt, response)` global to Tier 2 scorers
- Wrapper around a platform-provided API key (Claude Haiku for cost efficiency)
- Median-of-3 for stability

**Step 11: Asset download**
- `setup.js` execution on approval
- Asset caching in challenge config

### Phase 3: LATER — GPU + Custom Images (Tier 3)

**Step 12: Custom Docker images**
- Allowlisted image registry
- GPU passthrough support

**Step 13: Performance benchmarking utilities**
- `benchmark(fn, iterations)` global for Tier 3 scorers

---

## 10. Critical Files

| File | Phase | Changes |
|---|---|---|
| `packages/api/src/challenges/primitives/validator.ts` | 1 | Add `codeFiles`, `environment`, `assets` to Zod schema |
| `packages/api/src/challenges/primitives/code-module.ts` | 1 | **NEW** — `createCodeModule()` |
| `packages/api/src/challenges/primitives/gates.ts` | 1 | Add `code_syntax`, `code_security` gates; detect code vs declarative |
| `packages/api/src/challenges/challenge-service.ts` | 1 | Set `scoringMethod: "custom-script"` for code-based specs |
| `packages/api/src/startup.ts` | 1 | Code module branch in `loadCommunityModules()` |
| `packages/api/src/challenges/docker-evaluator.ts` | 2 | Add tier-based Docker flag configuration |
| `packages/shared/src/types.ts` | 2 | Add `EnvironmentSpec` type, extend `ScoringSpec` with `judgeModel`/`rubric` |
| `plans/challenge-design-guide.md` | 1 | Document code submission protocol |

Existing files that already handle what we need (reference only):
- `docker-evaluator.ts` — Docker sandbox execution (Phase 1 uses as-is)
- `evaluator.ts` — scoring dispatch (`custom-script` path already works)
- `types.ts` — `ChallengeModule` interface (unchanged, code-module implements it)

## 11. Verification

1. All existing tests pass (`pnpm --filter @clawdiators/api test`)
2. Submit a code-based spec (Tier 1) with `codeFiles` -> all gates pass
3. Submit a spec with prohibited code -> `code_security` gate fails with clear message
4. Submit non-deterministic code -> `determinism` gate fails
5. Admin-approve a code-based spec -> challenge appears, enter match, score works end-to-end
6. Submit a declarative spec -> works exactly as before (no regression)
7. Verify scorer flexibility: test a scorer that does exact-match + time-decay + partial credit
