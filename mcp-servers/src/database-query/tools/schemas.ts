import { z } from "zod";

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

const dbConfigSchema = z.object({
  host: z.string().describe("Database host"),
  port: z.number().optional().default(5432).describe("Database port"),
  database: z.string().describe("Database name"),
  user: z.string().describe("Database user"),
  password: z.string().optional().default("").describe("Database password"),
  ssl: z.boolean().optional().default(false).describe("Use SSL"),
});

export const obdaQuerySchema = z.object({
  query: z
    .string()
    .min(1)
    .max(10_000)
    .describe("User's natural language database query."),
  r2rmlMapping: z
    .string()
    .min(1)
    .max(200_000)
    .describe("R2RML mapping in Turtle syntax."),
  dbConfig: dbConfigSchema.describe("Database connection configuration for Ontop."),
  ontopSparqlUrl: z
    .string()
    .url()
    .optional()
    .describe("Ontop SPARQL endpoint URL (defaults to server config)."),
  includeDebugContext: z
    .boolean()
    .optional()
    .default(false)
    .describe("If true, include raw SPARQL JSON in the response for debugging."),
});
