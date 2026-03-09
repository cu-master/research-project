import NodeSqlParser from "node-sql-parser";
const { Parser } = NodeSqlParser;

// Re-export shared utilities
export { createMcpResponse, formatApiError } from "../shared/utils.js";

// ============================================================================
// SQL Utilities
// ============================================================================

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

// ============================================================================
// NFR-02: SQL Security — AST-Based Validation
// ============================================================================
//
// The LLM output is treated as UNTRUSTED INPUT. We parse the SQL string into
// an Abstract Syntax Tree (AST) using node-sql-parser and then programmatically
// verify that the root node is strictly a SELECT statement.
// Any mutating command (INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE,
// GRANT, REVOKE) or any SQL that fails to parse is rejected before it ever
// reaches the database driver.

export interface SqlValidationResult {
  /** True only when the SQL is a single, valid SELECT statement. */
  valid: boolean;
  /** The AST statement type detected (e.g. 'select', 'insert', 'drop'). */
  statementType?: string;
  /** Human-readable rejection reason when valid === false. */
  reason?: string;
}

const _sqlParser = new Parser();

/**
 * Parses `sql` into an AST and verifies that the (first) statement is a
 * SELECT. Any other statement type, or a parse failure, returns valid=false.
 *
 * This is the NFR-02 enforcement point — it must be called before executing
 * any AI-generated SQL against the database driver.
 */
export function validateSelectOnlySql(sql: string): SqlValidationResult {
  let ast;

  try {
    // astify() throws on invalid SQL, so parse failures are automatically caught
    ast = _sqlParser.astify(sql, { database: "PostgresQL" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      valid: false,
      reason: `SQL failed to parse: ${msg}`,
    };
  }

  // astify() may return an array for multi-statement SQL (e.g. "SELECT 1; DROP TABLE ...")
  const statements = Array.isArray(ast) ? ast : [ast];

  // Reject multi-statement SQL outright — only a single statement is permitted
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
