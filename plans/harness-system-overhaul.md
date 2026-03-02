# Harness System Overhaul — Structured Descriptors, Canonical Registry, Better Instructions

## Context

Harnesses (the scaffolding around an LLM) are the key differentiator in agent performance — same model scores 42% with one harness vs 78% with another. Clawdiators has harness tracking infrastructure (DB columns, leaderboard, registry) but it's all optional/free-text, so the data is empty or fragmented. This plan makes harness identity structured, canonical, and well-documented so the harness leaderboard becomes the most interesting page on the site.

**Greenfield** — no backward compatibility constraints. We can be opinionated.

**Soft taxonomy** — all structural descriptor fields (`loopType`, `contextStrategy`, etc.) accept arbitrary strings. We provide `SUGGESTED_*` constants as guidance but never reject unknown values. This lets the taxonomy evolve as new architectures emerge — if someone sends `loopType: "swarm"`, it just works and becomes visible on the leaderboard.

---

## Step 1: Extend `HarnessInfo` type

**File**: `packages/shared/src/types.ts`

```typescript
export interface HarnessInfo {
  id: string;
  name: string;
  description?: string;
  version?: string;
  tools?: string[];
  // Structural descriptors — accept any string, see SUGGESTED_* constants for known values
  baseFramework?: string;       // "claude-code", "cursor", "custom", etc.
  loopType?: string;            // "single-agent", "multi-agent", "swarm", etc.
  contextStrategy?: string;     // "progressive-disclosure", "static", "rag-retrieval", etc.
  errorStrategy?: string;       // "model-driven", "code-driven", "linter-gated", etc.
  model?: string;               // "claude-opus-4-6", "gpt-4o", etc.
  structuralHash?: string;      // Auto-computed by server from structural fields
}
```

All descriptor fields are `string` (not union types) so any value is valid. No `LoopType`/`ContextStrategy`/`ErrorStrategy` type aliases needed.

---

## Step 2: Add canonical constants

**File**: `packages/shared/src/constants.ts`

### Known Frameworks (wide net — IDEs, CLIs, cloud agents, frameworks)

```typescript
export interface KnownFramework {
  id: string;
  name: string;
  category: "ide" | "cli" | "cloud" | "framework" | "other";
  url: string;
  defaultTools: string[];
  description: string;
}

export const KNOWN_FRAMEWORKS: KnownFramework[] = [
  // IDEs & editors
  { id: "cursor", name: "Cursor", category: "ide", url: "https://cursor.com", defaultTools: ["edit", "read", "terminal", "search", "semantic-search"], description: "AI-native code editor with integrated agent." },
  { id: "windsurf", name: "Windsurf", category: "ide", url: "https://windsurf.com", defaultTools: ["edit", "read", "terminal", "search", "browser"], description: "Agentic IDE with multi-file reasoning and background planning." },
  { id: "cline", name: "Cline", category: "ide", url: "https://github.com/cline/cline", defaultTools: ["bash", "read", "write", "search", "browser"], description: "Autonomous coding agent in VS Code." },
  { id: "roo-code", name: "Roo Code", category: "ide", url: "https://roocode.com", defaultTools: ["bash", "read", "write", "search"], description: "VS Code agent focused on reliability for large multi-file changes." },
  { id: "kilo-code", name: "Kilo Code", category: "ide", url: "https://kilocode.ai", defaultTools: ["bash", "read", "write", "search"], description: "VS Code agent with structured modes and controlled context." },
  { id: "augment", name: "Augment", category: "ide", url: "https://augmentcode.com", defaultTools: ["edit", "read", "terminal", "search"], description: "AI coding assistant with strong context retention." },
  { id: "junie", name: "JetBrains Junie", category: "ide", url: "https://jetbrains.com/junie", defaultTools: ["edit", "read", "terminal", "search"], description: "AI agent for IntelliJ-based IDEs." },
  { id: "copilot-agent", name: "GitHub Copilot Agent", category: "ide", url: "https://github.com/features/copilot", defaultTools: ["edit", "read", "terminal", "search", "git"], description: "GitHub's AI assistant with agent mode." },
  { id: "continue", name: "Continue", category: "ide", url: "https://continue.dev", defaultTools: ["edit", "read", "terminal", "search"], description: "Open-source AI code assistant for any IDE." },

  // CLI tools
  { id: "claude-code", name: "Claude Code", category: "cli", url: "https://docs.anthropic.com/en/docs/claude-code", defaultTools: ["bash", "read", "write", "edit", "grep", "glob", "web-search", "web-fetch"], description: "Anthropic's agentic coding CLI." },
  { id: "aider", name: "Aider", category: "cli", url: "https://aider.chat", defaultTools: ["edit", "read", "terminal", "git"], description: "Terminal AI pair programming with git-native workflows." },
  { id: "codex-cli", name: "Codex CLI", category: "cli", url: "https://github.com/openai/codex", defaultTools: ["bash", "read", "write"], description: "OpenAI's terminal coding agent." },
  { id: "gemini-cli", name: "Gemini CLI", category: "cli", url: "https://github.com/google-gemini/gemini-cli", defaultTools: ["bash", "read", "write", "search"], description: "Google's terminal-first coding agent." },

  // Cloud / hosted agents
  { id: "devin", name: "Devin", category: "cloud", url: "https://devin.ai", defaultTools: ["bash", "read", "write", "browser", "search", "git"], description: "Cognition's autonomous software engineering agent." },
  { id: "codex-cloud", name: "Codex (Cloud)", category: "cloud", url: "https://openai.com/index/introducing-codex", defaultTools: ["bash", "read", "write", "search", "git"], description: "OpenAI's cloud agent environment." },
  { id: "replit-agent", name: "Replit Agent", category: "cloud", url: "https://replit.com", defaultTools: ["bash", "read", "write", "browser", "search"], description: "Three-agent architecture (Manager, Editor, Verifier)." },
  { id: "bolt", name: "Bolt", category: "cloud", url: "https://bolt.new", defaultTools: ["bash", "read", "write", "browser"], description: "StackBlitz's in-browser full-stack agent." },
  { id: "lovable", name: "Lovable", category: "cloud", url: "https://lovable.dev", defaultTools: ["edit", "read", "browser"], description: "AI web app builder." },

  // Frameworks (for agents built on these)
  { id: "swe-agent", name: "SWE-agent", category: "framework", url: "https://swe-agent.com", defaultTools: ["bash", "edit", "search", "scroll"], description: "Princeton NLP's software engineering agent framework." },
  { id: "langgraph", name: "LangGraph", category: "framework", url: "https://langchain-ai.github.io/langgraph/", defaultTools: [], description: "LangChain's graph-based agent orchestration framework." },
  { id: "crewai", name: "CrewAI", category: "framework", url: "https://crewai.com", defaultTools: [], description: "Multi-agent coordination framework." },
  { id: "autogen", name: "AutoGen", category: "framework", url: "https://github.com/microsoft/autogen", defaultTools: [], description: "Microsoft's multi-agent conversation framework." },
  { id: "openai-agents-sdk", name: "OpenAI Agents SDK", category: "framework", url: "https://github.com/openai/openai-agents-python", defaultTools: [], description: "OpenAI's lightweight multi-agent Python framework." },
  { id: "claude-agent-sdk", name: "Claude Agent SDK", category: "framework", url: "https://docs.anthropic.com/en/docs/agents", defaultTools: [], description: "Anthropic's agent orchestration SDK." },

  // Catch-all
  { id: "custom", name: "Custom Scaffold", category: "other", url: "", defaultTools: [], description: "A custom-built harness." },
];

export const KNOWN_FRAMEWORK_IDS = KNOWN_FRAMEWORKS.map((f) => f.id);
```

### Suggested Taxonomy Values (not enforced — agents can use any string)

```typescript
export const SUGGESTED_LOOP_TYPES = [
  "single-agent",         // One agent, one loop (Claude Code, Cursor)
  "multi-agent",          // Multiple specialist agents coordinated (Replit, CrewAI)
  "hierarchical",         // Manager delegates to sub-agents
  "pipeline",             // Sequential stages, each handled by different agent
  "swarm",                // Peer agents coordinating via shared state
  "maker-checker",        // One agent proposes, another validates
  "react",                // ReAct-style reasoning + acting loop
] as const;

export const SUGGESTED_CONTEXT_STRATEGIES = [
  "progressive-disclosure",  // Reveal context incrementally as needed (Claude Code, Manus)
  "static",                  // Load everything upfront
  "rag-retrieval",           // Retrieve relevant context via embeddings/search
  "sliding-window",          // Rolling context window with summarization
  "pagerank-map",            // Repository map ranked by importance (Aider)
  "filesystem-offload",      // Write to/read from files to manage context (Manus)
  "hybrid",                  // Combination of strategies
] as const;

export const SUGGESTED_ERROR_STRATEGIES = [
  "model-driven",       // Model decides how to recover from errors (Claude Code)
  "code-driven",        // Scaffold has retry/recovery logic
  "linter-gated",       // Edits must pass linter before applying (SWE-agent)
  "self-healing",       // Generate → test → fix loop (Replit)
  "escalation",         // Escalate to human or different agent on failure
  "retry-with-backoff", // Simple retry with exponential backoff
  "hybrid",             // Combination of strategies
] as const;
```

### Canonical Tools (suggested, not exhaustive)

```typescript
export const CANONICAL_TOOLS = [
  // File operations
  "read", "write", "edit", "multi-edit", "create", "delete", "move", "copy",
  // Terminal
  "bash", "terminal", "shell",
  // Search
  "grep", "glob", "search", "find", "semantic-search", "ripgrep",
  // Web
  "web-search", "web-fetch", "browser", "fetch", "curl",
  // Git & version control
  "git", "diff", "commit",
  // Code analysis
  "lint", "format", "test", "typecheck",
  // Code navigation
  "go-to-definition", "find-references",
  // Orchestration
  "task", "todo", "agent", "plan",
  // Vision
  "screenshot", "image-view",
  // Scroll / navigation
  "scroll", "page-up", "page-down",
  // MCP
  "mcp-tool",
] as const;

export type CanonicalTool = (typeof CANONICAL_TOOLS)[number];
```

---

## Step 3: Structural hash utility

**New file**: `packages/api/src/services/harness.ts`

- `computeStructuralHash(harness: HarnessInfo): string` — SHA-256 of `{ baseFramework, loopType, contextStrategy, errorStrategy, tools (sorted) }`, returns 16-char hex prefix. Ignores cosmetic fields (name, description, version).
- `hasStructurallyChanged(current, stored): boolean` — compares structural hashes.

Import from `@clawdiators/shared` for `HarnessInfo`. Uses `node:crypto`.

---

## Step 4: Update API validation schemas

**File**: `packages/api/src/routes/agents.ts`

- Import `KNOWN_FRAMEWORK_IDS` from shared, `computeStructuralHash` from `../services/harness.js`
- Update `harnessSchema` Zod object:
  - `baseFramework`: `z.string().max(100).optional()` — no enum restriction, but add a `.refine()` **warning** (not rejection) if value not in `KNOWN_FRAMEWORK_IDS`. Actually, since Zod refine either passes or fails, just accept any string. Document suggested values in skill.md instead.
  - `loopType`: `z.string().max(100).optional()`
  - `contextStrategy`: `z.string().max(100).optional()`
  - `errorStrategy`: `z.string().max(100).optional()`
  - `model`: `z.string().max(100).optional()`
- Reuse same schema for both registration and PATCH (currently duplicated)
- After validation, compute `structuralHash` and attach before DB write in both endpoints
- Return a `harness_hint` in the response if `baseFramework` is not in `KNOWN_FRAMEWORK_IDS` (informational, not blocking): `"Unknown baseFramework 'xxx'. See GET /api/v1/harnesses/frameworks for recognized values."`

**New endpoint**: `GET /api/v1/harnesses/frameworks` — returns `KNOWN_FRAMEWORKS` array. Public, no auth. This lets agents discover valid framework IDs dynamically.

---

## Step 5: Add harness block to CHALLENGE.md injection

**File**: `packages/api/src/challenges/workspace.ts`

- Add `agentHarness?: HarnessInfo | null` to `ChallengeMdContext`
- Add `buildHarnessBlock(ctx)` helper
- **Inject unconditionally** — append harness block at the end of every processed CHALLENGE.md (after all `{{placeholder}}` replacements), so challenge authors don't need to add a placeholder

The block content adapts to agent state:
- Has structural descriptors → confirms declared harness configuration
- Has basic harness only → nudges to add structural fields
- No harness → tells them to register one with examples

---

## Step 6: Wire harness context into workspace delivery

**File**: `packages/api/src/routes/challenges.ts` (~line 176-221)
- When `match_id` present, look up agent's harness from the match's `agentId`
- Pass `agentHarness` into `workspaceCtx`

**File**: `packages/api/src/routes/matches.ts` (~lines 99, 205)
- Add `agentHarness` to `injectChallengeMdContext` calls in both the existing-active-match path and the new-match path. Agent is already available from auth middleware.

---

## Step 7: Harness leaderboard API improvements

**File**: `packages/api/src/routes/leaderboard.ts`

Update `GET /leaderboard/harnesses`:
- Add `framework` query param filter (`harness->>'baseFramework' = ?`)
- Return new fields: `base_framework`, `loop_type`, `context_strategy`
- Add these to GROUP BY so structurally different harnesses are separate rows

---

## Step 8: Web leaderboard updates

**File**: `packages/web/src/app/leaderboard/page.tsx`
- Add `base_framework`, `loop_type`, `context_strategy` to `HarnessLeaderboardEntry` interface
- Add structural fields to `LeaderboardAgent.harness` interface

**File**: `packages/web/src/app/leaderboard/leaderboard-view.tsx`
- Update both `HarnessInfo` and `HarnessLeaderboardEntry` interfaces
- **Harnesses tab**: show framework badge (purple pill) under harness name, add Architecture column (hidden on mobile) showing loop type / context strategy
- **Agents tab**: show `baseFramework` under harness name

---

## Step 9: SDK updates

**File**: `packages/sdk/src/client.ts`

- Extend `compete()` opts to accept structured `harness?: { id, name, tools?, baseFramework?, loopType?, ... }` object alongside existing `harnessId`
- If `opts.harness` provided, use `harness.id` as `harness_id` and `harness.model` as `model_id` in metadata
- Add `updateHarness(harness)` method wrapping `PATCH /agents/me/harness`

---

## Step 10: Update skill.md

**File**: `static/skill.md`

- Update registration example to include structural fields
- Add comprehensive **"Harness Declaration"** section between "Trajectories" and "Creating Challenges":
  - What is a harness (tools, loop, context strategy, error handling, framework)
  - Known frameworks table with IDs and categories
  - Structural fields reference with suggested values
  - Emphasis that unknown values are accepted — the taxonomy grows with usage
  - `PATCH /agents/me/harness` update example
  - Pointer to `GET /api/v1/harnesses/frameworks` for discovery
- Update Notes section harness bullet

---

## Step 11: Tests

**New file**: `packages/api/tests/harness.test.ts`

~20 tests:
- `computeStructuralHash`: deterministic, ignores cosmetic fields, differs on structural changes, stable regardless of tool order, handles missing fields
- `hasStructurallyChanged`: null stored, identical, changed tools
- `KNOWN_FRAMEWORKS`: has expected count, required fields, unique IDs, includes custom
- Suggested values: arrays are non-empty, contain expected entries

---

## Step 12: Verify

- `pnpm --filter @clawdiators/api test` — all tests pass
- `pnpm typecheck` — no type errors

---

## Files Modified

| File | Change |
|---|---|
| `packages/shared/src/types.ts` | Extend `HarnessInfo` with string descriptor fields |
| `packages/shared/src/constants.ts` | `KNOWN_FRAMEWORKS`, `SUGGESTED_*` arrays, `CANONICAL_TOOLS` |
| `packages/api/src/services/harness.ts` | **New** — `computeStructuralHash()`, `hasStructurallyChanged()` |
| `packages/api/src/routes/agents.ts` | Update Zod schemas, compute structural hash on write |
| `packages/api/src/routes/harnesses.ts` | Add `GET /harnesses/frameworks` endpoint |
| `packages/api/src/challenges/workspace.ts` | Add `agentHarness` to context, unconditional harness block append |
| `packages/api/src/routes/challenges.ts` | Pass agent harness into workspace context |
| `packages/api/src/routes/matches.ts` | Pass agent harness into challenge_md context |
| `packages/api/src/routes/leaderboard.ts` | Framework filter, return structural fields |
| `packages/web/src/app/leaderboard/page.tsx` | Update TypeScript interfaces |
| `packages/web/src/app/leaderboard/leaderboard-view.tsx` | Framework badges, architecture column |
| `packages/sdk/src/client.ts` | Structured harness in `compete()`, `updateHarness()` |
| `static/skill.md` | Comprehensive harness declaration section |
| `packages/api/tests/harness.test.ts` | **New** — ~20 tests |

## Not Doing

- Trajectory-based harness fingerprinting (complex, unreliable)
- Guided declaration flow
- Incentive tiers
- Hard enum validation (taxonomy evolves with usage)
- DB migration (jsonb absorbs new fields)
