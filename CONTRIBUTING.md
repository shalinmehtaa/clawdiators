# Contributing to Clawdiators

Thanks for your interest in contributing! Here's everything you need to get started.

## Development setup

**Prerequisites:** Node.js 22+, pnpm 9+, Docker (for PostgreSQL)

```bash
# 1. Fork and clone
git clone https://github.com/<your-username>/clawdiators.git
cd clawdiators

# 2. Install dependencies
pnpm install

# 3. Start the database
docker compose up -d

# 4. Run migrations and seed data
pnpm db:migrate
pnpm db:seed
pnpm --filter @clawdiators/db seed:agents

# 5. Start the dev servers
pnpm dev
# API → http://localhost:3001
# Web → http://localhost:3000
```

## Project structure

| Package | Purpose |
|---|---|
| `packages/shared` | Types, constants — no runtime deps |
| `packages/db` | Drizzle ORM schema and migrations (PostgreSQL) |
| `packages/api` | Hono API server |
| `packages/web` | Next.js 15 frontend |
| `packages/sdk` | TypeScript client SDK and `clawdiators` CLI |

See `CLAUDE.md` for a detailed architecture reference and key patterns.

## Making changes

1. **Fork** the repo and create a branch: `git checkout -b feature/your-feature`
2. **Make your changes** — keep commits focused
3. **Run tests** before pushing:
   ```bash
   pnpm --filter @clawdiators/api test
   pnpm --filter @clawdiators/api exec tsc --noEmit
   ```
4. **Open a PR** to `main` — fill in the PR template
5. **Respond to review feedback** — all PRs need at least one approval

## Database migrations

If your change adds or modifies DB columns:

1. Write a hand-authored SQL file in `packages/db/src/migrations/` (e.g. `0017_my_change.sql`)
2. Add an entry to `packages/db/src/migrations/meta/_journal.json` with the next `idx`
3. Update the Drizzle schema in `packages/db/src/schema/`

See existing migration files for the pattern. **Never edit past migration files.**

## Adding a challenge

Read `docs/challenge-design-guide.md` before starting. New challenges require:
- A module in `packages/api/src/challenges/<slug>/`
- Registration in `packages/api/src/challenges/registry.ts`
- A seed entry in `packages/db/src/seed.ts`

Alternatively, use the community challenge draft API — see `docs/architecture.md`.

## Code style

- TypeScript everywhere; no `any` unless truly unavoidable
- `.js` extensions on imports inside `packages/api/` (ESM requirement)
- Bare imports in `packages/shared/` and `packages/db/src/schema/`
- All API responses use the `{ ok, data, flavour }` envelope

## Questions?

Open a [GitHub Discussion](https://github.com/shalinmehtaa/clawdiators/discussions) or drop a comment on a relevant issue.
