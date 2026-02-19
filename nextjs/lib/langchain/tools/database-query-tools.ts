import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { callDatabaseQueryTool, ensureProjectDatabase } from "../clients";
import { getLangChainRequestContext } from "../request-context";
import { getProject } from "@/lib/db/projects";

// ============================================================================
// Helper: resolve databaseId from the current project's DB config
// ============================================================================

async function resolveProjectDatabaseId(): Promise<string | null> {
  const { projectId, userId } = getLangChainRequestContext();
  if (!projectId || !userId) return null;

  const project = await getProject(projectId, userId);
  if (!project) return null;

  return ensureProjectDatabase(project);
}

// ============================================================================
// Generate SQL Tool
// ============================================================================

const generateSqlArgsSchema = z.object({
  query: z.string().min(1, "Query cannot be empty").describe("Natural language query to translate to SQL"),
  databaseId: z.string().optional().describe("ID of the database to use (uses project database if not specified)"),
});

export const generateSqlTool = tool(
  async (args: z.infer<typeof generateSqlArgsSchema>) => {
    if (!args.query || args.query.trim().length === 0) {
      return "Error: The 'query' argument is REQUIRED and cannot be empty. Provide a natural language description of what data you want to retrieve.";
    }
    const databaseId = args.databaseId || (await resolveProjectDatabaseId());
    if (!databaseId) {
      return "Error: No database configured for this project. Please add database connection details to the project settings.";
    }
    return callDatabaseQueryTool("generate-sql", { ...args, databaseId });
  },
  {
    name: "database_generate_sql",
    description:
      "Generate SQL from a natural language query. Analyzes the database schema and generates appropriate PostgreSQL queries. " +
      "Use this when the user wants to query the database using plain English.",
    schema: generateSqlArgsSchema as z.ZodType<z.infer<typeof generateSqlArgsSchema>>,
  }
);

// ============================================================================
// List Tables Tool
// ============================================================================

const listTablesArgsSchema = z.object({
  includeViews: z.boolean().optional().describe("Whether to include views in the list (default: true)"),
  schemaName: z.string().optional().describe("Schema name to list tables from (default: public)"),
  databaseId: z.string().optional().describe("ID of the database to use (uses project database if not specified)"),
});

export const listTablesTool = tool(
  async (args: z.infer<typeof listTablesArgsSchema>) => {
    const databaseId = args.databaseId || (await resolveProjectDatabaseId());
    if (!databaseId) {
      return "Error: No database configured for this project. Please add database connection details to the project settings.";
    }
    return callDatabaseQueryTool("list-tables", { ...args, databaseId });
  },
  {
    name: "database_list_tables",
    description:
      "List all tables and views in the database with their basic information. " +
      "Use this to discover what tables are available in the database.",
    schema: listTablesArgsSchema as z.ZodType<z.infer<typeof listTablesArgsSchema>>,
  }
);

// ============================================================================
// Get Table Schema Tool
// ============================================================================

const getTableSchemaArgsSchema = z.object({
  tableName: z.string().min(1, "Table name cannot be empty").describe("Name of the table to get schema for"),
  includeConstraints: z
    .boolean()
    .optional()
    .describe("Whether to include constraint information (default: true)"),
  includeForeignKeys: z
    .boolean()
    .optional()
    .describe("Whether to include foreign key relationships (default: true)"),
  databaseId: z.string().optional().describe("ID of the database to use (uses project database if not specified)"),
});

export const getTableSchemaTool = tool(
  async (args: z.infer<typeof getTableSchemaArgsSchema>) => {
    if (!args.tableName || args.tableName.trim().length === 0) {
      return "Error: The 'tableName' argument is REQUIRED and cannot be empty. Provide the name of the table you want to inspect.";
    }
    const databaseId = args.databaseId || (await resolveProjectDatabaseId());
    if (!databaseId) {
      return "Error: No database configured for this project. Please add database connection details to the project settings.";
    }
    return callDatabaseQueryTool("get-table-schema", { ...args, databaseId });
  },
  {
    name: "database_get_table_schema",
    description:
      "Get detailed schema information for a specific table including columns, types, constraints, and foreign keys. " +
      "Use this to understand the structure of a particular table.",
    schema: getTableSchemaArgsSchema as z.ZodType<z.infer<typeof getTableSchemaArgsSchema>>,
  }
);

// ============================================================================
// Execute Query Tool
// ============================================================================

const executeQueryArgsSchema = z.object({
  sql: z.string().min(1, "SQL query cannot be empty").describe("SQL query to execute"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum number of rows to return (default: 100, max: 1000)"),
  explain: z
    .boolean()
    .optional()
    .describe("Whether to return query execution plan instead of results (default: false)"),
  databaseId: z.string().optional().describe("ID of the database to use (uses project database if not specified)"),
});

export const executeQueryTool = tool(
  async (args: z.infer<typeof executeQueryArgsSchema>) => {
    if (!args.sql || args.sql.trim().length === 0) {
      return "Error: The 'sql' argument is REQUIRED and cannot be empty. Provide the SQL query you want to execute.";
    }
    const databaseId = args.databaseId || (await resolveProjectDatabaseId());
    if (!databaseId) {
      return "Error: No database configured for this project. Please add database connection details to the project settings.";
    }
    return callDatabaseQueryTool("execute-query", { ...args, databaseId });
  },
  {
    name: "database_execute_query",
    description:
      "Execute a SQL query on the database and return results. Supports SELECT, INSERT, UPDATE, and DELETE operations. " +
      "IMPORTANT: Dangerous operations (DROP, TRUNCATE, ALTER, CREATE, GRANT, REVOKE) are blocked for safety. " +
      "Use this after generating SQL with translate_to_sql or when you have a specific SQL query to run.",
    schema: executeQueryArgsSchema as z.ZodType<z.infer<typeof executeQueryArgsSchema>>,
  }
);

// ============================================================================
// Get Sample Queries Tool
// ============================================================================

const getSampleQueriesArgsSchema = z.object({
  tableName: z
    .string()
    .optional()
    .describe("Specific table to generate sample queries for (leave empty for general examples)"),
  queryType: z
    .enum(["select", "insert", "update", "delete", "aggregate", "join", "all"])
    .optional()
    .describe("Type of queries to generate (default: all)"),
  databaseId: z.string().optional().describe("ID of the database to use (uses project database if not specified)"),
});

export const getSampleQueriesTool = tool(
  async (args: z.infer<typeof getSampleQueriesArgsSchema>) => {
    const databaseId = args.databaseId || (await resolveProjectDatabaseId());
    if (!databaseId) {
      return "Error: No database configured for this project. Please add database connection details to the project settings.";
    }
    return callDatabaseQueryTool("get-sample-queries", { ...args, databaseId });
  },
  {
    name: "database_get_sample_queries",
    description:
      "Generate sample SQL queries based on the database schema. " +
      "Useful for learning the data model, getting started with queries, or providing examples to the user.",
    schema: getSampleQueriesArgsSchema as z.ZodType<z.infer<typeof getSampleQueriesArgsSchema>>,
  }
);
