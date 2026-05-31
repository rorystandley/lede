FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN pnpm install --frozen-lockfile

# Build shared
FROM deps AS build-shared
COPY packages/shared/ ./packages/shared/
COPY tsconfig.base.json ./
RUN pnpm --filter @news-reader/shared build

# Build frontend
FROM build-shared AS build-frontend
COPY packages/frontend/ ./packages/frontend/
RUN pnpm --filter @news-reader/frontend build

# Build backend
FROM build-shared AS build-backend
COPY packages/backend/ ./packages/backend/
RUN pnpm --filter @news-reader/backend build

# Production image
FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/backend/node_modules ./packages/backend/node_modules

COPY --from=build-shared /app/packages/shared/dist ./packages/shared/dist
COPY --from=build-shared /app/packages/shared/package.json ./packages/shared/

COPY --from=build-backend /app/packages/backend/dist ./packages/backend/dist
COPY --from=build-backend /app/packages/backend/package.json ./packages/backend/
COPY --from=build-backend /app/packages/backend/drizzle.config.ts ./packages/backend/
COPY --from=build-backend /app/packages/backend/src/db/migrations ./packages/backend/src/db/migrations

COPY --from=build-frontend /app/packages/frontend/dist ./packages/frontend/dist

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "packages/backend/dist/index.js"]
