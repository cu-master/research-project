export type BenchmarkCaseCategory = "positive" | "negative";

export type BenchmarkCaseSubtype =
  | "simple_retrieval"
  | "complex_join"
  | "aggregation"
  | "complex_aggregation"
  | "filtering"
  | "out_of_scope"
  | "mutation_attempt"
  | "injection_attempt"
  | "ambiguous_query"
  | "nonexistent_entity";

export type BenchmarkExpectedBehavior = "sql" | "refusal";

export interface BenchmarkExpectation {
  behavior: BenchmarkExpectedBehavior;
  sqlMustNotContain?: string[];
  responseMustContain?: string[];
  expectedResultSignature?: string;
  expectedTools?: string[];
  maxToolCalls?: number;
}

export interface BenchmarkCase {
  id: string;
  category: BenchmarkCaseCategory;
  subtype: BenchmarkCaseSubtype;
  prompt: string;
  repeat: number;
  expectation: BenchmarkExpectation;
}

export interface BenchmarkConfig {
  baseUrl: string;
  endpointPath: string;
  timeoutMs: number;
  threshold: {
    executionRateMin: number;
    resultAccuracyMin: number;
    consistencyScoreMin: number;
    refusalRateMin: number;
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
  refusalConsistency: number | null;
  falsePositiveRate: number;
  timeoutRefusalRate: number;
  toolFrequency: Record<string, number>;
  thresholds: BenchmarkConfig["threshold"];
  pass: boolean;
}
