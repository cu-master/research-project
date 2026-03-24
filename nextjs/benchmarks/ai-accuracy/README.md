# AI Accuracy Benchmark

This benchmark runs the `/api/chat` endpoint and is tuned for Ontop/SPARQL flows where SQL is often not exposed in the assistant response.

Primary scoring is result-first:
- Positive cases are validated by response/result correctness.
- Negative cases are validated by refusal behavior and non-leakage of result data.

It computes:

- Response Time (Average + P95)
- Response Success Rate
- Result Accuracy
- Consistency Score
- Refusal Rate
- False Positive Rate
- Tool Call diagnostics (average + per-tool frequency)

## Files

- `dvd-rental-cases.json`: Default benchmark cases used by `npm run benchmark:ai-accuracy`.
- `cases.json`: Alternative benchmark case set (can be selected with `--cases`).
- `config.json`: Endpoint defaults and threshold settings.
- `results/<timestamp>/`: Generated artifacts from each benchmark run.

## Prerequisites

- Next.js app is running locally (default `http://localhost:3000`).
- Required backing services are running (LLM provider and MCP servers used by `/api/chat`).
- Authenticated cookie for a valid user is available:
  - `BENCHMARK_AUTH_COOKIE="next-auth.session-token=...; other_cookie=..."`
- Benchmark requests do not send a session ID. The chatbot resolves DB context from the authenticated user's default project.

## Run

From `nextjs/`:

```bash
npm run benchmark:ai-accuracy
```

Strict mode (non-zero exit when thresholds fail):

```bash
npm run benchmark:ai-accuracy:report
```

## Config (`config.json`)

- **`promptSuffix`**: Text appended to every benchmark prompt (default in repo reduces follow-up churn). Set to `null` or `""` to measure the system without that suffix. If the key is omitted, the runner uses `BENCHMARK_PROMPT_SUFFIX` from the environment, then a built-in default.
- **`requestRetries` / `retryDelayMs`**: Retries for 5xx responses and network failures (default `2` / `750`).
- **`warmupEnabled`**: When `true` (default), one extra unmeasured `/api/chat` call runs after preflight to warm caches.

## Optional CLI Flags

- `--base-url http://localhost:3000`
- `--cases benchmarks/ai-accuracy/dvd-rental-cases.json`
- `--case-id P02` (run one case by ID from the selected cases file)
- `--config benchmarks/ai-accuracy/config.json`
- `--cookie "next-auth.session-token=..."`
- `--delay-ms 250`
- `--concurrency 2` (prints a warning: parallel runs share one auth cookie)
- `--model-temperature 0`
- `--model-seed 42`
- `--strict`

Example:

```bash
npm run benchmark:ai-accuracy -- --case-id P02
```

## Output Artifacts

Each run writes:

- `raw-runs.json`: Per-run raw artifacts.
- `case-metrics.json`: Aggregated metrics per case.
- `summary.json`: Top-level benchmark metrics and threshold status.
- `report.md`: Human-readable report.

## Methodology Notes (Ontop / SPARQL)

- SQL text is treated as debug telemetry only; it is not the primary success gate for positive cases.
- `expectedResultSignature` is the strongest check when available.
- For negative prompts (injection, out-of-scope, nonexistent entities), a run fails if table-like result data is returned, even when refusal language is present.
- Tool call data is captured per run (`toolCallCount`, `toolNames`) and aggregated in summary/report for observability.
- OBDA/Ontop SQL is not exposed in benchmark artifacts, so SQL-string assertions are intentionally not used for OBDA-only refusal checks.

## Notes

- The suite is deterministic at the test-case level (fixtures are static), but model outputs remain non-deterministic.
- For reproducibility, run with `--model-temperature 0` (and optionally `--model-seed`) and ensure your backend model config matches those values.
- Consistency is shown as `N/A` when a case has fewer than 2 runs.
