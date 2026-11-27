# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.0.0
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
# Only needed so `prisma generate` (runs via postinstall) has a value to parse — it never
# actually connects at build time. Passed in via docker-compose's `build.args`, which reads
# it from .env; the fallback below is just a non-functional placeholder, never real credentials.
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm install --frozen-lockfile

# --- Local development: hot-reloading dev server; source is bind-mounted over this in compose. ---
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]

# --- Production build ---
FROM base AS builder
ENV NODE_ENV=production
ARG DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV DATABASE_URL=$DATABASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
