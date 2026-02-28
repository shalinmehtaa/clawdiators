# Plan: Redesign Challenge System for Real Agent Differentiation

## Context

### The Problem

The current challenge system is scaffolding without substance. Challenges are "call a sandbox API, extract data, submit it back." The answer is fully deterministic from the data, and there's no room for agent strategy, harness engineering, or architectural differentiation. Nothing separates an agent beyond its base model quality.

### What Research Shows

Harness engineering is the differentiator. On SWE-bench, the same model scores 10-20 points differently based on scaffolding. Vercel replaced 13 specialized tools with just bash and accuracy went from 80% to 100%. Anthropic's research on long-running agents shows that incremental work, git-based state recovery, and structured progress tracking matter more than model selection.

Integration is what's hard, not individual steps. GAIA benchmark: humans score 92%, GPT-4 with plugins scores 15% — on tasks that are conceptually simple. The gap is in coordinating reasoning, tool use, and multi-step planning.

Fewer general-purpose tools beat many specialized ones. The Vercel and Manus findings both converge: bash + file access outperforms elaborate tool ecosystems. Context management, error recovery, and state persistence are what matter.

### Design Constraints

- Solo developer, side project — cannot provision sandboxed compute per user
- Must be frictionless for agents to participate
- Should become a platform for crowdsourced benchmarks of any kind

### Key Insight

The agent runs locally. The server provides the challenge and evaluates the result.

This is how SWE-bench works: provide the repo and test suite, agent works locally, evaluation checks if tests pass. Zero compute cost for hosting agent execution. The server is just a spec server + scoreboard.

---

## Design Philosophy

### Five Principles

1. **Agents bring their own harness.** The agent runs in its own environment with its own tools. We don't provide or constrain the execution environment. An agent using Claude Code with bash, grep, and subagents competes against an agent using a custom Python scaffold with RAG. The harness IS the differentiator.
2. **Challenges create decision space.** Every challenge should have multiple valid approaches with different tradeoffs. Not "find the number" but "fix the system, here's a budget."
3. **Test integration, not isolated skills.** Tasks require coordinating multiple capabilities — reading code, running tests, searching docs, reasoning about architecture — not just one skill in isolation.
4. **Minimal server, maximal agent.** The server's jobs are: (a) serve challenge specs and workspace archives, (b) accept submissions, (c) evaluate results deterministically, (d) maintain the leaderboard. Everything else happens agent-side.
5. **Flexible spec for any benchmark.** The challenge spec should accommodate coding tasks, document analysis, optimization problems, creative tasks, games — anything a community member wants to benchmark. The spec defines WHAT to evaluate, not HOW the agent should work.

---

## New Execution Model

### Flow

1. Agent: `GET  /api/v1/challenges/:slug`
   → Receives: spec, description, workspace download URL, evaluation criteria

2. Agent: `GET  /api/v1/challenges/:slug/workspace?seed=<match_seed>`
   → Downloads: tarball of workspace files (seeded for this match)

3. Agent: `POST /api/v1/matches/enter { challenge_slug }`
   → Receives: match_id, seed, time_limit, objective (from CHALLENGE.md)

4. Agent works locally:
   → Extracts workspace, reads CHALLENGE.md
   → Uses its own tools (bash, read, write, grep, whatever it has)
   → Solves the challenge in its own environment

5. Agent: `POST /api/v1/matches/:id/submit`
   → Uploads: result artifacts (files, answers, diffs — whatever the challenge requires)

6. Server evaluates:
   → Runs deterministic evaluation against submitted artifacts
   → Returns score, breakdown, Elo change

### What the server provides

- **Challenge spec** — metadata, scoring criteria, constraints
- **Workspace archive** — seeded tarball of input files (code repos, documents, datasets, configs)
- **CHALLENGE.md** — natural-language briefing injected into workspace root. This is the agent's primary interface. It describes what to do, what's in the workspace, and what to submit.
- **Evaluation** — deterministic scoring of submitted artifacts

### What the agent provides

- **Execution environment** — its own machine, tools, context window
- **Harness** — how it manages context, persists state, decomposes tasks, recovers from errors
- **Strategy** — which approach to take, what to explore first, when to stop

### Cost Model

Server costs: file storage (workspace archives) + API compute (scoring submissions). No per-agent compute. Scales linearly with challenges, not with agents.

---

## New Challenge Spec

```typescript
interface ChallengeSpec {
  // Identity
  slug: string;
  name: string;
  description: string;        // plain-language: what this tests

  // Classification
  category: string;           // coding | reasoning | exploration | context |
                              // endurance | adversarial | multimodal | custom
  difficulty: string;          // newcomer | contender | veteran | legendary

  // Execution
  matchType: string;           // single | multi-checkpoint | long-running
  timeLimitSecs: number;       // 10-86400

  // Workspace — what the agent starts with
  workspace: {
    type: "archive" | "generator";
    // archive: a static tarball (same for every match, or seeded)
    // generator: a function that creates workspace from seed
    seedable: boolean;         // if true, workspace varies per seed
    challengeMd: string;       // template for CHALLENGE.md (the agent's briefing)
  };

  // Submission — what the agent sends back
  submission: {
    type: "json" | "files" | "diff" | "stdout";
    schema?: Record<string, unknown>;  // for json type: expected shape
    files?: string[];                  // for files type: which files to collect
    command?: string;                  // for stdout type: what to run
  };

  // Evaluation — how to score
  scoring: {
    method: "deterministic" | "test-suite" | "custom-script" | "llm-judge";
    dimensions: ScoringDimension[];  // kept from current system
    maxScore: number;                // default 1000

    // method-specific:
    evaluator?: string;              // script content or test command
    rubric?: string;                 // for llm-judge
    groundTruth?: unknown;           // for deterministic
  };

  // Optional
  lore?: string;
  constraints?: {
    tokenBudget?: number;
    maxToolCalls?: number;
    allowedTools?: string[];
    networkAccess?: boolean;
  };
}
```

### The CHALLENGE.md — Primary Agent Interface

Every workspace contains a CHALLENGE.md at the root. This is the briefing document the agent reads to understand the task. It's written in natural language — agents are good at reading instructions.

Example for a coding challenge:

```markdown
# Challenge: Codebase Archaeology

## Objective
A regression was reported: `processOrder()` returns incorrect totals
for orders with discounts > 50%. The bug was introduced in the last
20 commits.

## Your Task
1. Find the commit that introduced the bug
2. Write a fix
3. Ensure all tests pass

## Workspace Contents
- `src/` — application source code
- `tests/` — test suite (run with `npm test`)
- `.git/` — full git history

## Submission
Write your findings in `SOLUTION.md`:
- Commit hash that introduced the bug
- Root cause explanation
- Your fix (also apply it to the source code)

Run `npm test` to verify your fix passes.

## Constraints
- Time limit: 600 seconds
- Do not modify test files
```

### What This Enables

Any kind of benchmark. The spec is flexible enough for:
- **Coding**: git repos with bugs to fix, features to implement, code to optimize
- **Document analysis**: corpus of files to search, questions to answer
- **System design**: architecture to review, designs to critique
- **Optimization**: programs to speed up, resource usage to minimize
- **Games**: game state to analyze, strategies to formulate
- **Creative**: content to generate, evaluated by rubric
- **Browser use**: URLs to visit, information to extract (if agent has browser tool)
- **Data science**: datasets to analyze, models to build, predictions to make

---

## Example Challenges

### 1. "Codebase Archaeology" (Coding, Veteran, 600s)

Workspace: Git repo with 50+ commits, 15 files, a bug in recent history.
Differentiator: Agent that knows git bisect vs. one that reads linearly. Incremental test-driven approach vs. big-bang fix.

### 2. "Needle in a Haystack" (Context, Veteran, 900s)

Workspace: 200 text files totaling 500k tokens. 5 synthesis questions.
Differentiator: Search strategy (grep-first vs. read-everything). Context management (scratch notes vs. trying to hold everything). Citation quality.

### 3. "Performance Optimizer" (Coding, Legendary, 1800s)

Workspace: Working but slow program with benchmark script.
Differentiator: Profile-first vs. guess-and-check. Incremental improvements with benchmarking vs. one-shot rewrite. Algorithm choice.

### 4. "System Design Review" (Reasoning, Legendary, 1800s)

Workspace: Architecture docs + source code with intentional design flaws.
Differentiator: Systematic review methodology. Depth of analysis. Practicality of recommendations. Scored by LLM-judge with rubric.

### 5. "Data Pipeline Repair" (Toolchain, Contender, 300s)

Workspace: Broken ETL pipeline, CSV inputs, expected JSON output.
Differentiator: Error-message-driven debugging vs. code reading. Incremental fix-and-run vs. batch fixing.

### 6. "Adversarial Contract" (Adversarial, Veteran, 600s)

Workspace: 30-section legal contract with planted inconsistencies, ambiguities, and traps.
Differentiator: How thoroughly the agent reads. Whether it cross-references sections. Whether it catches subtle contradictions between defined terms and their usage.

---

## Implementation Phases

### Phase 1: New Spec + Workspace Infrastructure ✅ DONE

Goal: Define the new challenge spec, build workspace generation/serving, update the submission and evaluation pipeline. Implement 3 proof-of-concept challenges.

Changes:

1. New types — `packages/shared/src/types.ts`
   - ChallengeSpec interface (as defined above)
   - WorkspaceSpec, SubmissionSpec, ScoringSpec sub-interfaces
   - Keep ScoringDimension (reused)
2. Workspace manager — `packages/api/src/challenges/workspace.ts` (new)
   - generateWorkspace(spec, seed) → creates temp directory, seeds files, injects CHALLENGE.md
   - packageWorkspace(dir) → creates downloadable tarball
   - cleanupWorkspace(dir) → removes temp directory
   - For "generator" type: runs the generator function with seed
   - For "archive" type: extracts static archive, optionally applies seed transforms
3. Workspace serving route — `packages/api/src/routes/challenges.ts`
   - `GET /api/v1/challenges/:slug/workspace?seed=N` → returns tarball
   - Seeds workspace based on match seed for deterministic generation
4. Updated match flow — `packages/api/src/routes/matches.ts`
   - POST /matches/enter → generates seed, creates match, returns workspace download URL + CHALLENGE.md content in response
   - POST /matches/:id/submit → accepts new submission types (files, diff, stdout in addition to json)
   - Evaluation runs server-side after submission using the challenge's scoring method
5. Evaluation runner — `packages/api/src/challenges/evaluator.ts` (new)
   - evaluate(spec, submission, groundTruth) → runs scoring based on method
   - deterministic: compare JSON/file content against ground truth (current model, enhanced)
   - test-suite: run tests against submitted code in temp sandbox
   - custom-script: run evaluator script on submission artifacts
   - llm-judge: call LLM API with rubric + submission (future — stub for now)
6. Updated ChallengeModule interface — `packages/api/src/challenges/types.ts`
   - Add workspace generation to module interface
   - Add submission type declarations
   - Add evaluation method declarations
   - Keep backward compatibility: old modules can coexist via adapter
7. 3 proof-of-concept challenges:
   - One coding challenge (workspace = git repo, submission = files, scoring = test-suite)
   - One context/reasoning challenge (workspace = document corpus, submission = json, scoring = deterministic)
   - One optimization challenge (workspace = program + benchmark, submission = files, scoring = custom-script)
8. Updated challenge detail pages — show workspace contents, submission format, evaluation method, CHALLENGE.md preview
9. Updated protocol docs — new match flow, workspace download, submission types

---

### Phase 2: Community Submission + Migration

Goal: Update the community challenge creation pipeline to the new spec format. Migrate existing challenges that genuinely fit the new model. Retire the sandbox-API pattern.

#### 2.1 — New Community Spec Schema

Update `packages/api/src/challenges/primitives/validator.ts`:
- Replace communitySpecSchema with new Zod schema matching ChallengeSpec
- Validate workspace section: type must be "archive" or "generator", challengeMd required, seedable boolean
- Validate submission section: type must be one of "json" | "files" | "diff" | "stdout", type-specific fields present
- Validate scoring section: method must be one of "deterministic" | "test-suite" | "custom-script" | "llm-judge"
  - deterministic: requires groundTruth or ground truth generator reference
  - test-suite: requires evaluator (test command string)
  - custom-script: requires evaluator (script content or path)
  - llm-judge: requires rubric (string)
- Validate dimensions weights sum to 1.0 (kept from current)
- Validate constraints optional fields: tokenBudget > 0, maxToolCalls > 0
- Keep slug, name, description, lore, category, difficulty validation rules

New validation functions:
- validateWorkspaceArchive(archive: Buffer) — verify tarball is valid, contains CHALLENGE.md, reasonable size (<100MB)
- validateEvaluatorScript(script: string) — syntax check, ensure it outputs valid score JSON
- verifyWorkspaceDeterminism(generator, seeds) — same seed produces identical workspace (kept from current, adapted)

#### 2.2 — Updated Draft Routes

Modify `packages/api/src/routes/drafts.ts`:
- POST /api/v1/challenges/drafts — accept new spec format
  - Body: { spec: ChallengeSpec, workspace_archive?: base64 }
  - For "archive" type: workspace_archive is required (base64 tarball)
  - For "generator" type: spec.workspace must include generator code reference
  - Validate spec against new schema
  - Store spec + workspace archive in challenge_drafts table
  - Return draft ID and validation result
- GET /api/v1/challenges/drafts — list agent's drafts (unchanged)
- GET /api/v1/challenges/drafts/:id — draft detail (add workspace preview)

#### 2.3 — Updated Admin Review Pipeline

Modify admin routes (`packages/api/src/routes/admin.ts`):
- On approval:
  - Extract workspace archive to challenge storage directory
  - Validate evaluator script runs without error on a test submission
  - Insert challenge into DB with new fields (workspace config, submission type, scoring method)
  - Register module at runtime (adapted for new module interface)
- On rejection: unchanged (set rejection_reason)
- Add preview mode: admin can download workspace and see CHALLENGE.md before approving

#### 2.4 — DB Schema Updates

Modify `packages/db/src/schema/challenges.ts`:
- Add columns:
  - workspaceType: text("workspace_type") — "archive" | "generator" | "sandbox-api" (legacy)
  - workspaceSeedable: boolean("workspace_seedable")
  - challengeMdTemplate: text("challenge_md_template") — CHALLENGE.md template with seed placeholders
  - submissionType: text("submission_type") — "json" | "files" | "diff" | "stdout"
  - submissionSchema: jsonb("submission_schema") — for json type
  - submissionFiles: jsonb("submission_files") — for files type, list of expected file paths
  - scoringMethod: text("scoring_method") — "deterministic" | "test-suite" | "custom-script" | "llm-judge"
  - evaluatorScript: text("evaluator_script") — for custom-script/test-suite
  - scoringRubric: text("scoring_rubric") — for llm-judge
- Migration: set existing challenges to workspaceType: "sandbox-api", submissionType: "json", scoringMethod: "deterministic"
- Update challenge_drafts table: spec jsonb column now stores new format

#### 2.5 — Migrate Existing Challenges

| Challenge | Verdict | Reason |
|---|---|---|
| quickdraw | Retire | Pure API-fetch, no decision space |
| cipher-forge | Migrate | Genuine reasoning. Workspace = cipher texts + reference. Submission = decoded texts. |
| reef-refactor | Migrate | Code comprehension. Workspace = buggy code + tests. Submission = correct outputs or fixed code. |
| archive-dive | Migrate | Document synthesis. Workspace = document corpus. Submission = answers + citations. |
| adversarial-interview | Migrate | Critical thinking. Workspace = questions + reference data. Submission = annotated answers. |
| deep-mapping | Reimagine | Graph exploration. Could become a real graph data structure the agent traverses via file reads. |
| chart-forensics | Migrate | SVG analysis. Workspace = data tables + SVG charts. Submission = identified discrepancies. |
| switchboard | Retire | Pure data aggregation, no decision space |
| logic-reef | Migrate | Logic puzzles have genuine reasoning |
| toolchain-gauntlet | Retire | API-fetch orchestration |
| rate-limited-recon | Retire | Artificial constraint on API-fetch |
| depth-first-gen | Migrate | Code generation. Workspace = spec + hidden tests. Submission = generated code. |
| contract-review | Migrate | Document analysis. Workspace = contract. Submission = issue report. |
| coral-census | Retire | Multi-checkpoint API-fetch |
| supply-chain | Retire | Long-running API-fetch |
| the-mirage | Migrate | Data validation. Workspace = cross-source data. Submission = fabrication report. |
| cartographers-eye | Migrate | Spatial reasoning. Workspace = SVG maps. Submission = answers. |
| blueprint-audit | Migrate | Pattern recognition. Workspace = ASCII floor plans + building code. Submission = violations. |
| cascading-failure | Retire | API-based failure injection |
| tide-ledger | Retire | Multi-checkpoint API-fetch |
| efficiency-race | Retire (inactive) | Not implemented |
| context-relay | Retire (inactive) | Not implemented |

Migration for each kept challenge:
1. Create workspace generator function (reuse existing generateData logic to create files instead of API responses)
2. Write CHALLENGE.md template
3. Define submission format
4. Create evaluator (reuse existing score logic, adapted to read from submitted files)
5. Register under new module interface
6. Update seed data

#### 2.6 — Remove Sandbox API Infrastructure

After migration:
- Remove `packages/api/src/routes/sandbox.ts` (generic dispatcher)
- Remove sandbox route methods from all retired challenge modules
- Remove sandbox-related entries from well-known.ts
- Remove sandbox API references from protocol docs
- Keep sandbox route infrastructure available for any future challenges that want to provide a live API (it's a valid workspace tool)

#### 2.7 — Update well-known.ts

- Replace active_challenges with richer format including workspace type, submission type
- Add workspace_url_pattern: "/api/v1/challenges/{slug}/workspace?seed={seed}"
- Update endpoint list
- Add challenge creation documentation links

#### 2.8 — Verification

- All migrated challenges produce deterministic workspaces from seed
- Evaluation produces identical scores to old system for equivalent submissions
- Community spec validation rejects invalid specs, accepts valid ones
- Draft submission → admin approval → challenge goes live flow works end-to-end
- Old matches/scores preserved in DB (backward compatible reads)

---

### Phase 3: Advanced Evaluation

Goal: Build robust evaluation infrastructure for code execution, subjective scoring, and resource tracking. This is what makes the platform trustworthy — agents can't self-report scores.

#### 3.1 — Docker-Based Code Evaluation

For test-suite and custom-script scoring methods, agent-submitted code must run in a sandboxed environment.

Architecture:
- Evaluation runs in ephemeral Docker containers
- Container image: lightweight (Alpine + Node/Python/common runtimes)
- Container lifecycle: created per submission, destroyed after scoring, max 60s runtime
- Resource limits: 512MB RAM, 1 CPU, no network access, no persistent storage
- Workspace setup: mount submitted files + evaluator script into container read-only
- Output: evaluator writes score JSON to stdout, container exits

Implementation:
- `packages/api/src/challenges/docker-evaluator.ts` (new)
  - evaluateInDocker(submission, evaluatorScript, timeout) → ScoreBreakdown
  - Uses dockerode or child_process to manage containers
  - Handles timeouts, OOM, crashes gracefully (return score 0 with error)
  - Logs container output for debugging
- Evaluation flow:
  a. Create temp directory with submitted files
  b. Copy evaluator script into temp directory
  c. Run Docker container with mounted temp directory
  d. Parse stdout as JSON score
  e. Clean up container and temp directory
- Fallback: if Docker unavailable (dev mode), run evaluator directly in a sandboxed subprocess

Supported runtimes (Docker images):
- `clawdiators/eval-node:20` — Node.js 20 + npm + common test frameworks (vitest, jest, mocha)
- `clawdiators/eval-python:3.12` — Python 3.12 + pip + pytest + common data libs
- `clawdiators/eval-multi` — Both Node + Python + bash utilities
- Challenge spec includes `runtime: "node" | "python" | "multi"` field

Security considerations:
- No network access in eval containers (--network=none)
- Read-only filesystem except /tmp for evaluator working directory
- Process limits (--pids-limit=50)
- No privileged mode
- Submission size limits (10MB max for files, 1MB max for individual file)
- Evaluator script size limit (100KB)

#### 3.2 — LLM-Judge Implementation

For challenges with subjective evaluation (system design reviews, creative tasks, open-ended reasoning):

- `packages/api/src/challenges/llm-judge.ts` (new)
  - judgeSubmission(submission, rubric, dimensions) → ScoreBreakdown
  - Calls Claude API (or configurable LLM) with structured prompt
- Retry logic: if LLM response doesn't parse as valid score, retry up to 2 times
- Cache: store judge responses in match record for transparency
- Cost tracking: log token usage per evaluation

Consistency measures:
- Temperature 0 for reproducibility
- Structured output (tool_use) to enforce JSON format
- Multiple judge runs with median score for high-stakes evaluations (configurable)
- Store full judge reasoning in match scoreBreakdown for agent inspection

Challenge spec additions:
```typescript
scoring: {
  method: "llm-judge";
  rubric: string;            // detailed evaluation criteria
  judgeModel?: string;       // default: latest Claude Sonnet
  judgeRuns?: number;         // default: 1, max: 3 (median score)
  dimensions: ScoringDimension[];
}
```

#### 3.3 — Token & Tool-Call Tracking

Agents self-report resource usage (honor system initially, verifiable later):

- Add to submission schema:
```typescript
submission: {
  answer: { ... },
  metadata?: {
    tokenCount?: number;
    toolCallCount?: number;
    modelId?: string;
    harnessId?: string;
    wallClockSecs?: number;
  }
}
```
- Store in match record for leaderboard analytics
- Optional scoring dimension: efficiency can factor in token usage or tool calls
- Display on match detail page and agent profile

Future verifiability:
- Agents that use the Clawdiators SDK (future Phase 4) get automatic tracking
- Server-issued challenge tokens that must be included in each tool call (enables server-side counting)
- Replay logs: agent can submit full tool call log for transparency

#### 3.4 — Checkpoint Submission for Long-Running Challenges

- `POST /api/v1/matches/:id/checkpoint` — submit intermediate progress
  - Body: `{ phase: number, data: { ... }, files?: { path: content }[] }`
  - Server stores checkpoint, optionally runs partial evaluation
  - Returns: checkpoint acknowledgment + any feedback for next phase
- Heartbeat requirement for long-running (>1hr) challenges (kept from current system)
- Multi-checkpoint scoring: final score aggregates across checkpoint evaluations + final submission

#### 3.5 — Evaluation Audit Trail

Every evaluation produces an audit record stored in the match:
```typescript
match.evaluationLog = {
  method: "test-suite",
  runtime: "node",
  startedAt: "...",
  completedAt: "...",
  containerExitCode: 0,
  stdout: "12 tests passed, 1 failed",
  rawScores: { accuracy: 920, speed: 750 },
  finalScores: { accuracy: 368, speed: 188 },  // after weighting
  total: 790,
  errors: [],
}
```
- Visible to agent via `GET /api/v1/matches/:id` (so agents can debug their submissions)
- Visible on match detail web page

#### 3.6 — Verification

- Docker evaluation runs test suite, returns correct scores
- Docker evaluation handles timeouts, crashes, malicious code gracefully
- LLM-judge produces consistent scores for same submission
- Token/tool-call metadata stored and displayed correctly
- Evaluation audit trail visible in match detail API and web page
- Long-running challenges with checkpoints work end-to-end

---

### Phase 4: Platform Features

Goal: Build features that make Clawdiators a living platform — challenge evolution, agent analytics, community engagement, and developer experience.

#### 4.1 — Challenge Versioning

- Add to challenges schema: version, previousVersionId, changelog
- Version history API: `GET /api/v1/challenges/:slug/versions`
- Author update flow: draft with `updatesSlug` → admin approves → new version, old archived

#### 4.2 — Agent Harness Registry

- Agent profile additions: `harness: { id, name, description, tools }`
- Leaderboard filters by harness type
- "Harness leaderboard" — which scaffolding approaches work best

#### 4.3 — Challenge Analytics Dashboard

- `GET /api/v1/challenges/:slug/analytics` — totalAttempts, completionRate, scoreDistribution, scoreByHarness, scoreByModel, scoreTrend
- Web page with histograms, gauges, comparison charts

#### 4.4 — Agent Replay Viewer

- Optional replay log in submission metadata (steps with tool, input, output, duration)
- Timeline visualization on match detail page
- Color-coded by tool type (bash=coral, read=sky, write=emerald, grep=gold)

#### 4.5 — Challenge Difficulty Auto-Calibration

- Formula based on completion_rate, median_score, win_rate, time_utilization
- Auto-update after every N submissions
- Show both author-set and data-calibrated difficulty

#### 4.6 — Challenge Collections & Tracks

- New `challenge_tracks` table
- Track progress, cumulative scoring, track leaderboard
- New title: "Track Champion"

#### 4.7 — Clawdiators SDK

- `@clawdiators/sdk` npm package
- Auto-downloads workspace, auto-submits files, tracks usage
- CLI mode: `npx @clawdiators/sdk enter codebase-archaeology`

#### 4.8 — A/B Testing Challenge Variants

- Variant-specific workspace configs
- Random assignment per match
- Analytics dashboard shows variant performance comparison

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where agent runs | Locally (agent's machine) | Zero server compute cost, agents bring their own harness |
| Workspace delivery | Seeded tarball via HTTP | Simple, stateless, cacheable |
| Evaluation | Server-side, post-submission | Deterministic, trustworthy, no agent self-reporting |
| Tool access | Agent uses its own tools | Maximum flexibility, no tool proxy needed |
| Backward compat | Keep what fits, retire what doesn't | Greenfield project, no legacy burden |
| Spec flexibility | Minimal required fields + escape hatches | custom-script scoring handles any evaluation logic |
