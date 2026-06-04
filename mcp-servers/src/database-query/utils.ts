import NodeSqlParser from "node-sql-parser";
const { Parser } = NodeSqlParser;

export { createMcpResponse, formatApiError } from "../shared/utils.js";

function cleanSql(sql: string): string {
  return sql
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/;+\s*$/, "")
    .trim();
}

export function extractSqlFromResponse(response: string): string {
  let sql: string;

  const sqlBlockMatch = response.match(/```sql\s*([\s\S]*?)\s*```/i);
  if (sqlBlockMatch) {
    sql = sqlBlockMatch[1];
  } else {
    const codeBlockMatch = response.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      sql = codeBlockMatch[1];
    } else {
      const sqlMatch = response.match(
        /(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\s+[\s\S]+?(?:;|$)/i
      );
      if (sqlMatch) {
        sql = sqlMatch[0];
      } else {
        sql = response;
      }
    }
  }

  return cleanSql(sql);
}

// Parses SQL into an AST and rejects anything that isn't a single SELECT statement.
// NOTE: not on the live query path — production queries go through SPARQL/Ontop (see obda-handler.ts),
// and write protection is enforced at the DB level by the read-only role (NFR-01). This is retained,
// with utils.test.ts, as the NFR-02 SELECT-only AST guard (defense-in-depth for any direct-SQL path).

export interface SqlValidationResult {
  valid: boolean;
  statementType?: string;
  reason?: string;
}

const _sqlParser = new Parser();

export function validateSelectOnlySql(sql: string): SqlValidationResult {
  let ast;

  try {
    ast = _sqlParser.astify(sql, { database: "PostgresQL" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      reason: `SQL failed to parse: ${msg}`,
    };
  }

  // astify() returns an array for multi-statement SQL (e.g. "SELECT 1; DROP TABLE ...").
  const statements = Array.isArray(ast) ? ast : [ast];

  if (statements.length > 1) {
    const types = statements.map((s) => s?.type ?? "unknown").join(", ");
    return {
      valid: false,
      statementType: types,
      reason: `Multiple SQL statements detected (${types}). Only a single SELECT is permitted.`,
    };
  }

  const statementType: string = statements[0]?.type ?? "unknown";

  if (statementType !== "select") {
    return {
      valid: false,
      statementType,
      reason: `SQL statement type '${statementType.toUpperCase()}' is not permitted. Only SELECT queries are allowed.`,
    };
  }

  return { valid: true, statementType: "select" };
}


export function prepareSqlForExecution(sql: string, limit: number): string {
  let finalSql = sql
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/;+\s*$/, "")
    .trim();

  const upperSql = finalSql.toUpperCase();
  if (upperSql.startsWith("SELECT") && !upperSql.includes("LIMIT")) {
    finalSql += ` LIMIT ${limit}`;
  }

  return finalSql;
}
