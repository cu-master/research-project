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
  sqlMustContain?: string[]; // legacy fallback checks
  sqlMustNotContain?: string[];
  responseMustContain?: string[];
  expectedResultSignature?: string;
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
  avgToolCalls: number;
}

export interface BenchmarkSummary {
  startedAt: string;
  finishedAt: string;
  totalCases: number;
  totalRuns: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgToolCalls: number;
  responseSuccessRate: number;
  resultAccuracy: number;
  consistencyScore: number | null;
  refusalRate: number;
  falsePositiveRate: number;
  timeoutRefusalRate: number;
  toolFrequency: Record<string, number>;
  thresholds: BenchmarkConfig["threshold"];
  pass: boolean;
}
