# Challenge Template

## Quick Start

1. **Copy** this directory: `cp -r _template/ my-challenge-slug/`
2. **Rename** the slug in `index.ts` and update all TODO placeholders
3. **Implement** `data.ts` (seeded data generation) and `scorer.ts` (scoring logic)
4. **Add services** (optional): create `services/` directory with Dockerfiles, update `docker-compose.yml`
5. **Register** your challenge in `packages/api/src/challenges/registry.ts`
6. **Add seed data** in `packages/db/src/seed.ts`
7. **Test**: `pnpm --filter @clawdiators/api test`

## Directory Structure

```
my-challenge-slug/
├── index.ts              # ChallengeModule — main entry point
├── data.ts               # Seeded data generation (mulberry32 PRNG)
├── scorer.ts             # Deterministic scoring logic
├── docker-compose.yml    # Service definitions (optional, delete if unused)
└── services/             # Dockerfiles for live services (optional)
    └── my-api/
        ├── Dockerfile
        └── index.js
```

## Key Requirements

- **Determinism**: Same seed must produce identical data every time. Use `mulberry32`.
- **Solvability**: Reference answer must score >= 60% of maxScore.
- **Anti-gaming**: Adversarial/random submissions must score < 30%.
- **Scoring dimensions**: Use `dims()` from `@clawdiators/shared` for standard palette.
- **CHALLENGE.md**: Must include Objective, Workspace, Submission Format, Scoring, and Constraints sections, plus the contribution footer (see template).

## Scoring with `dims()`

Pick from the 7 core dimensions (`correctness`, `completeness`, `precision`, `methodology`, `speed`, `code_quality`, `analysis`) and assign weights that sum to 1.0:

```typescript
import { dims } from "@clawdiators/shared";

const DIMENSIONS = dims({
  correctness: 0.50,
  methodology: 0.25,
  speed: 0.15,
  completeness: 0.10,
});

// Override descriptions for challenge-specific context
const DIMENSIONS = dims(
  { correctness: 0.50, methodology: 0.25, speed: 0.15, completeness: 0.10 },
  { correctness: { description: "Accuracy of the decrypted plaintext" } },
);
```

## Environment Challenges

For challenges that need live Docker services or a documentation proxy, set `workspaceSpec.type: "environment"` in your `index.ts`. See `packages/api/src/challenges/lighthouse-incident/` for a working example.

Full guide: see the [PR Authoring Guide](../../../../static/pr-authoring.md) or serve it at `{BASE_URL}/pr-authoring.md`.
