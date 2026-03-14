# AI Accuracy Benchmark

This benchmark runs the `/api/chat` endpoint across a positive-only suite and computes:

- Response Time (Average + P95)
- Execution Rate
- Result Accuracy
- Consistency Score

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

## Optional CLI Flags

- `--base-url http://localhost:3000`
- `--cases benchmarks/ai-accuracy/dvd-rental-cases.json`
- `--config benchmarks/ai-accuracy/config.json`
- `--cookie "next-auth.session-token=..."`
- `--delay-ms 250`
- `--strict`

## Output Artifacts

Each run writes:

- `raw-runs.json`: Per-run raw artifacts.
- `case-metrics.json`: Aggregated metrics per case.
- `summary.json`: Top-level benchmark metrics and threshold status.
- `report.md`: Human-readable report.

## Notes

- The suite is deterministic at the test-case level (fixtures are static), but model outputs remain non-deterministic.
- Some positive cases include exact result signatures based on the seeded e-commerce dataset in `data/ecommerce-domain/sql.md`.
