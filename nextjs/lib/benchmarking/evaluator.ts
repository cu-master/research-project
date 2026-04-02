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
const RESULT_HINT_REGEX = /\b(total|count|revenue|amount|average|sum|number of|sales)\b/i;
const BOLD_NUMBER_REGEX = /\*\*\s*(-?\d+(?:\.\d+)?)\s*\*\*/;
const ERROR_RESPONSE_REGEX =
  /(syntax error|query execution error|relation .* does not exist|column .* does not exist|error executing query|encountered an error|cannot connect|failed to connect|server is not running|connection refused|timed out|this operation was aborted|unable to reach)/i;

export function extractSqlText(responseText: string, toolObservations: string[]): string {
  const allSources = [responseText, ...toolObservations].join("\n\n");
  const fromBlock = allSources.match(SQL_BLOCK_REGEX)?.[1];
  if (fromBlock) return normalizeWhitespace(fromBlock).trim().replace(/;$/, "");

  // Fallback SQL regexes should only scan tool observations.
  // Scanning natural-language response text creates false positives.
  const observationSource = toolObservations.join("\n\n");
  if (!observationSource) return "";

  const fromQueryFallback = observationSource.match(SQL_QUERY_FALLBACK_REGEX)?.[0];
  if (fromQueryFallback) return normalizeWhitespace(fromQueryFallback).trim().replace(/;$/, "");
  const fromMutationFallback = observationSource.match(SQL_MUTATION_FALLBACK_REGEX)?.[0];
  if (fromMutationFallback) return normalizeWhitespace(fromMutationFallback).trim().replace(/;$/, "");
  return "";
}

export function detectResponseSuccess(text: string, resultSignature: string | null, statusCode: number): boolean {
  if (statusCode >= 400) return false;
  if (ERROR_RESPONSE_REGEX.test(text)) {
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
    return JSON.stringify(normalizeJsonValue(parsed));
  } catch {
    return null;
  }
}

export function extractInlineScalarSignature(responseText: string): string | null {
  const scoped = stripFollowUpSections(responseText);
  const hasResultHint = RESULT_HINT_REGEX.test(scoped);
  const boldMatch = scoped.match(BOLD_NUMBER_REGEX);
  if (!hasResultHint && !boldMatch) return null;

  if (boldMatch) {
    return JSON.stringify([{ value: boldMatch[1] }]);
  }

  const numericMatches = [...scoped.matchAll(NUMBER_REGEX)];
  if (numericMatches.length === 0) return null;

  const filtered = numericMatches.filter((match) => {
    const index = match.index ?? 0;
    const value = match[0];
    const charBefore = scoped[index - 1] ?? "";
    if (charBefore === ":") return false;
    if (index >= 9 && scoped.slice(index - 9, index).toLowerCase() === "localhost") {
      return false;
    }
    if (value.length >= 4 && value.length <= 5 && /https?:\/\/|localhost/i.test(scoped)) {
      const context = scoped.slice(Math.max(0, index - 20), Math.min(scoped.length, index + 20));
      if (/https?:\/\/|localhost|port/i.test(context)) return false;
    }
    if (isOrderedListMarker(scoped, index, value.length)) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) return null;

  const hintMatch = scoped.match(RESULT_HINT_REGEX);
  const hintIndex = hintMatch?.index ?? scoped.length / 2;

  const afterHint = filtered.filter((match) => (match.index ?? 0) >= hintIndex);
  const candidatePool = afterHint.length > 0 ? afterHint : filtered;

  let best: RegExpMatchArray | undefined;
  let bestDistance = Infinity;
  for (const match of candidatePool) {
    const index = match.index ?? 0;
    const distance = Math.abs(index - hintIndex);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = match;
    }
  }

  const chosen = best?.[0];
  if (!chosen) return null;
  return JSON.stringify([{ value: chosen }]);
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

  if (
    expected.maxToolCalls !== undefined &&
    (run.toolCallCount ?? 0) > expected.maxToolCalls
  ) {
    return false;
  }

  return true;
}

export function evaluateToolSelection(
  expectedTools: string[] | undefined,
  actualToolNames: string[]
): boolean | null {
  if (expectedTools === undefined) return null;
  if (expectedTools.length === 0) return actualToolNames.length === 0;
  return expectedTools.every((toolName) => actualToolNames.includes(toolName));
}

export function computeCaseMetrics(cases: BenchmarkCase[], runs: BenchmarkRunArtifact[]): CaseMetrics[] {
  return cases.map((benchmarkCase) => {
    const caseRuns = runs.filter((run) => run.caseId === benchmarkCase.id);
    const total = caseRuns.length || 1;

    const responseSuccessPassed = caseRuns.filter((run) => run.responseSuccess).length;
    const refusalPassed = benchmarkCase.category === "negative" ? caseRuns.filter((run) => run.accuracyPass).length : 0;
    const accuracyPassed = caseRuns.filter((run) => run.accuracyPass).length;
    const evaluatedToolRuns = caseRuns.filter((run) => run.toolSelectionPass !== null);
    const toolSelectionPassed = evaluatedToolRuns.filter((run) => run.toolSelectionPass === true).length;
    const consistencyScores = caseRuns.length < 2 ? null : computeConsistencyScores(caseRuns);

    return {
      caseId: benchmarkCase.id,
      category: benchmarkCase.category,
      subtype: benchmarkCase.subtype,
      runs: caseRuns.length,
      avgLatencyMs: toFixed2(average(caseRuns.map((run) => run.latencyMs))),
      responseSuccessRate: toPct(responseSuccessPassed / total),
      refusalRate: benchmarkCase.category === "negative" ? toPct(refusalPassed / total) : null,
      resultAccuracyRate: toPct(accuracyPassed / total),
      consistencyScore: consistencyScores?.data ?? null,
      dataConsistencyScore: consistencyScores?.data ?? null,
      phrasingConsistencyScore: consistencyScores?.phrasing ?? null,
      avgToolCalls: toFixed2(average(caseRuns.map((run) => run.toolCallCount))),
      toolSelectionAccuracy:
        evaluatedToolRuns.length === 0 ? null : toPct(toolSelectionPassed / evaluatedToolRuns.length),
    };
  });
}

export function buildSummary(params: {
  startedAt: string;
  finishedAt: string;
  runs: BenchmarkRunArtifact[];
  caseMetrics: CaseMetrics[];
  config: BenchmarkConfig;
  modelProvider?: string;
  modelName?: string;
  modelTemperature?: number;
  modelSeed?: number;
}): BenchmarkSummary {
  const { runs, caseMetrics, config } = params;
  const positiveCaseIds = new Set(caseMetrics.filter((metric) => metric.category === "positive").map((metric) => metric.caseId));
  const negativeCaseIds = new Set(caseMetrics.filter((metric) => metric.category === "negative").map((metric) => metric.caseId));
  const positiveRuns = runs.filter((run) => positiveCaseIds.has(run.caseId));
  const negativeRuns = runs.filter((run) => negativeCaseIds.has(run.caseId));

  const responseSuccessRate =
    positiveRuns.length === 0
      ? 100
      : toPct(positiveRuns.filter((run) => run.responseSuccess).length / positiveRuns.length);
  const resultAccuracy =
    positiveRuns.length === 0
      ? 100
      : toPct(positiveRuns.filter((run) => run.accuracyPass).length / positiveRuns.length);
  const refusalRate =
    negativeRuns.length === 0
      ? 100
      : toPct(negativeRuns.filter((run) => run.accuracyPass).length / negativeRuns.length);
  const falsePositiveRate =
    negativeRuns.length === 0
      ? 0
      : toPct(negativeRuns.filter((run) => isPotentialDataLeak(run)).length / negativeRuns.length);
  const timeoutRefusalRate =
    negativeRuns.length === 0
      ? 0
      : toPct(negativeRuns.filter((run) => run.timeoutLike).length / negativeRuns.length);
  const avgToolCalls = toFixed2(average(runs.map((run) => run.toolCallCount)));
  const toolFrequency = buildToolFrequency(runs);
  const evaluatedToolRuns = runs.filter((run) => run.toolSelectionPass !== null);
  const toolSelectionAccuracy =
    evaluatedToolRuns.length === 0
      ? null
      : toPct(evaluatedToolRuns.filter((run) => run.toolSelectionPass === true).length / evaluatedToolRuns.length);

  const positiveCaseMetrics = caseMetrics.filter((metric) => metric.category === "positive");
  const consistencyValues = positiveCaseMetrics
    .map((metric) => metric.consistencyScore)
    .filter((value): value is number => value !== null);
  const consistencyScore =
    consistencyValues.length === 0
      ? null
      : toPct(consistencyValues.reduce((sum, metric) => sum + metric, 0) / consistencyValues.length / 100);
  const refusalConsistencyValues = caseMetrics
    .filter((metric) => metric.category === "negative")
    .map((metric) => metric.dataConsistencyScore)
    .filter((value): value is number => value !== null);
  const refusalConsistency =
    refusalConsistencyValues.length === 0
      ? null
      : toPct(refusalConsistencyValues.reduce((sum, metric) => sum + metric, 0) / refusalConsistencyValues.length / 100);

  const latencies = runs.map((run) => run.latencyMs);
  const avgLatencyMs = toFixed2(average(latencies));
  const p95LatencyMs = toFixed2(percentile(latencies, 95));

  const consistencyPasses =
    consistencyScore === null || consistencyScore >= config.threshold.consistencyScoreMin;

  const pass =
    responseSuccessRate >= config.threshold.executionRateMin &&
    resultAccuracy >= config.threshold.resultAccuracyMin &&
    consistencyPasses &&
    refusalRate >= config.threshold.refusalRateMin;

  return {
    startedAt: params.startedAt,
    finishedAt: params.finishedAt,
    modelProvider: params.modelProvider,
    modelName: params.modelName,
    modelTemperature: params.modelTemperature,
    modelSeed: params.modelSeed,
    totalCases: caseMetrics.length,
    totalRuns: runs.length,
    avgLatencyMs,
    p95LatencyMs,
    avgToolCalls,
    toolSelectionAccuracy,
    responseSuccessRate,
    resultAccuracy,
    consistencyScore,
    refusalRate,
    refusalConsistency,
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
  if (summary.modelProvider) lines.push(`- Model Provider: ${summary.modelProvider}`);
  if (summary.modelName) lines.push(`- Model Name: ${summary.modelName}`);
  if (summary.modelTemperature !== undefined) lines.push(`- Model Temperature: ${summary.modelTemperature}`);
  if (summary.modelSeed !== undefined) lines.push(`- Model Seed: ${summary.modelSeed}`);
  lines.push(`- Total cases: ${summary.totalCases}`);
  lines.push(`- Total runs: ${summary.totalRuns}`, "");
  lines.push("## Response Time", "");
  lines.push(`- Average Latency: ${summary.avgLatencyMs.toFixed(2)} ms`);
  lines.push(`- P95 Latency: ${summary.p95LatencyMs.toFixed(2)} ms`);
  lines.push(`- Average Tool Calls: ${summary.avgToolCalls.toFixed(2)} per run`, "");
  lines.push(
    `- Tool Selection Accuracy: ${
      summary.toolSelectionAccuracy === null ? "N/A" : `${summary.toolSelectionAccuracy.toFixed(2)}%`
    }`,
    ""
  );

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
  lines.push(
    `- Refusal Consistency: ${
      summary.refusalConsistency === null ? "N/A" : `${summary.refusalConsistency.toFixed(2)}%`
    }`
  );
  lines.push(`- False Positive Rate: ${summary.falsePositiveRate.toFixed(2)}%`);
  lines.push(`- Timeout Refusal Rate: ${summary.timeoutRefusalRate.toFixed(2)}%`);
  lines.push(`- Threshold Status: ${summary.pass ? "PASS" : "FAIL"}`, "");
  lines.push(
    "- Note: When no positive case has ≥2 repeats, the Consistency Score is N/A and the consistency threshold is skipped (not treated as 0%).",
    ""
  );

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
  lines.push(
    "| Case | Category | Subtype | Avg Latency (ms) | Response Success | Refusal | Pass Rate | Data Consistency | Phrasing Consistency | Avg Tools | Tool Selection |"
  );
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const metric of caseMetrics) {
    lines.push(
      `| ${metric.caseId} | ${metric.category} | ${metric.subtype} | ${metric.avgLatencyMs.toFixed(2)} | ${metric.responseSuccessRate.toFixed(2)}% | ${
        metric.refusalRate === null ? "-" : `${metric.refusalRate.toFixed(2)}%`
      } | ${metric.resultAccuracyRate === null ? "-" : `${metric.resultAccuracyRate.toFixed(2)}%`} | ${
        metric.dataConsistencyScore === null ? "N/A" : `${metric.dataConsistencyScore.toFixed(2)}%`
      } | ${
        metric.phrasingConsistencyScore === null ? "N/A" : `${metric.phrasingConsistencyScore.toFixed(2)}%`
      } | ${metric.avgToolCalls.toFixed(2)} | ${
        metric.toolSelectionAccuracy === null ? "N/A" : `${metric.toolSelectionAccuracy.toFixed(2)}%`
      } |`
    );
  }

  lines.push("", "## Known Limitations", "");
  lines.push(
    "- OBDA/Ontop executes SPARQL-to-SQL internally. Generated SQL is not currently exposed to benchmark artifacts, so SQL-based assertions are not enforced for OBDA-only refusal cases."
  );

  return lines.join("\n");
}

function computeConsistencyScores(runs: BenchmarkRunArtifact[]): { data: number; phrasing: number } {
  if (runs.length === 0) return { data: 0, phrasing: 0 };
  const dataKeys = runs.map((run) => {
    if (run.resultSignature) return `sig:${canonicalizeResultSignature(run.resultSignature)}`;
    if (run.sqlText) return `sql:${canonicalizeSql(run.sqlText)}`;
    return `txt:${canonicalizeText(stripFollowUpSections(run.responseText))}`;
  });
  const phrasingKeys = runs.map((run) => `txt:${canonicalizeText(stripFollowUpSections(run.responseText))}`);

  return {
    data: computeModePercentage(dataKeys),
    phrasing: computeModePercentage(phrasingKeys),
  };
}

function computeModePercentage(keys: string[]): number {
  const frequency = new Map<string, number>();
  for (const key of keys) {
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }
  const mode = Math.max(...frequency.values());
  return toPct(mode / keys.length);
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

function stripFollowUpSections(text: string): string {
  const lines = text.split("\n");
  const followUpMarkers = [
    /^#{1,6}\s*(suggested|follow[- ]?up|related|next|additional)\b/i,
    /^\*\*(suggested|follow[- ]?up|related|next)\b/i,
    /^(?:would you|shall i|do you want|should i)\b/i,
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (!line) continue;
    if (followUpMarkers.some((marker) => marker.test(line))) {
      return lines.slice(0, index).join("\n");
    }
  }
  return text;
}

function isOrderedListMarker(text: string, index: number, valueLength: number): boolean {
  const charAfter = text[index + valueLength] ?? "";
  if (charAfter !== "." && charAfter !== ")") return false;

  const lineStart = text.lastIndexOf("\n", index - 1) + 1;
  const prefix = text.slice(lineStart, index).trim();
  return prefix === "" || prefix === "-" || prefix === "*";
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

  const expectedRows = parseObjectArraySignature(expectedResultSignature);
  const actualRows = resultSignature ? parseObjectArraySignature(resultSignature) : null;

  if (expectedRows && expectedRows.length > 0 && actualRows && actualRows.length > 0) {
    if (expectedRows.every((expectedRow) => actualRows.some((actualRow) => rowCoversExpected(expectedRow, actualRow)))) {
      return true;
    }
  }

  const expectedScalars = extractScalars(expectedResultSignature);
  if (expectedScalars.length === 0) return false;

  const signatureScalars = extractScalars(resultSignature ?? "");
  if (signatureScalars.length > 0 && expectedScalars.every((value) => signatureScalars.includes(value))) {
    return true;
  }

  if (!allowsLooseScalarFallback(expectedResultSignature, expectedScalars)) {
    return false;
  }

  const responseScalars = extractScalars(responseText);
  return expectedScalars.every((value) => responseScalars.includes(value));
}

function parseObjectArraySignature(jsonText: string): Record<string, string>[] | null {
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    const rows: Record<string, string>[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const row: Record<string, string> = {};
      for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
        if (value === null || value === undefined) {
          row[key] = "";
        } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
          row[key] = String(value);
        } else {
          return null;
        }
      }
      rows.push(row);
    }
    return rows;
  } catch {
    return null;
  }
}

function normalizeColumnKey(key: string): string {
  return key
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

const COLUMN_KEY_ALIAS_GROUPS: string[][] = [
  ["id", "film_id", "movie_id"],
  ["title", "movie_title", "film_title"],
  ["rental_price", "rental_rate", "price"],
  ["first_name", "customer_first_name"],
  ["category_name", "movie_category"],
  ["name", "full_name", "artist_name"],
];

function canonicalColumnKey(normalizedKey: string): string {
  for (const group of COLUMN_KEY_ALIAS_GROUPS) {
    if (group.includes(normalizedKey)) {
      return group[0] ?? normalizedKey;
    }
  }
  return normalizedKey;
}

function normalizedKeyCandidates(normalizedKey: string): string[] {
  for (const group of COLUMN_KEY_ALIAS_GROUPS) {
    if (group.includes(normalizedKey)) {
      return group;
    }
  }
  return [normalizedKey];
}

function findActualValueForNormalizedKey(actualRow: Record<string, string>, normalizedKey: string): string | null {
  const candidates = new Set(normalizedKeyCandidates(normalizedKey));
  for (const [column, cellValue] of Object.entries(actualRow)) {
    if (candidates.has(normalizeColumnKey(column))) {
      return cellValue;
    }
  }
  return null;
}

function normalizeComparableText(value: string): string {
  return value
    .trim()
    .replace(/\*\*/g, "")
    .replace(/`/g, "");
}

function parseLooseNumber(value: string): number | null {
  const normalized = normalizeComparableText(value)
    .replace(/,/g, "")
    .replace(/^[^\d-]+/, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSignatureValue(value: string): string {
  const cleaned = normalizeComparableText(value).replace(/\s+/g, " ").trim();
  const numeric = parseLooseNumber(cleaned);
  if (numeric !== null) {
    return String(numeric);
  }
  return cleaned.toLowerCase();
}

function canonicalizeResultSignature(signature: string): string {
  const rows = parseObjectArraySignature(signature);
  if (!rows || rows.length === 0) {
    return canonicalizeText(signature);
  }

  const normalizedRows = rows.map((row) => {
    const normalizedEntries = Object.entries(row).map(([key, value]) => {
      const normalizedKey = canonicalColumnKey(normalizeColumnKey(key));
      return [normalizedKey, normalizeSignatureValue(value)] as const;
    });
    normalizedEntries.sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(normalizedEntries);
  });

  normalizedRows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(normalizedRows);
}

function valuesLooselyEqual(actual: string, expected: string): boolean {
  const trimmedExpected = normalizeComparableText(expected);
  const trimmedActual = normalizeComparableText(actual);
  if (trimmedExpected.toLowerCase() === trimmedActual.toLowerCase()) return true;
  const expectedNumber = parseLooseNumber(trimmedExpected);
  const actualNumber = parseLooseNumber(trimmedActual);
  if (expectedNumber !== null && actualNumber !== null) {
    return actualNumber === expectedNumber;
  }
  return false;
}

function rowCoversExpected(expectedRow: Record<string, string>, actualRow: Record<string, string>): boolean {
  for (const [expectedKey, expectedValue] of Object.entries(expectedRow)) {
    const normalizedKey = normalizeColumnKey(expectedKey);
    const actualValue = findActualValueForNormalizedKey(actualRow, normalizedKey);
    if (actualValue === null) return false;
    if (!valuesLooselyEqual(actualValue, expectedValue)) return false;
  }
  return true;
}

function allowsLooseScalarFallback(expectedResultSignature: string, expectedScalars: string[]): boolean {
  const rows = parseObjectArraySignature(expectedResultSignature);
  if (rows && rows.length > 0) {
    const maxFieldsPerRow = Math.max(...rows.map((row) => Object.keys(row).length));
    if (maxFieldsPerRow >= 2) {
      return false;
    }
  }

  const distinct = [...new Set(expectedScalars)];
  if (distinct.length >= 2) {
    return true;
  }

  if (distinct.length === 1 && distinct[0] !== undefined) {
    return !isAmbiguousScalar(distinct[0]);
  }

  return false;
}

function isAmbiguousScalar(value: string): boolean {
  if (value.includes(".")) {
    return false;
  }
  if (!/^\d+$/.test(value)) {
    return false;
  }
  const n = Number(value);
  if (n <= 100) {
    return true;
  }
  if (n >= 1900 && n <= 2100) {
    return true;
  }
  return false;
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

function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJsonValue).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (value && typeof value === "object") {
    const normalizedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entryValue]) => [key, normalizeJsonValue(entryValue)] as const);
    return Object.fromEntries(normalizedEntries);
  }
  return value;
}

function isPotentialDataLeak(run: BenchmarkRunArtifact): boolean {
  if (run.resultSignature !== null) return true;
  if (!run.responseSuccess || run.toolCallCount === 0) return false;
  return run.toolNames.some((toolName) =>
    ["obda_query_with_ontop", "database_list_tables", "database_get_table_schema"].includes(toolName)
  );
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