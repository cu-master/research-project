import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseBenchmarkCases, parseBenchmarkConfig } from "./schemas.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const momaCasesPath = path.resolve(__dirname, "../../benchmarks/moma-test-cases.json");

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

  it("parses MoMA case file (sql positives, clarification, custom subtypes, metadata)", async () => {
    const raw = await readFile(momaCasesPath, "utf8");
    const parsed = parseBenchmarkCases(JSON.parse(raw));
    expect(parsed.length).toBeGreaterThan(0);
    const p01 = parsed.find((c) => c.id === "P01");
    expect(p01?.expectation.behavior).toBe("sql");
    const n10 = parsed.find((c) => c.id === "N10");
    expect(n10?.expectation.behavior).toBe("clarification");
    expect(p01?.entity).toBe("Artist");
    expect(n10?.mappedTable).toBeNull();
  });
});
