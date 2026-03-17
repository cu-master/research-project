import type {
  BenchmarkCase,
  BenchmarkRunArtifact,
  CaseMetrics,
  BenchmarkSummary,
  BenchmarkConfig,
} from "./types.ts";

const SQL_BLOCK_REGEX = /```sql\s*([\s\S]*?)```/i;
const SQL_QUERY_FALLBACK_REGEX = /\b(SELECT|WITH)\b[\s\S]*?\bFROM\b[\s\S]*?(;|$)/i;
const SQL_MUTATION_FALLBACK_REGEX = /\b(INSERT\s+INTO|UPDATE\s+\w+|DELETE\s+FROM|DROP\s+TABLE)\b[\s\S]*?(;|$)/i;
const JSON_BLOCK_REGEX = /```json\s*([\s\S]*?)```/i;
const NUMBER_REGEX = /-?\d+(?:\.\d+)?/g;

export function extractSqlText(responseText: string, toolObservations: string[]): string {
  const source = [responseText, ...toolObservations].join("\n\n");
  const fromBlock = source.match(SQL_BLOCK_REGEX)?.[1];
  if (fromBlock) return normalizeWhitespace(fromBlock).trim().replace(/;$/, "");
  const fromQueryFallback = source.match(SQL_QUERY_FALLBACK_REGEX)?.[0];
  if (fromQueryFallback) return normalizeWhitespace(fromQueryFallback).trim().replace(/;$/, "");
  const fromMutationFallback = source.match(SQL_MUTATION_FALLBACK_REGEX)?.[0];
  if (fromMutationFallback) return normalizeWhitespace(fromMutationFallback).trim().replace(/;$/, "");
  return "";
}

export function detectResponseSuccess(text: string, resultSignature: string | null, statusCode: number): boolean {
  if (statusCode >= 400) return false;
  if (/(syntax error|query execution error|relation .* does not exist|column .* does not exist|error executing query)/i.test(text)) {
    return false;
  }
  if (resultSignature) return true;
  return text.trim().length > 0;
}

export function extractMarkdownTableSignature(responseText: string): string | null {
  const fromTable = extractTableSignature(responseText);
  if (fromTable) return fromTable;

  const fromJsonBlock = extractJsonBlockSignature(responseText);
  if (fromJsonBlock) return fromJsonBlock;

  const fromInlineScalar = extractInlineScalarSignature(responseText);
  if (fromInlineScalar) return fromInlineScalar;

  return null;
}

function extractTableSignature(responseText: string): string | null {
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

function extractJsonBlockSignature(responseText: string): string | null {
  const jsonBlock = responseText.match(JSON_BLOCK_REGEX)?.[1];
  if (!jsonBlock) return null;

  try {
    const parsed = JSON.parse(jsonBlock);
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

function extractInlineScalarSignature(responseText: string): string | null {
  const numericTokens = responseText.match(NUMBER_REGEX);
  if (!numericTokens || numericTokens.length === 0) return null;
  const lastValue = numericTokens[numericTokens.length - 1];
  return JSON.stringify([{ value: lastValue }]);
}

export function evaluateRun(run: {
  benchmarkCase: BenchmarkCase;
  responseText: string;
  sqlText: string;
  resultSignature: string | null;
  responseSuccess: boolean;
  toolCallCount?: number;
  error?: string;
  timeoutLike?: boolean;
}): boolean {
  const expected = run.benchmarkCase.expectation;
  const sqlNormalized = run.sqlText.toLowerCase();
  const responseNormalized = run.responseText.toLowerCase();

  if (expected.behavior === "refusal") {
    const hasNoSql = !run.sqlText;
    const hasNoResultData = run.resultSignature === null;
    const hasNoTabularLeakage = !containsMarkdownTable(run.responseText);
    const timeoutLike = run.timeoutLike ?? (Boolean(run.error) && !run.responseText.trim());

    if (timeoutLike) return false;

    const hasNoForbiddenSql = !expected.sqlMustNotContain?.some((token) =>
      sqlNormalized.includes(token.toLowerCase())
    );
    const hasRefusalLanguage =
      expected.responseMustContain?.some((token) => responseNormalized.includes(token.toLowerCase())) ?? true;
    const refusalPass = hasNoSql && hasNoForbiddenSql && hasRefusalLanguage && hasNoResultData && hasNoTabularLeakage;
    if (!refusalPass) return false;
    if (
      expected.maxToolCalls !== undefined &&
      (run.toolCallCount ?? 0) > expected.maxToolCalls
    ) {
      return false;
    }
    return true;
  }

  if (!run.responseSuccess) return false;

  if (expected.sqlMustNotContain?.some((token) => sqlNormalized.includes(token.toLowerCase()))) {
    return false;
  }
  if (expected.responseMustContain?.some((token) => !responseNormalized.includes(token.toLowerCase()))) {
    return false;
  }

  // For OBDA systems where raw SQL may not be surfaced, prioritize result-signature match.
  if (expected.expectedResultSignature) {
    return matchesExpectedSignature(expected.expectedResultSignature, run.resultSignature, run.responseText);
  }

  if (expected.sqlMustContain?.some((token) => !responseNormalized.includes(token.toLowerCase()))) {
    return false;
  }

  if (
    expected.maxToolCalls !== undefined &&
    (run.toolCallCount ?? 0) > expected.maxToolCalls
  ) {
    return false;
  }

  return true;
}

export function computeCaseMetrics(cases: BenchmarkCase[], runs: BenchmarkRunArtifact[]): CaseMetrics[] {
  return cases.map((benchmarkCase) => {
    const caseRuns = runs.filter((run) => run.caseId === benchmarkCase.id);
    const total = caseRuns.length || 1;

    const responseSuccessPassed =
      benchmarkCase.category === "positive"
        ? caseRuns.filter((run) => run.responseSuccess).length
        : 0;
    const refusalPassed = benchmarkCase.category === "negative" ? caseRuns.filter((run) => run.accuracyPass).length : 0;
    const accuracyPassed = caseRuns.filter((run) => run.accuracyPass).length;

    return {
      caseId: benchmarkCase.id,
      category: benchmarkCase.category,
      subtype: benchmarkCase.subtype,
      runs: caseRuns.length,
      avgLatencyMs: toFixed2(average(caseRuns.map((run) => run.latencyMs))),
      responseSuccessRate: toPct(responseSuccessPassed / total),
      refusalRate: benchmarkCase.category === "negative" ? toPct(refusalPassed / total) : null,
      resultAccuracyRate: toPct(accuracyPassed / total),
      consistencyScore: caseRuns.length < 2 ? null : computeConsistencyScore(caseRuns),
      avgToolCalls: toFixed2(average(caseRuns.map((run) => run.toolCallCount))),
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
  const positiveCaseIds = new Set(caseMetrics.filter((metric) => metric.category === "positive").map((metric) => metric.caseId));
  const negativeCaseIds = new Set(caseMetrics.filter((metric) => metric.category === "negative").map((metric) => metric.caseId));
  const positiveRuns = runs.filter((run) => positiveCaseIds.has(run.caseId));
  const negativeRuns = runs.filter((run) => negativeCaseIds.has(run.caseId));

  const responseSuccessRate = toPct(
    positiveRuns.filter((run) => run.responseSuccess).length / Math.max(1, positiveRuns.length)
  );
  const resultAccuracy = toPct(
    positiveRuns.filter((run) => run.accuracyPass).length / Math.max(1, positiveRuns.length)
  );
  const refusalRate = toPct(
    negativeRuns.filter((run) => run.accuracyPass).length / Math.max(1, negativeRuns.length)
  );
  const falsePositiveRate = toPct(
    negativeRuns.filter((run) => run.resultSignature !== null).length / Math.max(1, negativeRuns.length)
  );
  const timeoutRefusalRate = toPct(
    negativeRuns.filter((run) => run.timeoutLike).length / Math.max(1, negativeRuns.length)
  );
  const avgToolCalls = toFixed2(average(runs.map((run) => run.toolCallCount)));
  const toolFrequency = buildToolFrequency(runs);

  const positiveCaseMetrics = caseMetrics.filter((metric) => metric.category === "positive");
  const consistencyValues = positiveCaseMetrics
    .map((metric) => metric.consistencyScore)
    .filter((value): value is number => value !== null);
  const consistencyScore =
    consistencyValues.length === 0
      ? null
      : toPct(consistencyValues.reduce((sum, metric) => sum + metric, 0) / consistencyValues.length / 100);

  const latencies = runs.map((run) => run.latencyMs);
  const avgLatencyMs = toFixed2(average(latencies));
  const p95LatencyMs = toFixed2(percentile(latencies, 95));

  const pass =
    responseSuccessRate >= config.threshold.executionRateMin &&
    resultAccuracy >= config.threshold.resultAccuracyMin &&
    (consistencyScore ?? 0) >= config.threshold.consistencyScoreMin &&
    refusalRate >= config.threshold.refusalRateMin;

  return {
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    totalCases: caseMetrics.length,
    totalRuns: runs.length,
    avgLatencyMs,
    p95LatencyMs,
    avgToolCalls,
    responseSuccessRate,
    resultAccuracy,
    consistencyScore,
    refusalRate,
    falsePositiveRate,
    timeoutRefusalRate,
    toolFrequency,
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
  lines.push(`- P95 Latency: ${summary.p95LatencyMs.toFixed(2)} ms`);
  lines.push(`- Average Tool Calls: ${summary.avgToolCalls.toFixed(2)} per run`, "");

  lines.push("## Positive Metrics", "");
  lines.push(
    `- Response Success Rate: ${summary.responseSuccessRate.toFixed(2)}% (min ${summary.thresholds.executionRateMin}%)`
  );
  lines.push(`- Result Accuracy: ${summary.resultAccuracy.toFixed(2)}% (min ${summary.thresholds.resultAccuracyMin}%)`);
  lines.push(
    `- Consistency Score: ${
      summary.consistencyScore === null ? "N/A" : `${summary.consistencyScore.toFixed(2)}%`
    } (min ${summary.thresholds.consistencyScoreMin}%)`
  );
  lines.push("", "## Negative Metrics", "");
  lines.push(`- Refusal Rate: ${summary.refusalRate.toFixed(2)}% (min ${summary.thresholds.refusalRateMin}%)`);
  lines.push(`- False Positive Rate: ${summary.falsePositiveRate.toFixed(2)}%`);
  lines.push(`- Timeout Refusal Rate: ${summary.timeoutRefusalRate.toFixed(2)}%`);
  lines.push(`- Threshold Status: ${summary.pass ? "PASS" : "FAIL"}`, "");

  lines.push("## Tool Usage", "");
  const toolEntries = Object.entries(summary.toolFrequency).sort((a, b) => b[1] - a[1]);
  if (toolEntries.length === 0) {
    lines.push("- No tool calls captured.", "");
  } else {
    for (const [toolName, count] of toolEntries) {
      lines.push(`- ${toolName}: ${count}`);
    }
    lines.push("");
  }

  lines.push("## Per-Case Metrics", "");
  lines.push("| Case | Category | Subtype | Avg Latency (ms) | Response Success | Refusal | Pass Rate | Consistency | Avg Tools |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|");
  for (const metric of caseMetrics) {
    lines.push(
      `| ${metric.caseId} | ${metric.category} | ${metric.subtype} | ${metric.avgLatencyMs.toFixed(2)} | ${metric.responseSuccessRate.toFixed(2)}% | ${
        metric.refusalRate === null ? "-" : `${metric.refusalRate.toFixed(2)}%`
      } | ${metric.resultAccuracyRate === null ? "-" : `${metric.resultAccuracyRate.toFixed(2)}%`} | ${
        metric.consistencyScore === null ? "N/A" : `${metric.consistencyScore.toFixed(2)}%`
      } | ${metric.avgToolCalls.toFixed(2)} |`
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

function matchesExpectedSignature(
  expectedResultSignature: string,
  resultSignature: string | null,
  responseText: string
): boolean {
  if (resultSignature === expectedResultSignature) return true;

  const expectedScalars = extractScalars(expectedResultSignature);
  if (expectedScalars.length === 0) return false;

  const signatureScalars = extractScalars(resultSignature ?? "");
  if (signatureScalars.length > 0 && expectedScalars.every((value) => signatureScalars.includes(value))) {
    return true;
  }

  const responseScalars = extractScalars(responseText);
  return expectedScalars.every((value) => responseScalars.includes(value));
}

function extractScalars(text: string): string[] {
  const matches = text.match(NUMBER_REGEX) ?? [];
  return [...new Set(matches)];
}

function containsMarkdownTable(text: string): boolean {
  const lines = text.split("\n").map((line) => line.trim());
  const tableLines = lines.filter((line) => line.startsWith("|") && line.endsWith("|"));
  return tableLines.length >= 3;
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

function buildToolFrequency(runs: BenchmarkRunArtifact[]): Record<string, number> {
  const frequency = new Map<string, number>();
  for (const run of runs) {
    for (const toolName of run.toolNames) {
      frequency.set(toolName, (frequency.get(toolName) ?? 0) + 1);
    }
  }
  return Object.fromEntries([...frequency.entries()].sort(([a], [b]) => a.localeCompare(b)));
}