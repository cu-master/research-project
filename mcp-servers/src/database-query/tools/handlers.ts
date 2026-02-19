import type { McpResponse } from "../../shared/types.js";
import { dbManager } from "../manager.js";
import { callAI } from "../ai/index.js";
import {
  createMcpResponse,
  extractSqlFromResponse,
  formatApiError,
  isDangerousSql,
  prepareSqlForExecution,
} from "../utils.js";
import {
  executeQuerySchema,
  getSampleQueriesSchema,
  getTableSchemaSchema,
  generateSqlSchema,
  listTablesSchema,
} from "./schemas.js";

// ============================================================================
// SQL Generation Handlers
// ============================================================================

async function generateSqlInternal(params: {
  query: string;
  databaseId?: string;
  additionalContext?: string;
}): Promise<McpResponse> {
  const adapter = dbManager.getAdapter(params.databaseId);
  const connection = dbManager.getConnection(params.databaseId);
  const schemaContext = await adapter.buildSchemaContext();

  const prompt = `You are an expert SQL generator for ${
    connection.config.type === "supabase" ? "PostgreSQL (Supabase)" : "PostgreSQL"
  }. Convert the following natural language query to a valid SQL query.

${schemaContext}

${params.additionalContext ? `Additional Context: ${params.additionalContext}\n\n` : ""}

Natural Language Query: "${params.query}"

Requirements:
1. Generate ONLY valid PostgreSQL SQL
2. Use proper table and column names from the schema
3. Include appropriate JOINs when referencing related tables
4. Use parameterized placeholders ($1, $2, etc.) for user-provided values when appropriate
5. Add LIMIT clause for SELECT queries if not specified (default 100)
6. Use proper escaping and quoting for identifiers if needed

Return ONLY the SQL query wrapped in a sql code block. Do not include any explanation.

\`\`\`sql
YOUR_SQL_HERE
\`\`\``;

  const response = await callAI(prompt, 1000);
  const sql = extractSqlFromResponse(response);

  return createMcpResponse(
    `# SQL Generation\n\n**Database:** ${connection.name} (${connection.id})\n\n**Natural Language:** ${params.query}\n\n**Generated SQL:**\n\`\`\`sql\n${sql}\n\`\`\`\n\n*Note: Review the query before execution. Use the execute-query tool to run it.*`
  );
}

export async function handleGenerateSql(args: Record<string, unknown>): Promise<McpResponse> {
  try {
    const { query, databaseId } = generateSqlSchema.parse(args);
    return await generateSqlInternal({ query, databaseId });
  } catch (error) {
    return createMcpResponse(`Error generating SQL: ${formatApiError(error)}`, true);
  }
}

// ============================================================================
// Table Handlers
// ============================================================================

export async function handleListTables(args: Record<string, unknown>): Promise<McpResponse> {
  try {
    const { includeViews = true, schemaName = "public", databaseId } = listTablesSchema.parse(args);

    const connection = dbManager.getConnection(databaseId);
    
    // Check if database is connected
    if (!connection.adapter.isConnected()) {
      return createMcpResponse(
        `# Database Not Connected\n\n` +
        `**Database:** ${connection.name} (${connection.id})\n\n` +
        `The database is registered but not currently connected. ` +
        `Please ensure the database server is running and accessible.`,
        true
      );
    }

    const adapter = dbManager.getAdapter(databaseId);
    const tables = await adapter.listTables(schemaName, includeViews);

    let output = `# Database Tables\n\n`;
    output += `**Database:** ${connection.name} (${connection.id})\n`;
    output += `**Schema:** ${schemaName}\n\n`;
    output += `| Table Name | Type |\n`;
    output += `|------------|------|\n`;

    for (const table of tables) {
      output += `| ${table.table_name} | ${table.table_type} |\n`;
    }

    output += `\n**Total: ${tables.length} table(s)**`;
    return createMcpResponse(output);
  } catch (error) {
    return createMcpResponse(`Error listing tables: ${formatApiError(error)}`, true);
  }
}

export async function handleGetTableSchema(args: Record<string, unknown>): Promise<McpResponse> {
  try {
    const {
      tableName,
      includeConstraints = true,
      includeForeignKeys = true,
      databaseId,
    } = getTableSchemaSchema.parse(args);

    const adapter = dbManager.getAdapter(databaseId);
    const connection = dbManager.getConnection(databaseId);
    const columns = await adapter.getTableColumns(tableName);

    if (columns.length === 0) {
      return createMcpResponse(`Table "${tableName}" not found or has no columns.`, true);
    }

    let output = `# Table Schema: ${tableName}\n\n`;
    output += `**Database:** ${connection.name} (${connection.id})\n\n`;
    output += `## Columns\n\n`;
    output += `| Column | Type | Nullable | Default |\n`;
    output += `|--------|------|----------|--------|\n`;

    for (const col of columns) {
      const nullable = col.is_nullable === "YES" ? "Yes" : "No";
      const defaultVal = col.column_default || "-";
      let typeStr = col.data_type;
      if (col.character_maximum_length) {
        typeStr += `(${col.character_maximum_length})`;
      }
      output += `| ${col.column_name} | ${typeStr} | ${nullable} | ${defaultVal} |\n`;
    }

    if (includeConstraints) {
      const constraints = await adapter.getTableConstraints(tableName);
      if (constraints.length > 0) {
        output += `\n## Constraints\n\n`;
        output += `| Constraint | Type | Column |\n`;
        output += `|------------|------|--------|\n`;
        for (const con of constraints) {
          output += `| ${con.constraint_name} | ${con.constraint_type} | ${con.column_name} |\n`;
        }
      }
    }

    if (includeForeignKeys) {
      const fks = await adapter.getTableForeignKeys(tableName);
      if (fks.length > 0) {
        output += `\n## Foreign Keys\n\n`;
        output += `| Column | References |\n`;
        output += `|--------|------------|\n`;
        for (const fk of fks) {
          output += `| ${fk.column_name} | ${fk.foreign_table_name}.${fk.foreign_column_name} |\n`;
        }
      }
    }

    return createMcpResponse(output);
  } catch (error) {
    return createMcpResponse(`Error getting table schema: ${formatApiError(error)}`, true);
  }
}

// ============================================================================
// Query Execution Handler
// ============================================================================

export async function handleExecuteQuery(args: Record<string, unknown>): Promise<McpResponse> {
  try {
    const { sql, limit = 100, explain = false, databaseId } = executeQuerySchema.parse(args);

    const adapter = dbManager.getAdapter(databaseId);
    const connection = dbManager.getConnection(databaseId);

    // Security check
    if (isDangerousSql(sql)) {
      return createMcpResponse(
        "⚠️ Potentially dangerous SQL operation detected. DROP, TRUNCATE, ALTER, CREATE, GRANT, and REVOKE operations are not allowed.",
        true
      );
    }

    let finalSql = prepareSqlForExecution(sql, limit);

    if (explain) {
      finalSql = `EXPLAIN ANALYZE ${finalSql}`;
    }

    const result = await adapter.executeQuery(finalSql);

    if (result.error) {
      return createMcpResponse(
        `# Query Execution Error\n\n**Database:** ${connection.name}\n\n**SQL:**\n\`\`\`sql\n${finalSql}\n\`\`\`\n\n**Error:**\n${result.error}`,
        true
      );
    }

    if (result.rows.length === 0) {
      return createMcpResponse(
        `# Query Results\n\n**Database:** ${connection.name}\n\n**SQL:**\n\`\`\`sql\n${finalSql}\n\`\`\`\n\n*No results returned.*`
      );
    }

    const columns = Object.keys(result.rows[0]);
    let output = `# Query Results\n\n`;
    output += `**Database:** ${connection.name} (${connection.id})\n\n`;
    output += `**SQL:**\n\`\`\`sql\n${finalSql}\n\`\`\`\n\n`;
    output += `**Rows returned:** ${result.rows.length}${result.rows.length >= limit ? ` (limited to ${limit})` : ""}\n\n`;

    output += `| ${columns.join(" | ")} |\n`;
    output += `| ${columns.map(() => "---").join(" | ")} |\n`;

    for (const row of result.rows) {
      const values = columns.map((col) => {
        const val = row[col];
        if (val === null) return "NULL";
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      });
      output += `| ${values.join(" | ")} |\n`;
    }

    return createMcpResponse(output);
  } catch (error) {
    return createMcpResponse(`Error executing query: ${formatApiError(error)}`, true);
  }
}

// ============================================================================
// Sample Queries Handler
// ============================================================================

export async function handleGetSampleQueries(args: Record<string, unknown>): Promise<McpResponse> {
  try {
    const { tableName, queryType = "all", databaseId } = getSampleQueriesSchema.parse(args);

    const adapter = dbManager.getAdapter(databaseId);
    const connection = dbManager.getConnection(databaseId);
    const schemaContext = await adapter.buildSchemaContext();

    const typeInstruction =
      queryType === "all"
        ? "Include examples of SELECT, INSERT, UPDATE, DELETE, aggregate functions, and JOIN queries."
        : `Focus on ${queryType.toUpperCase()} queries.`;

    const tableInstruction = tableName
      ? `Generate sample queries specifically for the "${tableName}" table and its related tables.`
      : "Generate sample queries for the most important tables in the schema.";

    const prompt = `You are a SQL expert. Generate practical sample queries based on the following database schema.

${schemaContext}

${tableInstruction}
${typeInstruction}

For each query, provide:
1. A natural language description of what the query does
2. The SQL query

Format each example as:
### [Query Title]
**Description:** [What the query does]
\`\`\`sql
[SQL query]
\`\`\`

Generate 5-8 practical, real-world examples that would be commonly used with this schema.`;

    const response = await callAI(prompt, 3000);

    return createMcpResponse(
      `# Sample Queries\n\n**Database:** ${connection.name} (${connection.id})\n\n${response}`
    );
  } catch (error) {
    return createMcpResponse(`Error generating sample queries: ${formatApiError(error)}`, true);
  }
}
