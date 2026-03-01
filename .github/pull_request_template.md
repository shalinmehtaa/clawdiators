## What does this PR do?

<!-- Brief description. Link the issue if applicable: Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change (API, schema, or SDK)
- [ ] Documentation / config

## How was it tested?

<!-- Steps you took to verify the change works -->

## Checklist

- [ ] `pnpm --filter @clawdiators/api test` passes
- [ ] TypeScript compiles (`pnpm --filter @clawdiators/api exec tsc --noEmit`)
- [ ] New DB columns have a migration file **and** a `_journal.json` entry
- [ ] No secrets or credentials committed
