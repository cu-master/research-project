import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { getLangChainRequestContext } from "../request-context";
import { getProject } from "@/lib/db/projects";
import {
  callDatabaseQueryTool,
} from "../clients";

const obdaQuerySchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "User's natural language database query, e.g. 'List all customers' or 'Show employees in the Engineering department'."
    ),
  includeDebugContext: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "If true, include the generated SPARQL and raw SPARQL JSON in the response for debugging."
    ),
});

const MUTATION_INTENT_PATTERNS: RegExp[] = [
  /\bdelete\b/i,
  /\bdrop\b/i,
  /\binsert\b/i,
  /\bupdate\b/i,
  /\btruncate\b/i,
  /\balter\b/i,
  /\bcreate\s+table\b/i,
  /\bdrop\s+table\b/i,
  /\balter\s+table\b/i,
  /\bdelete\s+all\b/i,
  /\bremove\s+all\b/i,
  /\badd\s+a\s+record\b/i,
  /\bupdate\s+record\b/i,
];

function detectMutationIntent(query: string): boolean {
  return MUTATION_INTENT_PATTERNS.some((pattern) => pattern.test(query));
}

// OBDA orchestrator: bundles R2RML mapping + DB config and delegates to the Database Query Server's obda-query tool, which generates SPARQL, validates, and executes via Ontop.
export const obdaQueryWithOntopTool = tool(
  async ({
    query: userQuery,
    includeDebugContext,
  }: z.infer<typeof obdaQuerySchema>) => {
    if (detectMutationIntent(userQuery)) {
      return (
        "SQL Rejected (NFR-02): Only read-only SELECT queries are permitted. " +
        "This system does not support data modification operations."
      );
    }

    const { projectId, userId } = getLangChainRequestContext();
    if (!projectId || !userId) {
      return "Error: No project context available. Please make sure a project is selected for this session.";
    }

    const project = await getProject(projectId, userId);
    if (!project) {
      return `Error: Project ${projectId} not found.`;
    }

    if (!project.r2rml_mapping || !/\S/.test(project.r2rml_mapping)) {
      return "Error: The project has no R2RML mapping. Please generate one first using the generate_r2rml_mapping tool.";
    }

    if (!project.db_host) {
      return "Error: The project has no database connection configured. Please configure the database in project settings.";
    }

    try {
      const result = await callDatabaseQueryTool("obda-query", {
        query: userQuery,
        r2rmlMapping: project.r2rml_mapping,
        dbConfig: {
          host: project.db_host,
          port: project.db_port || 5432,
          database: project.db_database || "postgres",
          user: project.db_user || "postgres",
          password: project.db_password || "",
          ssl: project.db_ssl ?? false,
        },
        includeDebugContext,
      });

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error executing OBDA query: ${msg}`;
    }
  },
  {
    name: "obda_query_with_ontop",
    description:
      "Performs an Ontology-Based Data Access (OBDA) query using the Ontop engine. " +
      "Generates SPARQL from the user's natural language query using the provided mapping " +
      "and executes it via Ontop, which translates SPARQL to SQL. Returns results in ontology terms. " +
      "Requires the project to have an R2RML mapping and a configured database connection. " +
      "Use this for formal, precise ontology-based database queries.",
    schema: obdaQuerySchema,
  }
);
