export type BenchmarkCaseCategory = "positive" | "negative";

/** Report label only; any non-empty string is accepted when parsing case JSON. */
export type BenchmarkCaseSubtype = string;

export type BenchmarkExpectedBehavior = "sql" | "refusal" | "clarification";

/**
 * Refusal track for negative cases. `safety` covers anything that could leak data,
 * mutate state, or execute injection (must be near-perfectly refused). `scope` covers
 * out-of-domain or under-specified prompts where graceful decline is sufficient.
 */
export type RefusalTrack = "safety" | "scope";

export interface BenchmarkExpectation {
  behavior: BenchmarkExpectedBehavior;
  sqlMustNotContain?: string[];
  responseMustContain?: string[];
  expectedResultSignature?: string;
  /** Exact number of rows the result must contain (after extraction). */
  expectedRowCount?: number;
  /** Maximum number of rows allowed (e.g. enforce "top 10" limits). */
  maxRowCount?: number;
  /** When true, expected rows must appear in the same order at the start of the actual result. */
  orderingMatters?: boolean;
  /** Explicit refusal track for negative cases. If omitted, derived from subtype. */
  refusalTrack?: RefusalTrack;
  expectedTools?: string[];
  maxToolCalls?: number;
  /** Documented intent; ignored by the evaluator. */
  notes?: string;
}

/**
 * Canonical SQL that produces the expected result for a positive case. Used by the
 * ground-truth verification script (`scripts/verify-benchmark-ground-truth.ts`) to
 * confirm the expected signature is still correct against the live database.
 */
export interface BenchmarkGroundTruth {
  /** Postgres database name to connect to (e.g. "dvdrental", "moma", "airlines"). */
  database: string;
  /** Read-only SQL whose result the expected signature was derived from. */
  sql: string;
}

export interface BenchmarkCase {
  id: string;
  category: BenchmarkCaseCategory;
  subtype: BenchmarkCaseSubtype;
  prompt: string;
  repeat: number;
  expectation: BenchmarkExpectation;
  entity?: string | null;
  mappedTable?: string | null;
  groundTruth?: BenchmarkGroundTruth;
}

export interface BenchmarkConfig {
  baseUrl: string;
  endpointPath: string;
  timeoutMs: number;
  threshold: {
    executionRateMin: number;
    resultAccuracyMin: number;
    consistencyScoreMin: number;
    /** Overall negative-case refusal rate. Kept for back-compat / reporting. */
    refusalRateMin: number;
    /** Required pass rate on safety-track refusals (injection, mutation, PII). */
    safetyRefusalRateMin?: number;
    /** Required pass rate on scope-track refusals (out-of-scope, ambiguous). */
    scopeRefusalRateMin?: number;
  };
  /** Appended to every benchmark prompt. Set to null or "" in config to disable. */
  promptSuffix?: string | null;
  /** Retries for transient HTTP/network failures (not counting the first attempt). */
  requestRetries?: number;
  /** Delay between retry attempts in milliseconds. */
  retryDelayMs?: number;
  /** Run an extra unmeasured chat request after preflight to warm caches. */
  warmupEnabled?: boolean;
}

export interface BenchmarkRunArtifact {
  caseId: string;
  iteration: number;
  startedAt: string;
  latencyMs: number;
  statusCode: number;
  responseText: string;
  sqlText: string;
  resultSignature: string | null;
  /** Normalized result rows in document order (no row sort). Used for ordering checks. */
  orderedResultSignature: string | null;
  /** Number of rows extracted from the response, or null if no structured result was found. */
  resultRowCount: number | null;
  responseSuccess: boolean;
  accuracyPass: boolean;
  toolCallCount: number;
  toolNames: string[];
  toolSelectionPass: boolean | null;
  timeoutLike: boolean;
  error?: string;
}

export interface CaseMetrics {
  caseId: string;
  category: BenchmarkCaseCategory;
  subtype: BenchmarkCaseSubtype;
  /** Resolved refusal track for negative cases; null for positive cases. */
  refusalTrack: RefusalTrack | null;
  runs: number;
  avgLatencyMs: number;
  responseSuccessRate: number;
  refusalRate: number | null;
  resultAccuracyRate: number | null;
  consistencyScore: number | null;
  dataConsistencyScore: number | null;
  phrasingConsistencyScore: number | null;
  avgToolCalls: number;
  toolSelectionAccuracy: number | null;
}

export interface BenchmarkSummary {
  startedAt: string;
  finishedAt: string;
  modelProvider?: string;
  modelName?: string;
  modelTemperature?: number;
  modelSeed?: number;
  totalCases: number;
  totalRuns: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgToolCalls: number;
  toolSelectionAccuracy: number | null;
  responseSuccessRate: number;
  resultAccuracy: number;
  consistencyScore: number | null;
  refusalRate: number;
  /** Refusal pass rate on safety-track negative cases. Null when none defined. */
  safetyRefusalRate: number | null;
  /** Refusal pass rate on scope-track negative cases. Null when none defined. */
  scopeRefusalRate: number | null;
  refusalConsistency: number | null;
  falsePositiveRate: number;
  timeoutRefusalRate: number;
  toolFrequency: Record<string, number>;
  thresholds: BenchmarkConfig["threshold"];
  pass: boolean;
}
