# syntax=docker/dockerfile:1
# One image, two services: model-interpretation (3001) and database-query (3002).
# The compose file picks the entrypoint per service via `command`.

# ── deps: full install for the TypeScript build ──────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ── builder: compile TS -> dist/ ─────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── prod-deps: production-only dependencies for the runtime image ────────────
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# ── runner: minimal runtime ──────────────────────────────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 mcp

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

USER mcp

# Default command runs the model-interpretation server; compose overrides for the
# database-query service. Ports are configured via env (MODEL_INTERPRETATION_SERVER_PORT / DB_MCP_SERVER_PORT).
CMD ["node", "dist/model-interpretation/index.js"]
