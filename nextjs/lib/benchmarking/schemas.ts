import { z } from "zod";

const benchmarkCaseCategorySchema = z.enum(["positive", "negative"]);

/** Free-form label for reports and filtering; new case files can introduce values without schema edits. */
const benchmarkCaseSubtypeSchema = z.string().min(1);

const benchmarkExpectedBehaviorSchema = z.enum([
  "sql",
  "refusal",
  /** Negative: model asks for clarification instead of returning data (same gates as refusal). */
  "clarification",
]);

const refusalTrackSchema = z.enum(["safety", "scope"]);

const benchmarkExpectationSchema = z
  .object({
    behavior: benchmarkExpectedBehaviorSchema,
    sqlMustNotContain: z.array(z.string()).optional(),
    responseMustContain: z.array(z.string()).optional(),
    expectedResultSignature: z.string().optional(),
    expectedRowCount: z.number().int().nonnegative().optional(),
    maxRowCount: z.number().int().nonnegative().optional(),
    orderingMatters: z.boolean().optional(),
    refusalTrack: refusalTrackSchema.optional(),
    expectedTools: z.array(z.string()).optional(),
    maxToolCalls: z.number().int().nonnegative().optional(),
    /** Human-readable intent; ignored by the evaluator. */
    notes: z.string().optional(),
  })
  .passthrough();

const benchmarkGroundTruthSchema = z
  .object({
    database: z.string().min(1),
    sql: z.string().min(1),
  })
  .strict();

const benchmarkCaseSchema = z
  .object({
    id: z.string().min(1),
    category: benchmarkCaseCategorySchema,
    subtype: benchmarkCaseSubtypeSchema,
    prompt: z.string().min(1),
    repeat: z.number().int().min(1).max(100),
    expectation: benchmarkExpectationSchema,
    /** Optional dataset documentation; ignored by the evaluator. */
    entity: z.union([z.string(), z.null()]).optional(),
    mappedTable: z.union([z.string(), z.null()]).optional(),
    groundTruth: benchmarkGroundTruthSchema.optional(),
  })
  .passthrough();

const benchmarkConfigSchema = z
  .object({
    // Allow localhost and dev URLs without tripping strict URL parsing in all environments.
    baseUrl: z.string().min(1),
    endpointPath: z.string().min(1),
    timeoutMs: z.number().int().positive(),
    threshold: z.object({
      executionRateMin: z.number().min(0).max(100),
      resultAccuracyMin: z.number().min(0).max(100),
      consistencyScoreMin: z.number().min(0).max(100),
      refusalRateMin: z.number().min(0).max(100),
      safetyRefusalRateMin: z.number().min(0).max(100).optional(),
      scopeRefusalRateMin: z.number().min(0).max(100).optional(),
    }),
    promptSuffix: z.string().nullable().optional(),
    requestRetries: z.number().int().min(0).max(10).optional(),
    retryDelayMs: z.number().int().min(0).max(60_000).optional(),
    warmupEnabled: z.boolean().optional(),
  })
  .strict();

type ParsedBenchmarkConfig = z.infer<typeof benchmarkConfigSchema>;
type ParsedBenchmarkCase = z.infer<typeof benchmarkCaseSchema>;

export function parseBenchmarkConfig(raw: unknown): ParsedBenchmarkConfig {
  return benchmarkConfigSchema.parse(raw);
}

export function parseBenchmarkCases(raw: unknown): ParsedBenchmarkCase[] {
  return z.array(benchmarkCaseSchema).parse(raw);
}
