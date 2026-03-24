import { z } from "zod";

const benchmarkCaseCategorySchema = z.enum(["positive", "negative"]);

const benchmarkCaseSubtypeSchema = z.enum([
  "simple_retrieval",
  "complex_join",
  "aggregation",
  "complex_aggregation",
  "filtering",
  "out_of_scope",
  "mutation_attempt",
  "injection_attempt",
  "ambiguous_query",
  "nonexistent_entity",
]);

const benchmarkExpectedBehaviorSchema = z.enum(["sql", "refusal"]);

const benchmarkExpectationSchema = z.object({
  behavior: benchmarkExpectedBehaviorSchema,
  sqlMustNotContain: z.array(z.string()).optional(),
  responseMustContain: z.array(z.string()).optional(),
  expectedResultSignature: z.string().optional(),
  expectedTools: z.array(z.string()).optional(),
  maxToolCalls: z.number().int().nonnegative().optional(),
});

export const benchmarkCaseSchema = z.object({
  id: z.string().min(1),
  category: benchmarkCaseCategorySchema,
  subtype: benchmarkCaseSubtypeSchema,
  prompt: z.string().min(1),
  repeat: z.number().int().min(1).max(100),
  expectation: benchmarkExpectationSchema,
});

export const benchmarkConfigSchema = z
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
    }),
    promptSuffix: z.string().nullable().optional(),
    requestRetries: z.number().int().min(0).max(10).optional(),
    retryDelayMs: z.number().int().min(0).max(60_000).optional(),
    warmupEnabled: z.boolean().optional(),
  })
  .strict();

export type ParsedBenchmarkConfig = z.infer<typeof benchmarkConfigSchema>;
export type ParsedBenchmarkCase = z.infer<typeof benchmarkCaseSchema>;

export function parseBenchmarkConfig(raw: unknown): ParsedBenchmarkConfig {
  return benchmarkConfigSchema.parse(raw);
}

export function parseBenchmarkCases(raw: unknown): ParsedBenchmarkCase[] {
  return z.array(benchmarkCaseSchema).parse(raw);
}
