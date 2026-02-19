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
// SQL Security
// ============================================================================

const DANGEROUS_SQL_PATTERNS = [
  /^\s*DROP\s+/i,
  /^\s*TRUNCATE\s+/i,
  /^\s*ALTER\s+/i,
  /^\s*CREATE\s+/i,
  /^\s*GRANT\s+/i,
  /^\s*REVOKE\s+/i,
  /;\s*(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\s+/i,
];

export function isDangerousSql(sql: string): boolean {
  for (const pattern of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(sql)) {
      return true;
    }
  }
  return false;
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
