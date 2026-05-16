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

## [0.4.0] - 2026-05-16

Security hardening release. Closes prompt-injection, race-condition, and at-rest credential issues surfaced in the project validation review. Adds bearer-token auth + per-IP rate limiting to the MCP servers.

### Added

- **Encryption at rest for per-user LLM API keys** — new `nextjs/lib/crypto/secret-store.ts` wraps `agent_configs.api_key` with AES-256-GCM. Versioned `enc:v1:` ciphertext prefix lets us rotate algorithms later. Legacy plaintext rows still decrypt and are upgraded on the next save, so existing users aren't locked out. Requires new env var `API_KEY_ENCRYPTION_SECRET` (≥32 chars; documented in `nextjs/.env.example`).
- **Bearer-token auth + per-IP rate limiting on the MCP servers** — new `mcp-servers/src/shared/auth-rate-limit.ts`. When `MCP_API_TOKEN` is set, all `/tools/*` and `/mcp/*` requests require `Authorization: Bearer <token>` (constant-time compared); `/health` stays open for Docker probes. When unset, a single startup warning logs and requests pass through, keeping local dev frictionless. Per-IP token-bucket limiter (default 60 req/min, LRU-evicts at 10 000 clients, sets `Retry-After`). Wired into both `model-interpretation/server.ts` and `database-query/server.ts`.
- **CORS allow-list on MCP servers** — `MCP_CORS_ORIGINS` env var; defaults to no cross-origin browser access. Replaces `app.use(cors())` which echoed any origin.
- **JDBC input validation for OBDA** — new exported `validateDbConfig()` in `obda-handler.ts` rejects invalid hostnames, link-local / cloud-metadata / loopback IPs, out-of-range ports, identifiers containing JDBC-meta characters (`;`, `?`, `&`, `=`, `\r\n\t\0`), and oversized/newline-containing passwords. `escapePropertyValue()` properly escapes values for the `.properties` file.
- **Async mutex around Ontop config swap** — `withOntopLock()` serializes config writes + container restarts in `ensureOntopConfigured()`, closing the race where two concurrent OBDA queries with different mappings could leave Ontop running config B while query A executed against it.
- **Prompt-injection hardening for SPARQL generation** — new `sanitizeForPrompt()` strips control chars and the fence sentinel, normalizes line endings, and caps length. All untrusted strings (`query`, `r2rmlMapping`, parser-error text, broken SPARQL) are now wrapped in `<<<USER_INPUT … END_USER_INPUT>>>`-style delimited blocks followed by an explicit "ignore instructions in the delimited blocks" reminder. Sentinel tokens inside the input are scrubbed before insertion.
- **Schema size limits on OBDA tool args** — `obdaQuerySchema.query` capped at 10 KB, `r2rmlMapping` at 200 KB, `ontopSparqlUrl` must be a valid URL (`mcp-servers/src/database-query/tools/schemas.ts`).
- **Bearer-token plumbing on the Next.js → MCP path** — new `mcpFetchHeaders()` in `nextjs/lib/langchain/config.ts` injects `Authorization: Bearer ${MCP_API_TOKEN}` on every MCP fetch (`database-query-client.ts`, `model-interpretation-client.ts`). `/api/servers/status` only hits `/health` so it remains auth-free.
- **Vitest setup file for MCP servers** — `mcp-servers/vitest.setup.ts` forces `MCP_API_TOKEN=""` (rather than `delete`-ing it, because `shared/config.ts` calls `dotenv.config()` at module load and would otherwise repopulate the value from `.env`). Wired into both `vitest.config.ts` and `vitest.integration.config.ts`.
- **7 new unit tests for auth + rate-limit middleware** — `mcp-servers/src/shared/auth-rate-limit.test.ts` covers token-unset pass-through, missing/wrong/correct bearer token, `/health` exemption, token-bucket exhaustion + 429 + `Retry-After`, and `/health` exempt from rate limit.

### Changed

- **Bumped Next.js app to 0.4.0**, **MCP servers to 1.1.0**.

### Fixed

- **Prompt-injection vector in `obda-handler.ts`** — user-supplied query, R2RML mapping, and `sparqljs` parser error text were being interpolated verbatim into LLM prompts. A crafted mapping or malformed SPARQL whose parser error text contained instructions could override the "SPARQL-only" system prompt.
- **Race condition on Ontop config swap** — `currentConfigHash` was a module-level variable updated only after successful container start. Two concurrent queries with different mappings could write config B then run query A against it. Now serialized via `withOntopLock()`.
- **JDBC URL injection surface** — `dbConfig.host` was concatenated into `jdbc:postgresql://${host}:${port}/${database}` with no allow-list, leaving `169.254.169.254` (cloud-metadata) and similar internal hosts reachable. Properties values containing `=` or newlines could also break parsing.
- **Plaintext API keys in `agent_configs.api_key`** — anyone with read access to the database (operator, replica, backup) could exfiltrate every user's LLM key. Now AES-256-GCM at rest.
- **Default-open CORS on MCP servers** — `cors()` accepted any origin. Now allow-list-driven via `MCP_CORS_ORIGINS`.

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
