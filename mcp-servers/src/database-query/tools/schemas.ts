import { z } from "zod";

// ============================================================================
// Tool Schemas
// ============================================================================

export const generateSqlSchema = z.object({
  query: z.string().describe("Natural language query to translate to SQL"),
  databaseId: z
    .string()
    .optional()
    .describe("ID of the database to use (uses default if not specified)"),
});

export const listTablesSchema = z.object({
  includeViews: z.boolean().optional().describe("Whether to include views (default: true)"),
  schemaName: z.string().optional().describe("Schema name (default: public)"),
  databaseId: z
    .string()
    .optional()
    .describe("ID of the database to use (uses default if not specified)"),
});

export const getTableSchemaSchema = z.object({
  tableName: z.string().describe("Name of the table to get schema for"),
  includeConstraints: z.boolean().optional().describe("Include constraints (default: true)"),
  includeForeignKeys: z.boolean().optional().describe("Include foreign keys (default: true)"),
  databaseId: z
    .string()
    .optional()
    .describe("ID of the database to use (uses default if not specified)"),
});

export const executeQuerySchema = z.object({
  sql: z.string().describe("SQL query to execute"),
  limit: z.number().int().min(1).max(1000).optional().describe("Max rows to return (default: 100)"),
  explain: z.boolean().optional().describe("Return query execution plan (default: false)"),
  databaseId: z
    .string()
    .optional()
    .describe("ID of the database to use (uses default if not specified)"),
});

export const getSampleQueriesSchema = z.object({
  tableName: z.string().optional().describe("Specific table for sample queries"),
  queryType: z
    .enum(["select", "insert", "update", "delete", "aggregate", "join", "all"])
    .optional()
    .describe("Type of queries to generate (default: all)"),
  databaseId: z
    .string()
    .optional()
    .describe("ID of the database to use (uses default if not specified)"),
});
