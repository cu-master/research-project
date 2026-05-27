import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { callDatabaseQueryTool, ensureProjectDatabase } from "../clients";
import { getLangChainRequestContext } from "../request-context";
import { getProject } from "@/lib/db/projects";

async function resolveProjectDatabaseId(): Promise<string | null> {
  const { projectId, userId } = getLangChainRequestContext();
  if (!projectId || !userId) return null;

  const project = await getProject(projectId, userId);
  if (!project) return null;

  return ensureProjectDatabase({ ...project, db_ssl: project.db_ssl ?? false } as any);
}


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
