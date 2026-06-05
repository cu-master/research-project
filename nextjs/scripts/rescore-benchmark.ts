// Re-scores an existing benchmark run from its raw-runs.json using the current
// evaluator, without hitting the API. Usage:
//   node --experimental-strip-types scripts/rescore-benchmark.ts <resultsDir> [casesFile]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  evaluateRun,
  evaluateToolSelection,
  computeCaseMetrics,
  buildSummary,
  renderReport,
} from "../lib/benchmarking/evaluator.ts";
import { parseBenchmarkCases, parseBenchmarkConfig } from "../lib/benchmarking/schemas.ts";

const resultsDir = process.argv[2];
const casesFile = process.argv[3] ?? "benchmarks/dvd-rental-test-cases.json";
if (!resultsDir) throw new Error("Pass the results dir as the first arg");

const cases = parseBenchmarkCases(JSON.parse(await readFile(casesFile, "utf8")));
const config = parseBenchmarkConfig(JSON.parse(await readFile("benchmarks/config.json", "utf8")));
const rawRuns = JSON.parse(await readFile(path.join(resultsDir, "raw-runs.json"), "utf8"));
const prevSummary = JSON.parse(await readFile(path.join(resultsDir, "summary.json"), "utf8"));
const caseById = new Map(cases.map((c) => [c.id, c]));

const runs = rawRuns.map((run: any) => {
  const benchmarkCase = caseById.get(run.caseId);
  if (!benchmarkCase) return run;
  const accuracyPass = evaluateRun({
    benchmarkCase,
    responseText: run.responseText,
    sqlText: run.sqlText ?? "",
    resultSignature: run.resultSignature ?? null,
    orderedResultSignature: run.orderedResultSignature ?? null,
    resultRowCount: run.resultRowCount ?? null,
    responseSuccess: run.responseSuccess,
    toolCallCount: run.toolCallCount,
    toolNames: run.toolNames,
    timeoutLike: run.timeoutLike,
  });
  const toolSelectionPass = evaluateToolSelection(
    benchmarkCase.expectation.expectedTools,
    run.toolNames ?? []
  );
  return { ...run, accuracyPass, toolSelectionPass };
});

const caseMetrics = computeCaseMetrics(cases, runs);
const summary = buildSummary({
  startedAt: prevSummary.startedAt,
  finishedAt: prevSummary.finishedAt,
  runs,
  caseMetrics,
  config,
  modelProvider: prevSummary.modelProvider,
  modelName: prevSummary.modelName,
});
const report = renderReport(summary, caseMetrics);

const outDir = `${resultsDir.replace(/\/$/, "")}-rescored`;
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "raw-runs.json"), JSON.stringify(runs, null, 2));
await writeFile(path.join(outDir, "case-metrics.json"), JSON.stringify(caseMetrics, null, 2));
await writeFile(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
await writeFile(path.join(outDir, "report.md"), report);
console.log(`Rescored -> ${outDir}`);
console.log(`resultAccuracy: ${prevSummary.resultAccuracy}% -> ${summary.resultAccuracy}%  (pass=${summary.pass})`);
