# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

### Changed

### Fixed

### Removed

---

## [0.2.0] - 2026-05-02

### Added

- **Benchmark env split** — `nextjs/.env.benchmark.example` and gitignored `nextjs/.env.benchmark` for `BENCHMARK_AUTH_COOKIE` and other benchmark-only overrides; prerequisites updated in `nextjs/benchmarks/README.md`.
- **MCP URL templates** — `MODEL_INTERPRETATION_URL` and `DATABASE_QUERY_URL` in `nextjs/.env.example` (defaults aligned with `lib/langchain/config.ts`).

### Changed

- **Benchmark env loading** — `nextjs/scripts/run-ai-accuracy-benchmark.ts` merges `.env` and `.env.benchmark` with precedence: shell environment, then `.env.benchmark`, then `.env`.
- **Root and Next.js gitignore** — ignore `nextjs/.env.benchmark` alongside existing env patterns.

### Removed

- **Unused Next.js `.env` template keys** — dropped `PORT`, `REQUEST_SIZE_LIMIT`, and `GOOGLE_MODEL_PRO` from the documented app env surface (not used by the Next.js app).

---

## [0.1.0] - 2026-04-21

### Fixed

- **Ontop container loads stale mapping after project switch** — replaced `docker compose restart ontop` with `docker compose up -d --force-recreate ontop` in `obda-handler.ts` so the container always mounts fresh config files from the host, eliminating the macOS VirtioFS bind-mount cache issue that caused OBDA queries to return 0 results after switching databases (`mcp-servers/src/database-query/tools/obda-handler.ts`)
- **Sidebar archived chats reorder on new chat** — merged active and archived session lists into a single unified list sorted by most recent activity (`max(updated_at, archived_at)`), so a just-archived session stays at the top instead of dropping below all active sessions (`nextjs/components/layout/sidebar.tsx`)
- **Sidebar chat list flickering from race conditions** — replaced two sequential fetches with `Promise.all` and added an `AbortController` to cancel in-flight requests, ensuring only the latest response updates the UI (`nextjs/components/layout/sidebar.tsx`)
- **Non-deterministic session ordering on equal timestamps** — added `id` as a secondary sort key to `getActiveSessions` and `getArchivedSessions` so Postgres always returns rows in a stable, reproducible order (`nextjs/lib/db/sessions.ts`)
