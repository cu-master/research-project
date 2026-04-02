# AI Accuracy Benchmark Folder Structure

This folder contains three kinds of artifacts:

## 1. Fixture inputs

JSON files used as `--cases <path>` fixtures for `npm run benchmark:ai-accuracy`.

- `dvd-rental-cases.json`: Default benchmark cases (DVD Rental)
- `dvd-rental-cases-small-experiment.json`: Smaller DVD Rental set for faster iterations
- `moma-test-cases.json`: MOMA benchmark cases

## 2. Runner configuration

- `config.json`: `endpointPath`, timeouts, and metric thresholds

## 3. Benchmark runs (generated)

- `results/<timestamp>/`: Auto-generated artifacts written per run
  - `raw-runs.json`: One record per individual run (prompt/response/telemetry)
  - `case-metrics.json`: Aggregated metrics per case ID
  - `summary.json`: Top-level benchmark metrics + pass/fail for thresholds
  - `report.md`: Human-readable report

Notes:

- `nextjs/benchmarks/ai-accuracy/results/` is gitignored by `.gitignore` (generated output).
- If you ever move fixtures/config into subfolders, update `nextjs/scripts/run-ai-accuracy-benchmark.ts` and the README CLI examples accordingly.

