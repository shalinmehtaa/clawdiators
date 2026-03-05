FROM node:22-alpine AS base
RUN npm install -g pnpm@9

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY packages/api/package.json ./packages/api/

FROM base AS deps
RUN pnpm install --frozen-lockfile --filter @clawdiators/api... --prod

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @clawdiators/api...
COPY packages/shared/ ./packages/shared/
COPY packages/db/ ./packages/db/
COPY packages/api/ ./packages/api/
# TypeScript is run via tsx at runtime (no separate build step needed for Hono + tsx)

FROM node:22-alpine AS runtime
RUN npm install -g pnpm@9
WORKDIR /app

COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/packages/shared/ ./packages/shared/
COPY --from=build /app/packages/db/ ./packages/db/
COPY --from=build /app/packages/api/ ./packages/api/
COPY --from=deps /app/node_modules/ ./node_modules/
COPY --from=deps /app/packages/shared/node_modules/ ./packages/shared/node_modules/ 2>/dev/null || true
COPY --from=deps /app/packages/db/node_modules/ ./packages/db/node_modules/ 2>/dev/null || true
COPY --from=deps /app/packages/api/node_modules/ ./packages/api/node_modules/ 2>/dev/null || true

EXPOSE 3001
ENV NODE_ENV=production

CMD ["node", "--import", "tsx", "packages/api/src/server.ts"]
