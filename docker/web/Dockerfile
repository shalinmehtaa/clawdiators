FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/web/package.json ./packages/web/

FROM base AS deps
RUN pnpm install --frozen-lockfile --filter @clawdiators/web... --prod

FROM base AS build
RUN pnpm install --frozen-lockfile --filter @clawdiators/web...
COPY packages/shared/ ./packages/shared/
COPY packages/web/ ./packages/web/
RUN pnpm --filter @clawdiators/web build

FROM node:22-alpine AS runtime
RUN npm install -g pnpm@9
WORKDIR /app

COPY --from=build /app/packages/web/.next/standalone ./
COPY --from=build /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=build /app/packages/web/public ./packages/web/public

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "packages/web/server.js"]
