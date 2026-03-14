import type { ToolDefinition } from "../../shared/types.js";
import { zodToJsonSchema } from "../../shared/utils.js";
import {
  getSampleQueriesSchema,
  getTableSchemaSchema,
  listTablesSchema,
  obdaQuerySchema,
} from "./schemas.js";
import {
  handleGetSampleQueries,
  handleGetTableSchema,
  handleListTables,
} from "./handlers.js";
import { handleObdaQuery } from "./obda-handler.js";

// ============================================================================
// Tool Registry
// ============================================================================

export const tools: ToolDefinition[] = [
  {
    name: "list-tables",
    description: "List all tables and views in the specified database.",
    inputSchema: zodToJsonSchema(listTablesSchema),
    handler: handleListTables,
  },
  {
    name: "get-table-schema",
    description:
      "Get detailed schema information for a specific table including columns, types, constraints, and foreign keys.",
    inputSchema: zodToJsonSchema(getTableSchemaSchema),
    handler: handleGetTableSchema,
  },
  {
    name: "get-sample-queries",
    description: "Generate sample SQL queries based on the database schema.",
    inputSchema: zodToJsonSchema(getSampleQueriesSchema),
    handler: handleGetSampleQueries,
  },
  {
    name: "obda-query",
    description:
      "Performs an OBDA query using the Ontop engine. Generates SPARQL from a natural language query " +
      "using the provided conceptual definition, ontology, and R2RML mapping, then executes it via Ontop " +
      "which translates SPARQL to SQL. Returns results formatted in ontology terms.",
    inputSchema: zodToJsonSchema(obdaQuerySchema),
    handler: handleObdaQuery,
  },
];

export const toolMap = new Map(tools.map((t) => [t.name, t]));

// Re-export schemas and handlers for direct access
export * from "./schemas.js";
export * from "./handlers.js";
export * from "./obda-handler.js";
