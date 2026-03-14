export type BenchmarkCaseCategory = "positive";

export type BenchmarkCaseSubtype =
  | "simple_retrieval"
  | "complex_join"
  | "aggregation";

export type BenchmarkExpectedBehavior = "sql";

export interface BenchmarkExpectation {
  behavior: BenchmarkExpectedBehavior;
  sqlMustContain?: string[];
  sqlMustNotContain?: string[];
  responseMustContain?: string[];
  expectedResultSignature?: string;
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
  executionSuccess: boolean;
  accuracyPass: boolean;
  error?: string;
}

export interface CaseMetrics {
  caseId: string;
  category: BenchmarkCaseCategory;
  subtype: BenchmarkCaseSubtype;
  runs: number;
  avgLatencyMs: number;
  executionRate: number;
  resultAccuracyRate: number | null;
  consistencyScore: number;
}

export interface BenchmarkSummary {
  startedAt: string;
  finishedAt: string;
  totalCases: number;
  totalRuns: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  executionRate: number;
  resultAccuracy: number;
  consistencyScore: number;
  thresholds: BenchmarkConfig["threshold"];
  pass: boolean;
}
