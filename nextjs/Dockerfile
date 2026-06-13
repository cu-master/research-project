# syntax=docker/dockerfile:1

# ── deps: install all dependencies (incl. dev) against the lockfile ───────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# The lockfile is generated with npm 11; node:22-alpine ships npm 10, which
# resolves vite's peerOptional @types/node differently and breaks `npm ci`.
# Pin npm 11 so the build matches the lockfile's resolver.
RUN npm install -g npm@11
# `prisma generate` runs from the postinstall-less flow below; install first.
RUN npm ci

# ── builder: generate the Prisma client and build the standalone server ───────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# `prisma generate` only reads the schema, but prisma.config.ts requires
# DATABASE_URL to be set at load time. The real URL is injected at runtime
# (the entrypoint runs `db push`), so a throwaway placeholder is fine here.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate
RUN npm run build

# ── runner: minimal runtime image ────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Next.js standalone output: a self-contained server + its traced node_modules.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma CLI + engines + generated client, so the entrypoint can run `db push`
# against the metadata database at container start. We copy the full installed
# node_modules (not just prisma/@prisma/.prisma) because the Prisma 6 CLI loads
# @prisma/config at startup, which pulls in transitive deps (effect, c12,
# deepmerge-ts, empathic, …) that live outside those folders.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
