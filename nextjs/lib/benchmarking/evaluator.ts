import type {
  BenchmarkCase,
  BenchmarkRunArtifact,
  CaseMetrics,
  BenchmarkSummary,
  BenchmarkConfig,
} from "./types.ts";

const SQL_BLOCK_REGEX = /```sql\s*([\s\S]*?)```/i;
const SQL_FALLBACK_REGEX = /\b(SELECT|WITH)\b[\s\S]*?(;|$)/i;

export function extractSqlText(responseText: string, toolObservations: string[]): string {
  const source = [responseText, ...toolObservations].join("\n\n");
  const fromBlock = source.match(SQL_BLOCK_REGEX)?.[1];
  if (fromBlock) return normalizeWhitespace(fromBlock).trim().replace(/;$/, "");
  const fromFallback = source.match(SQL_FALLBACK_REGEX)?.[0];
  if (fromFallback) return normalizeWhitespace(fromFallback).trim().replace(/;$/, "");
  return "";
}

export function detectExecutionSuccess(text: string, sqlText: string, statusCode: number): boolean {
  if (statusCode >= 400) return false;
  if (!sqlText) return false;
  return !/(syntax error|query execution error|relation .* does not exist|column .* does not exist|error executing query)/i.test(
    text
  );
}

export function extractMarkdownTableSignature(responseText: string): string | null {
  const lines = responseText.split("\n").map((line) => line.trim());
  const tableLines = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
  if (tableLines.length < 3) return null;

  const header = splitTableLine(tableLines[0]);
  const divider = splitTableLine(tableLines[1]);
  if (!header.length || !divider.length) return null;

  const rows = tableLines.slice(2).map(splitTableLine);
  const normalizedRows = rows
    .filter((cells) => cells.length === header.length)
    .map((cells) => {
      const row: Record<string, string> = {};
      header.forEach((column, index) => {
        row[column] = cells[index];
      });
      return sortRecord(row);
    });

  normalizedRows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(normalizedRows);
}

export function evaluateRun(run: {
  benchmarkCase: BenchmarkCase;
  responseText: string;
  sqlText: string;
  resultSignature: string | null;
  executionSuccess: boolean;
}): boolean {
  const expected = run.benchmarkCase.expectation;
  const sqlNormalized = run.sqlText.toLowerCase();
  const responseNormalized = run.responseText.toLowerCase();

  if (expected.behavior === "sql" && !run.executionSuccess) return false;

  if (expected.sqlMustContain?.some((token) => !sqlNormalized.includes(token.toLowerCase()))) {
    return false;
  }
  if (expected.sqlMustNotContain?.some((token) => sqlNormalized.includes(token.toLowerCase()))) {
    return false;
  }
  if (expected.responseMustContain?.some((token) => !responseNormalized.includes(token.toLowerCase()))) {
    return false;
  }
  if (expected.expectedResultSignature && run.resultSignature !== expected.expectedResultSignature) {
    return false;
  }

  return true;
}

export function computeCaseMetrics(cases: BenchmarkCase[], runs: BenchmarkRunArtifact[]): CaseMetrics[] {
  return cases.map((benchmarkCase) => {
    const caseRuns = runs.filter((run) => run.caseId === benchmarkCase.id);
    const total = caseRuns.length || 1;

    const executionPassed = caseRuns.filter((run) => run.executionSuccess).length;
    const accuracyPassed = caseRuns.filter((run) => run.accuracyPass).length;

    const hasResultSignature = Boolean(benchmarkCase.expectation.expectedResultSignature);

    return {
      caseId: benchmarkCase.id,
      category: benchmarkCase.category,
      subtype: benchmarkCase.subtype,
      runs: caseRuns.length,
      avgLatencyMs: toFixed2(average(caseRuns.map((run) => run.latencyMs))),
      executionRate: toPct(executionPassed / total),
      resultAccuracyRate: hasResultSignature ? toPct(accuracyPassed / total) : null,
      consistencyScore: computeConsistencyScore(caseRuns),
    };
  });
}

export function buildSummary(params: {
  startedAt: string;
  finishedAt: string;
  runs: BenchmarkRunArtifact[];
  caseMetrics: CaseMetrics[];
  config: BenchmarkConfig;
}): BenchmarkSummary {
  const { runs, caseMetrics, config } = params;
  const executionRate = toPct(runs.filter((run) => run.executionSuccess).length / Math.max(1, runs.length));

  const resultAccuracyRuns = runs.filter((run) => run.resultSignature !== null);
  const resultAccuracy = toPct(
    resultAccuracyRuns.filter((run) => run.accuracyPass).length / Math.max(1, resultAccuracyRuns.length)
  );

  const consistencyScore = toPct(
    caseMetrics.reduce((sum, metric) => sum + metric.consistencyScore, 0) / Math.max(1, caseMetrics.length) / 100
  );
  const latencies = runs.map((run) => run.latencyMs);
  const avgLatencyMs = toFixed2(average(latencies));
  const p95LatencyMs = toFixed2(percentile(latencies, 95));

  const pass =
    executionRate >= config.threshold.executionRateMin &&
    resultAccuracy >= config.threshold.resultAccuracyMin &&
    consistencyScore >= config.threshold.consistencyScoreMin;

  return {
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    totalCases: caseMetrics.length,
    totalRuns: runs.length,
    avgLatencyMs,
    p95LatencyMs,
    executionRate,
    resultAccuracy,
    consistencyScore,
    thresholds: config.threshold,
    pass,
  };
}

export function renderReport(summary: BenchmarkSummary, caseMetrics: CaseMetrics[]): string {
  const lines: string[] = [];
  lines.push("# AI Accuracy Benchmark Report", "");
  lines.push(`- Started: ${summary.startedAt}`);
  lines.push(`- Finished: ${summary.finishedAt}`);
  lines.push(`- Total cases: ${summary.totalCases}`);
  lines.push(`- Total runs: ${summary.totalRuns}`, "");
  lines.push("## Response Time", "");
  lines.push(`- Average Latency: ${summary.avgLatencyMs.toFixed(2)} ms`);
  lines.push(`- P95 Latency: ${summary.p95LatencyMs.toFixed(2)} ms`, "");

  lines.push("## Overall Metrics", "");
  lines.push(`- Execution Rate: ${summary.executionRate.toFixed(2)}% (min ${summary.thresholds.executionRateMin}%)`);
  lines.push(`- Result Accuracy: ${summary.resultAccuracy.toFixed(2)}% (min ${summary.thresholds.resultAccuracyMin}%)`);
  lines.push(
    `- Consistency Score: ${summary.consistencyScore.toFixed(2)}% (min ${summary.thresholds.consistencyScoreMin}%)`
  );
  lines.push(`- Threshold Status: ${summary.pass ? "PASS" : "FAIL"}`, "");

  lines.push("## Per-Case Metrics", "");
  lines.push("| Case | Subtype | Avg Latency (ms) | Execution | Accuracy | Consistency |");
  lines.push("|---|---|---:|---:|---:|---:|");
  for (const metric of caseMetrics) {
    lines.push(
      `| ${metric.caseId} | ${metric.subtype} | ${metric.avgLatencyMs.toFixed(2)} | ${metric.executionRate.toFixed(2)}% | ${
        metric.resultAccuracyRate === null ? "-" : `${metric.resultAccuracyRate.toFixed(2)}%`
      } | ${metric.consistencyScore.toFixed(2)}% |`
    );
  }

  return lines.join("\n");
}

function computeConsistencyScore(runs: BenchmarkRunArtifact[]): number {
  if (runs.length === 0) return 0;
  const keys = runs.map((run) => {
    if (run.sqlText) return `sql:${canonicalizeSql(run.sqlText)}`;
    return `txt:${canonicalizeText(run.responseText)}`;
  });

  const frequency = new Map<string, number>();
  for (const key of keys) {
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }
  const mode = Math.max(...frequency.values());
  return toPct(mode / runs.length);
}

function canonicalizeSql(sql: string): string {
  return sql
    .toLowerCase()
    .replace(/[`"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*=\s*/g, "=")
    .replace(/;$/, "")
    .trim();
}

function canonicalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function splitTableLine(line: string): string[] {
  return line
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function sortRecord(row: Record<string, string>): Record<string, string> {
  const entries = Object.entries(row).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function toPct(value: number): number {
  return Number((value * 100).toFixed(2));
}

function toFixed2(value: number): number {
  return Number(value.toFixed(2));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], percentileValue: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  const safeIndex = Math.min(Math.max(index, 0), sorted.length - 1);
  return sorted[safeIndex];
}