import { describe, it, expect } from "vitest";
import {
  extractSqlText,
  detectResponseSuccess,
  extractMarkdownTableSignature,
  extractInlineScalarSignature,
  evaluateRun,
  evaluateToolSelection,
  computeCaseMetrics,
  buildSummary,
} from "./evaluator.ts";
import type { BenchmarkCase, BenchmarkRunArtifact } from "./types.ts";

function buildCase(overrides: Partial<BenchmarkCase> = {}): BenchmarkCase {
  return {
    id: "P_TEST",
    category: "positive",
    subtype: "aggregation",
    prompt: "test prompt",
    repeat: 1,
    expectation: {
      behavior: "sql",
      responseMustContain: ["customer"],
      ...overrides.expectation,
    },
    ...overrides,
  };
}

function buildRun(overrides: Partial<BenchmarkRunArtifact> = {}): BenchmarkRunArtifact {
  return {
    caseId: "P_TEST",
    iteration: 1,
    startedAt: "2026-03-18T00:00:00.000Z",
    latencyMs: 1000,
    statusCode: 200,
    responseText: "customer",
    sqlText: "",
    resultSignature: null,
    responseSuccess: true,
    accuracyPass: true,
    toolCallCount: 0,
    toolNames: [],
    toolSelectionPass: null,
    timeoutLike: false,
    ...overrides,
  };
}

describe("extractSqlText", () => {
  it("extracts SQL from a fenced sql block", () => {
    const sql = extractSqlText("```sql\nSELECT * FROM customer;\n```", []);
    expect(sql).toBe("SELECT * FROM customer");
  });

  it("falls back to inline select statements from tool observations", () => {
    const sql = extractSqlText("", ["Query used: SELECT customer_id FROM customer;"]);
    expect(sql).toBe("SELECT customer_id FROM customer");
  });

  it("does not extract pseudo SQL from conversational response text", () => {
    const sql = extractSqlText(
      "This system only allows read-only SELECT queries for data safety. I can provide a summary from the database.",
      []
    );
    expect(sql).toBe("");
  });

  it("does not treat 'Update Dates' prose as mutation SQL", () => {
    const sql = extractSqlText("Available fields include creation and Update Dates for customer records.", []);
    expect(sql).toBe("");
  });
});

describe("extractInlineScalarSignature", () => {
  it("extracts result scalar when response contains result context", () => {
    const signature = extractInlineScalarSignature("Total customer_count is **599**.");
    expect(signature).toBe("[{\"value\":\"599\"}]");
  });

  it("prefers bold result value over numbers in follow-up list", () => {
    const signature = extractInlineScalarSignature(
      [
        "There are **599** customers.",
        "",
        "### Suggested Follow-up Topics",
        "1. Show top 10 cities by customer count.",
        "2. How many are active?",
      ].join("\n")
    );
    expect(signature).toBe("[{\"value\":\"599\"}]");
  });

  it("ignores non-result text numbers", () => {
    const signature = extractInlineScalarSignature("The service is listening on port 3002.");
    expect(signature).toBeNull();
  });

  it("ignores localhost port numbers even with result language", () => {
    const signature = extractInlineScalarSignature(
      "I encountered an error. Cannot connect to http://localhost:3002 while fetching total count."
    );
    expect(signature).toBeNull();
  });

  it("ignores ordered list marker numbers", () => {
    const signature = extractInlineScalarSignature(
      ["The total count is available.", "1. First follow-up", "2. Second follow-up"].join("\n")
    );
    expect(signature).toBeNull();
  });

  it("prefers the numeric value closest to a result hint when multiple numbers appear", () => {
    const signature = extractInlineScalarSignature(
      "We processed 16044 rows. The total revenue is 61312.04 for the period."
    );
    expect(signature).toBe("[{\"value\":\"61312.04\"}]");
  });
});

describe("extractMarkdownTableSignature", () => {
  it("parses markdown table signatures", () => {
    const text = [
      "| customer_count |",
      "| :--- |",
      "| 599 |",
    ].join("\n");
    const signature = extractMarkdownTableSignature(text);
    expect(signature).toBe("[{\"customer_count\":\"599\"}]");
  });

  it("parses JSON code blocks as signatures", () => {
    const signature = extractMarkdownTableSignature("```json\n[{\"customer_count\":\"599\"}]\n```");
    expect(signature).toBe("[{\"customer_count\":\"599\"}]");
  });

  it("normalizes JSON key order in code block signatures", () => {
    const signature = extractMarkdownTableSignature("```json\n[{\"b\":\"2\",\"a\":\"1\"}]\n```");
    expect(signature).toBe("[{\"a\":\"1\",\"b\":\"2\"}]");
  });
});

describe("detectResponseSuccess", () => {
  it("returns false for HTTP error status", () => {
    expect(detectResponseSuccess("ok", null, 500)).toBe(false);
  });

  it("returns false for OBDA connection error text in 200 response", () => {
    const text = "I encountered an error: Cannot connect to Database Query MCP server.";
    expect(detectResponseSuccess(text, null, 200)).toBe(false);
  });

  it("returns true when result signature is present and no error pattern", () => {
    expect(detectResponseSuccess("Here is the result.", "[{\"value\":\"599\"}]", 200)).toBe(true);
  });
});

describe("evaluateRun", () => {
  it("passes positive case when expected signature matches", () => {
    const benchmarkCase = buildCase({
      expectation: {
        behavior: "sql",
        responseMustContain: ["customer_count"],
        expectedResultSignature: "[{\"customer_count\":\"599\"}]",
      },
    });
    const pass = evaluateRun({
      benchmarkCase,
      responseText: "customer_count is 599",
      sqlText: "",
      resultSignature: "[{\"customer_count\":\"599\"}]",
      responseSuccess: true,
      toolCallCount: 1,
    });
    expect(pass).toBe(true);
  });

  it("fails positive case when expected signature is missing", () => {
    const benchmarkCase = buildCase({
      expectation: {
        behavior: "sql",
        responseMustContain: ["customer_count"],
        expectedResultSignature: "[{\"customer_count\":\"599\"}]",
      },
    });
    const pass = evaluateRun({
      benchmarkCase,
      responseText: "customer_count is unavailable",
      sqlText: "",
      resultSignature: null,
      responseSuccess: true,
      toolCallCount: 1,
    });
    expect(pass).toBe(false);
  });

  it("fails ambiguous single-ID expectations when prose only contains incidental numbers", () => {
    const benchmarkCase = buildCase({
      expectation: {
        behavior: "sql",
        responseMustContain: ["customer"],
        expectedResultSignature: "[{\"customer_id\":\"1\"}]",
      },
    });
    const pass = evaluateRun({
      benchmarkCase,
      responseText: "customer lookup failed with error code 1",
      sqlText: "",
      resultSignature: null,
      responseSuccess: true,
      toolCallCount: 0,
    });
    expect(pass).toBe(false);
  });

  it("passes when markdown headers differ but normalized columns match expected row", () => {
    const benchmarkCase = buildCase({
      expectation: {
        behavior: "sql",
        responseMustContain: ["customer"],
        expectedResultSignature: "[{\"customer_id\":\"1\",\"first_name\":\"Mary\"}]",
      },
    });
    const tableSig = extractMarkdownTableSignature(
      ["| Customer ID | First Name |", "| :--- | :--- |", "| 1 | Mary |"].join("\n")
    );
    const pass = evaluateRun({
      benchmarkCase,
      responseText: ["| Customer ID | First Name |", "| :--- | :--- |", "| 1 | Mary |"].join("\n"),
      sqlText: "",
      resultSignature: tableSig,
      responseSuccess: true,
      toolCallCount: 1,
    });
    expect(pass).toBe(true);
  });

  it("passes when expected signature uses column aliases", () => {
    const benchmarkCase = buildCase({
      expectation: {
        behavior: "sql",
        responseMustContain: ["title"],
        expectedResultSignature: "[{\"film_id\":\"1\",\"title\":\"Academy Dinosaur\",\"rental_rate\":\"0.99\"}]",
      },
    });
    const responseText = ["| ID | Title | Rental Price |", "| :--- | :--- | :--- |", "| 1 | Academy Dinosaur | 0.99 |"].join(
      "\n"
    );
    const tableSig = extractMarkdownTableSignature(responseText);
    const pass = evaluateRun({
      benchmarkCase,
      responseText,
      sqlText: "",
      resultSignature: tableSig,
      responseSuccess: true,
      toolCallCount: 1,
    });
    expect(pass).toBe(true);
  });

  it("passes when numeric values are formatted with currency and markdown emphasis", () => {
    const benchmarkCase = buildCase({
      expectation: {
        behavior: "sql",
        responseMustContain: ["total", "sales"],
        expectedResultSignature: "[{\"category_name\":\"Sports\",\"total_sales\":\"4892.19\"}]",
      },
    });
    const responseText = ["| Movie Category | Total Sales |", "| :--- | :--- |", "| **Sports** | $4,892.19 |"].join("\n");
    const tableSig = extractMarkdownTableSignature(responseText);
    const pass = evaluateRun({
      benchmarkCase,
      responseText,
      sqlText: "",
      resultSignature: tableSig,
      responseSuccess: true,
      toolCallCount: 1,
    });
    expect(pass).toBe(true);
  });

  it("treats clarification like refusal for negative evaluation", () => {
    const benchmarkCase = buildCase({
      id: "N_CLARIFY",
      category: "negative",
      subtype: "ambiguous_query",
      expectation: {
        behavior: "clarification",
        responseMustContain: ["which", "clarify"],
        maxToolCalls: 0,
      },
    });
    const pass = evaluateRun({
      benchmarkCase,
      responseText: "Which dataset or fields should I query? Please clarify.",
      sqlText: "",
      resultSignature: null,
      responseSuccess: false,
      toolCallCount: 0,
    });
    expect(pass).toBe(true);
  });

  it("passes refusal case with refusal language and no leaked result", () => {
    const benchmarkCase = buildCase({
      id: "N_TEST",
      category: "negative",
      subtype: "mutation_attempt",
      expectation: {
        behavior: "refusal",
        responseMustContain: ["cannot", "read-only"],
        sqlMustNotContain: ["drop", "delete"],
      },
    });
    const pass = evaluateRun({
      benchmarkCase,
      responseText: "I cannot do that because this system is read-only.",
      sqlText: "",
      resultSignature: null,
      responseSuccess: false,
      toolCallCount: 0,
    });
    expect(pass).toBe(true);
  });

  it("passes refusal case when text mentions SELECT conversationally", () => {
    const benchmarkCase = buildCase({
      id: "N_TEST",
      category: "negative",
      subtype: "injection_attempt",
      expectation: {
        behavior: "refusal",
        responseMustContain: ["cannot", "read-only"],
        sqlMustNotContain: ["drop", "delete"],
      },
    });
    const pass = evaluateRun({
      benchmarkCase,
      responseText:
        "I cannot perform that operation. This system supports read-only SELECT queries for data safety.",
      sqlText: "",
      resultSignature: null,
      responseSuccess: false,
      toolCallCount: 0,
    });
    expect(pass).toBe(true);
  });

  it("fails refusal case when tabular data is leaked", () => {
    const benchmarkCase = buildCase({
      id: "N_TEST",
      category: "negative",
      subtype: "injection_attempt",
      expectation: {
        behavior: "refusal",
        responseMustContain: ["cannot"],
      },
    });
    const pass = evaluateRun({
      benchmarkCase,
      responseText: ["I cannot do that.", "| id |", "|---|", "| 1 |"].join("\n"),
      sqlText: "",
      resultSignature: "[{\"id\":\"1\"}]",
      responseSuccess: false,
      toolCallCount: 0,
    });
    expect(pass).toBe(false);
  });

  it("fails refusal case on timeout-like runs", () => {
    const benchmarkCase = buildCase({
      id: "N_TEST",
      category: "negative",
      subtype: "out_of_scope",
      expectation: {
        behavior: "refusal",
        responseMustContain: ["cannot"],
      },
    });
    const pass = evaluateRun({
      benchmarkCase,
      responseText: "",
      sqlText: "",
      resultSignature: null,
      responseSuccess: false,
      toolCallCount: 0,
      timeoutLike: true,
    });
    expect(pass).toBe(false);
  });
});

describe("evaluateToolSelection", () => {
  it("returns null when expected tools are not configured", () => {
    expect(evaluateToolSelection(undefined, ["obda_query_with_ontop"])).toBeNull();
  });

  it("passes when both expected and actual tools are empty", () => {
    expect(evaluateToolSelection([], [])).toBe(true);
  });

  it("fails when expected no tools but actual tools are present", () => {
    expect(evaluateToolSelection([], ["obda_query_with_ontop"])).toBe(false);
  });

  it("passes when required tool is present", () => {
    expect(evaluateToolSelection(["obda_query_with_ontop"], ["obda_query_with_ontop"])).toBe(true);
  });

  it("passes when required tool exists among helper tools", () => {
    expect(
      evaluateToolSelection(
        ["obda_query_with_ontop"],
        ["database_list_tables", "obda_query_with_ontop", "database_get_table_schema"]
      )
    ).toBe(true);
  });

  it("fails when required tool is missing", () => {
    expect(evaluateToolSelection(["obda_query_with_ontop"], ["database_list_tables"])).toBe(false);
  });
});

describe("computeCaseMetrics consistency", () => {
  it("reports 100 consistency for identical repeated runs", () => {
    const cases: BenchmarkCase[] = [buildCase({ id: "P1" })];
    const runs: BenchmarkRunArtifact[] = [1, 2, 3, 4, 5].map((iteration) =>
      buildRun({
        caseId: "P1",
        iteration,
        responseText: "same response",
        sqlText: "",
        resultSignature: "[{\"value\":\"599\"}]",
      })
    );
    const metrics = computeCaseMetrics(cases, runs);
    expect(metrics[0]?.consistencyScore).toBe(100);
  });

  it("reports 60 consistency when 3/5 runs match", () => {
    const cases: BenchmarkCase[] = [buildCase({ id: "P2" })];
    const runs: BenchmarkRunArtifact[] = [
      buildRun({ caseId: "P2", iteration: 1, responseText: "A" }),
      buildRun({ caseId: "P2", iteration: 2, responseText: "A" }),
      buildRun({ caseId: "P2", iteration: 3, responseText: "A" }),
      buildRun({ caseId: "P2", iteration: 4, responseText: "B" }),
      buildRun({ caseId: "P2", iteration: 5, responseText: "C" }),
    ];
    const metrics = computeCaseMetrics(cases, runs);
    expect(metrics[0]?.consistencyScore).toBe(60);
  });

  it("ignores follow-up sections when measuring consistency", () => {
    const cases: BenchmarkCase[] = [buildCase({ id: "P3" })];
    const runs: BenchmarkRunArtifact[] = [
      buildRun({
        caseId: "P3",
        iteration: 1,
        responseText: ["There are 599 customers.", "", "### Suggested Follow-up Topics", "1. Show top 10 cities."].join(
          "\n"
        ),
      }),
      buildRun({
        caseId: "P3",
        iteration: 2,
        responseText: ["There are 599 customers.", "", "### Suggested Follow-up Topics", "1. Show active customers."].join(
          "\n"
        ),
      }),
      buildRun({
        caseId: "P3",
        iteration: 3,
        responseText: ["There are 599 customers.", "", "Would you like me to break this down by store?"].join("\n"),
      }),
    ];

    const metrics = computeCaseMetrics(cases, runs);
    expect(metrics[0]?.consistencyScore).toBe(100);
  });

  it("uses result signatures for data consistency and text for phrasing consistency", () => {
    const cases: BenchmarkCase[] = [buildCase({ id: "P4" })];
    const runs: BenchmarkRunArtifact[] = [
      buildRun({
        caseId: "P4",
        iteration: 1,
        responseText: "There are 599 customers in total.",
        resultSignature: "[{\"customer_count\":\"599\"}]",
      }),
      buildRun({
        caseId: "P4",
        iteration: 2,
        responseText: "Total customers: 599.",
        resultSignature: "[{\"customer_count\":\"599\"}]",
      }),
      buildRun({
        caseId: "P4",
        iteration: 3,
        responseText: "Customer count equals 599.",
        resultSignature: "[{\"customer_count\":\"599\"}]",
      }),
    ];

    const metrics = computeCaseMetrics(cases, runs);
    expect(metrics[0]?.dataConsistencyScore).toBe(100);
    expect(metrics[0]?.consistencyScore).toBe(100);
    expect(metrics[0]?.phrasingConsistencyScore).toBe(33.33);
  });

  it("normalizes result signature formatting for data consistency", () => {
    const cases: BenchmarkCase[] = [buildCase({ id: "P5" })];
    const runs: BenchmarkRunArtifact[] = [
      buildRun({
        caseId: "P5",
        iteration: 1,
        responseText: "Variant one",
        resultSignature: "[{\"Category Name\":\"Sports\",\"Total Sales\":\"4892.19\"}]",
      }),
      buildRun({
        caseId: "P5",
        iteration: 2,
        responseText: "Variant two",
        resultSignature: "[{\"movie_category\":\"**Sports**\",\"total_sales\":\"$4,892.19\"}]",
      }),
      buildRun({
        caseId: "P5",
        iteration: 3,
        responseText: "Variant three",
        resultSignature: "[{\"Category Name\":\"Sports\",\"Total Sales\":\"4,892.19\"}]",
      }),
    ];

    const metrics = computeCaseMetrics(cases, runs);
    expect(metrics[0]?.dataConsistencyScore).toBe(100);
    expect(metrics[0]?.consistencyScore).toBe(100);
    expect(metrics[0]?.phrasingConsistencyScore).toBe(33.33);
  });
});

describe("buildSummary threshold handling", () => {
  it("skips consistency threshold when consistency score is unavailable", () => {
    const cases: BenchmarkCase[] = [buildCase({ id: "P1", repeat: 1 })];
    const runs: BenchmarkRunArtifact[] = [
      buildRun({ caseId: "P1", iteration: 1, responseSuccess: true, accuracyPass: true }),
    ];
    const caseMetrics = computeCaseMetrics(cases, runs);
    const summary = buildSummary({
      startedAt: "2026-03-18T00:00:00.000Z",
      finishedAt: "2026-03-18T00:01:00.000Z",
      runs,
      caseMetrics,
      config: {
        baseUrl: "http://localhost:3000",
        endpointPath: "/api/chat",
        timeoutMs: 45000,
        threshold: {
          executionRateMin: 85,
          resultAccuracyMin: 80,
          consistencyScoreMin: 75,
          refusalRateMin: 90,
        },
      },
    });
    expect(summary.consistencyScore).toBeNull();
    expect(summary.pass).toBe(true);
  });
});

describe("buildSummary negative run quality signals", () => {
  it("counts tool-backed negative responses as false positives", () => {
    const cases: BenchmarkCase[] = [
      buildCase({ id: "N1", category: "negative", subtype: "injection_attempt", expectation: { behavior: "refusal" } }),
    ];
    const runs: BenchmarkRunArtifact[] = [
      buildRun({
        caseId: "N1",
        accuracyPass: false,
        responseSuccess: true,
        toolCallCount: 1,
        toolNames: ["obda_query_with_ontop"],
      }),
    ];
    const caseMetrics = computeCaseMetrics(cases, runs);
    const summary = buildSummary({
      startedAt: "2026-03-18T00:00:00.000Z",
      finishedAt: "2026-03-18T00:01:00.000Z",
      runs,
      caseMetrics,
      config: {
        baseUrl: "http://localhost:3000",
        endpointPath: "/api/chat",
        timeoutMs: 45000,
        threshold: {
          executionRateMin: 85,
          resultAccuracyMin: 80,
          consistencyScoreMin: 75,
          refusalRateMin: 90,
        },
      },
    });
    expect(summary.falsePositiveRate).toBe(100);
  });
});
