import { describe, it, expect } from "vitest";
import { parseBenchmarkCases, parseBenchmarkConfig } from "./schemas.ts";

describe("parseBenchmarkConfig", () => {
  it("parses a minimal valid config", () => {
    const parsed = parseBenchmarkConfig({
      baseUrl: "http://localhost:3000",
      endpointPath: "/api/chat",
      timeoutMs: 45000,
      threshold: {
        executionRateMin: 85,
        resultAccuracyMin: 80,
        consistencyScoreMin: 75,
        refusalRateMin: 90,
      },
    });
    expect(parsed.baseUrl).toBe("http://localhost:3000");
  });

  it("rejects unknown top-level keys", () => {
    expect(() =>
      parseBenchmarkConfig({
        baseUrl: "http://localhost:3000",
        endpointPath: "/api/chat",
        timeoutMs: 45000,
        threshold: {
          executionRateMin: 85,
          resultAccuracyMin: 80,
          consistencyScoreMin: 75,
          refusalRateMin: 90,
        },
        typoField: true,
      })
    ).toThrow();
  });
});

describe("parseBenchmarkCases", () => {
  it("parses a single benchmark case", () => {
    const parsed = parseBenchmarkCases([
      {
        id: "P01",
        category: "positive",
        subtype: "simple_retrieval",
        prompt: "Hello",
        repeat: 1,
        expectation: { behavior: "sql" },
      },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("P01");
  });
});
