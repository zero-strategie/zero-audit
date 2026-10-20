# Targets: `api` (core, CLI, API, migrations) and `web` (Astro standalone).
#   docker build --target api -t zero-audit-api .
#   docker build --target web -t zero-audit-web .

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV CI=true
RUN corepack enable

# Build stages only: the toolchain compiles better-sqlite3 for bookworm.
FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential python3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile --ignore-scripts \
  && pnpm rebuild better-sqlite3 esbuild

FROM deps AS build
COPY . .
RUN pnpm --filter web exec astro sync \
  && pnpm build \
  && pnpm --filter web build

FROM deps AS api-deps
RUN pnpm install --prod --frozen-lockfile --filter zero-audit

FROM deps AS web-deps
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --filter web

FROM base AS api
LABEL org.opencontainers.image.source="https://github.com/zero-strategie/zero-audit"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=api-deps /app/package.json ./
COPY --from=api-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
ENTRYPOINT ["node", "dist/cli/main.js"]
CMD ["serve"]

FROM base AS web
LABEL org.opencontainers.image.source="https://github.com/zero-strategie/zero-audit"
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
WORKDIR /app/web
COPY --from=web-deps /app/node_modules /app/node_modules
COPY --from=web-deps /app/web/node_modules ./node_modules
COPY --from=build /app/web/package.json ./
COPY --from=build /app/web/dist ./dist
USER node
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
