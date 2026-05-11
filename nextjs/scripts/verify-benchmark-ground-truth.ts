/**
 * Ground-truth verification: runs each positive case's `groundTruth.sql` against
 * the live Postgres database and confirms the result matches the case's
 * `expectedResultSignature`. Catches drift between the benchmark expectations and
 * actual seed data — without this, expected values can silently rot.
 *
 * Usage:
 *   npm run benchmark:verify-ground-truth
 *   npm run benchmark:verify-ground-truth -- --cases benchmarks/dvd-rental-test-cases.json
 *
 * Connection: uses BENCHMARK_PG_HOST / BENCHMARK_PG_PORT / BENCHMARK_PG_USER /
 * BENCHMARK_PG_PASSWORD env vars (or PG* defaults). Database name comes from each
 * case's `groundTruth.database` field.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  matchesExpectedSignature,
  matchesOrderedSignature,
} from "../lib/benchmarking/evaluator.ts";
import { parseBenchmarkCases } from "../lib/benchmarking/schemas.ts";
import type { BenchmarkCase } from "../lib/benchmarking/types.ts";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

interface CliOptions {
  casesPaths: string[];
  caseId?: string;
  strict: boolean;
}

interface VerificationResult {
  caseId: string;
  database: string;
  status: "pass" | "fail" | "skipped" | "error";
  message?: string;
}

async function main(): Promise<void> {
  await loadDotEnvFromProjectRoot();
  const options = parseCli(process.argv.slice(2));
  const casesPaths = options.casesPaths.length > 0 ? options.casesPaths : await defaultCasesPaths();

  const allCases: BenchmarkCase[] = [];
  for (const casesPath of casesPaths) {
    const cases = await loadCases(casesPath);
    allCases.push(...cases);
  }

  const filtered = options.caseId
    ? allCases.filter((benchmarkCase) => benchmarkCase.id === options.caseId)
    : allCases;

  const positiveCases = filtered.filter((benchmarkCase) => benchmarkCase.category === "positive");
  if (positiveCases.length === 0) {
    process.stderr.write("No positive cases to verify.\n");
    process.exit(0);
  }

  // Group by database so we open one connection per DB.
  const grouped = new Map<string, BenchmarkCase[]>();
  for (const benchmarkCase of positiveCases) {
    const db = benchmarkCase.groundTruth?.database;
    if (!db) continue;
    const list = grouped.get(db) ?? [];
    list.push(benchmarkCase);
    grouped.set(db, list);
  }

  const results: VerificationResult[] = [];
  for (const benchmarkCase of positiveCases) {
    if (!benchmarkCase.groundTruth) {
      results.push({
        caseId: benchmarkCase.id,
        database: "-",
        status: "skipped",
        message: "no groundTruth.sql defined",
      });
    }
  }

  for (const [database, cases] of grouped.entries()) {
    const client = new Client(buildPgConfig(database));
    try {
      await client.connect();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const benchmarkCase of cases) {
        results.push({
          caseId: benchmarkCase.id,
          database,
          status: "error",
          message: `connect failed: ${message}`,
        });
      }
      continue;
    }

    try {
      for (const benchmarkCase of cases) {
        const result = await verifyCase(client, benchmarkCase);
        results.push(result);
      }
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  printReport(results);

  const failed = results.filter((result) => result.status === "fail" || result.status === "error");
  if (failed.length > 0 && options.strict) {
    process.exitCode = 1;
  }
}

async function verifyCase(client: pg.Client, benchmarkCase: BenchmarkCase): Promise<VerificationResult> {
  const groundTruth = benchmarkCase.groundTruth;
  if (!groundTruth) {
    return {
      caseId: benchmarkCase.id,
      database: "-",
      status: "skipped",
      message: "no groundTruth.sql defined",
    };
  }
  if (!isReadOnlySql(groundTruth.sql)) {
    return {
      caseId: benchmarkCase.id,
      database: groundTruth.database,
      status: "error",
      message: "groundTruth.sql contains a non-SELECT statement; refused for safety",
    };
  }

  let queryResult: pg.QueryResult;
  try {
    queryResult = await client.query(groundTruth.sql);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      caseId: benchmarkCase.id,
      database: groundTruth.database,
      status: "error",
      message: `query failed: ${message}`,
    };
  }

  const rows = queryResult.rows.map((row) => stringifyRow(row));
  const sortedSignature = JSON.stringify(rows.map(sortRecord).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const orderedSignature = JSON.stringify(rows.map(sortRecord));

  const expected = benchmarkCase.expectation.expectedResultSignature;
  if (!expected) {
    return {
      caseId: benchmarkCase.id,
      database: groundTruth.database,
      status: "skipped",
      message: "no expectedResultSignature defined",
    };
  }

  const sigPass = matchesExpectedSignature(expected, sortedSignature);
  if (!sigPass) {
    return {
      caseId: benchmarkCase.id,
      database: groundTruth.database,
      status: "fail",
      message: `expected signature not covered by SQL result.\n  expected: ${expected}\n  actual (first row): ${JSON.stringify(rows[0] ?? null)}\n  row count: ${rows.length}`,
    };
  }

  if (benchmarkCase.expectation.orderingMatters) {
    const orderPass = matchesOrderedSignature(expected, orderedSignature);
    if (!orderPass) {
      return {
        caseId: benchmarkCase.id,
        database: groundTruth.database,
        status: "fail",
        message: `ordering mismatch — expected rows do not appear at start of SQL result.\n  expected (first ${parseLength(expected)}): ${expected}\n  actual (first ${Math.min(parseLength(expected), rows.length)}): ${JSON.stringify(rows.slice(0, parseLength(expected)))}`,
      };
    }
  }

  if (benchmarkCase.expectation.expectedRowCount !== undefined) {
    if (rows.length !== benchmarkCase.expectation.expectedRowCount) {
      return {
        caseId: benchmarkCase.id,
        database: groundTruth.database,
        status: "fail",
        message: `row count mismatch — expectedRowCount=${benchmarkCase.expectation.expectedRowCount}, SQL returned ${rows.length}`,
      };
    }
  }
  if (benchmarkCase.expectation.maxRowCount !== undefined) {
    if (rows.length > benchmarkCase.expectation.maxRowCount) {
      return {
        caseId: benchmarkCase.id,
        database: groundTruth.database,
        status: "fail",
        message: `row count exceeds maxRowCount — maxRowCount=${benchmarkCase.expectation.maxRowCount}, SQL returned ${rows.length}`,
      };
    }
  }

  return {
    caseId: benchmarkCase.id,
    database: groundTruth.database,
    status: "pass",
    message: `${rows.length} row${rows.length === 1 ? "" : "s"}`,
  };
}

function parseLength(jsonText: string): number {
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.length : 1;
  } catch {
    return 1;
  }
}

function isReadOnlySql(sql: string): boolean {
  // Strip line/block comments before classification so a leading comment doesn't fool us.
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .trim()
    .toUpperCase();
  if (!stripped) return false;
  if (!/^(SELECT|WITH)\b/.test(stripped)) return false;
  return !/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE|REPLACE)\b/.test(stripped);
}

function stringifyRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      out[key] = "";
    } else if (typeof value === "object") {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

function sortRecord(row: Record<string, string>): Record<string, string> {
  const entries = Object.entries(row).sort(([a], [b]) => a.localeCompare(b));
  return Object.fromEntries(entries);
}

function buildPgConfig(database: string): pg.ClientConfig {
  return {
    host: process.env.BENCHMARK_PG_HOST ?? process.env.PGHOST ?? "localhost",
    port: Number(process.env.BENCHMARK_PG_PORT ?? process.env.PGPORT ?? 5432),
    user: process.env.BENCHMARK_PG_USER ?? process.env.PGUSER ?? process.env.USER ?? "postgres",
    password: process.env.BENCHMARK_PG_PASSWORD ?? process.env.PGPASSWORD ?? undefined,
    database,
    statement_timeout: 30_000,
  };
}

function parseCli(argv: string[]): CliOptions {
  const options: CliOptions = { casesPaths: [], strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cases") {
      const value = argv[index + 1];
      if (value) options.casesPaths.push(value);
    }
    if (arg === "--case-id") options.caseId = argv[index + 1];
    if (arg === "--strict") options.strict = true;
  }
  return options;
}

async function defaultCasesPaths(): Promise<string[]> {
  const dir = path.join(projectRoot, "benchmarks");
  const entries = await readdir(dir);
  return entries
    .filter((name) => name.endsWith("-test-cases.json"))
    .map((name) => path.join(dir, name))
    .sort();
}

async function loadCases(casesPath: string): Promise<BenchmarkCase[]> {
  const raw = await readFile(casesPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${casesPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseBenchmarkCases(parsed) as BenchmarkCase[];
}

function printReport(results: VerificationResult[]): void {
  const counts = { pass: 0, fail: 0, error: 0, skipped: 0 };
  for (const result of results) counts[result.status] += 1;

  const lines: string[] = [];
  lines.push("# Ground-Truth Verification");
  lines.push("");
  lines.push(`- Total cases: ${results.length}`);
  lines.push(`- Pass: ${counts.pass}`);
  lines.push(`- Fail: ${counts.fail}`);
  lines.push(`- Error: ${counts.error}`);
  lines.push(`- Skipped: ${counts.skipped}`);
  lines.push("");
  lines.push("| Case | DB | Status | Notes |");
  lines.push("|---|---|---|---|");
  for (const result of results) {
    const note = (result.message ?? "").replace(/\n/g, " ");
    lines.push(`| ${result.caseId} | ${result.database} | ${result.status.toUpperCase()} | ${note} |`);
  }
  process.stdout.write(lines.join("\n") + "\n");
}

async function loadDotEnvFromProjectRoot(): Promise<void> {
  for (const file of [".env", ".env.benchmark"]) {
    const envPath = path.join(projectRoot, file);
    let raw: string;
    try {
      raw = await readFile(envPath, "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const noExport = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
      const eq = noExport.indexOf("=");
      if (eq <= 0) continue;
      const key = noExport.slice(0, eq).trim();
      let value = noExport.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

main().catch((error) => {
  process.stderr.write(`Verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
