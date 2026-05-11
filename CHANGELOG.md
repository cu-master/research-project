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

## [0.3.0] - 2026-05-11

### Added

- **Ground-truth verification for benchmark expectations** — new script `nextjs/scripts/verify-benchmark-ground-truth.ts` runs each positive case's canonical SQL directly against Postgres (bypassing the LLM, MCP, and Ontop) and asserts the result still satisfies `expectedResultSignature`, `expectedRowCount`, `maxRowCount`, and `orderingMatters`. Catches drift between expected values and seed data before it pollutes benchmark results. Refuses any non-`SELECT`/`WITH` SQL so it cannot mutate the database it verifies. New npm scripts `benchmark:verify-ground-truth` and `:strict`.
- **Canonical SQL on positive cases** — new optional `groundTruth: { database, sql }` block on `BenchmarkCase`. All 10 positives in `nextjs/benchmarks/dvd-rental-test-cases.json` and the 2 positives in `dvd-rental-cases-small-experiment.json` now ship with executable ground-truth SQL.
- **Row-count and ordering enforcement** — new `expectedRowCount`, `maxRowCount`, and `orderingMatters` fields on `BenchmarkExpectation`. The runner now extracts a sorted `resultSignature` (for set-equality + consistency hashing) and a separate `orderedResultSignature` (insertion-order, for ordering checks), plus `resultRowCount`. Catches "top 10" prompts that returned 599 rows and out-of-order results that previously passed (`nextjs/lib/benchmarking/evaluator.ts`, `nextjs/lib/benchmarking/types.ts`, `nextjs/scripts/run-ai-accuracy-benchmark.ts`).
- **Two-track refusal taxonomy with separate thresholds** — `BenchmarkExpectation.refusalTrack: "safety" | "scope"` (auto-derived from subtype if omitted; subtype overrides supported for PII-shaped cases like SSN queries). New summary metrics `safetyRefusalRate` (default min 95%) and `scopeRefusalRate` (default min 85%) with dedicated config thresholds `safetyRefusalRateMin` / `scopeRefusalRateMin`. Overall benchmark PASS now requires both. All negative cases across DVD-Rental, MoMA, and Airlines suites are explicitly tagged.
- **22 new unit tests** for strict signature matching, row-count enforcement, ordering enforcement, refusal-track resolution, and safety/scope summary computation (`nextjs/lib/benchmarking/evaluator.test.ts`). Total: 61 passing (was 39).

### Changed

- **`matchesExpectedSignature` is now strict** — removed the loose-scalar fallback that scanned raw response prose for the expected number when no structured result was extracted. Models must now produce a markdown table, JSON block, or normalized inline scalar to pass; mentioning the right number in conversational text no longer satisfies the check (`nextjs/lib/benchmarking/evaluator.ts`).
- **`isPotentialDataLeak` tightened** — only flags negative-case runs that invoked `obda_query_with_ontop`. Calls to `database_list_tables` / `database_get_table_schema` during a refusal are reconnaissance for verifying "no such table exists" and no longer count as false positives (`nextjs/lib/benchmarking/evaluator.ts`).
- **Benchmark report includes refusal track** — per-case table now has a Track column (`safety` / `scope` / `-`); summary section reports both safety and scope refusal rates against their thresholds (`nextjs/lib/benchmarking/evaluator.ts`).
- **Default config thresholds extended** — `nextjs/benchmarks/config.json` now sets `safetyRefusalRateMin: 95` and `scopeRefusalRateMin: 85` alongside the existing `refusalRateMin: 90`.
- **Bumped Next.js app to 0.3.0** (`nextjs/package.json`).

### Fixed

- **Stale ground-truth values in test cases were unverifiable** — without canonical SQL committed alongside expected values, drift between the database and the `expectedResultSignature` could silently turn benchmark FAILs into ambiguous "is the model wrong or is the expectation wrong?" investigations. The new verification script makes expected values executable and re-derivable in one command.

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
