import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { getLangChainRequestContext } from "../request-context";
import { getProject } from "@/lib/db/projects";
import {
  callModelInterpretationTool,
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

/**
 * OBDA Orchestrator tool — thin 3-step pipeline:
 *
 * Step 1 (Interpretation) — Call Model Interpretation Server to get a
 *         conceptual definition scoped to the user's query.
 * Step 2 (Synthesis)      — Bundle user query + conceptual definition +
 *         R2RML mapping + ontology + DB config.
 * Step 3 (Execution)      — Send everything to the Database Query Server's
 *         obda-query tool which generates SPARQL, validates, and executes.
 */
export const obdaQueryWithOntopTool = tool(
  async ({
    query: userQuery,
    includeDebugContext,
  }: z.infer<typeof obdaQuerySchema>) => {
    // -----------------------------------------------------------------------
    // Load project context
    // -----------------------------------------------------------------------
    const { projectId, userId } = getLangChainRequestContext();
    if (!projectId || !userId) {
      return "Error: No project context available. Please make sure a project is selected for this session.";
    }

    const project = await getProject(projectId, userId);
    if (!project) {
      return `Error: Project ${projectId} not found.`;
    }

    if (!project.content || !project.content.trim()) {
      return "Error: The project has no URL content (ontology). Please add URLs to the project first.";
    }

    if (!project.r2rml_mapping || !project.r2rml_mapping.trim()) {
      return "Error: The project has no R2RML mapping. Please generate one first using the generate_r2rml_mapping tool.";
    }

    if (!project.db_host) {
      return "Error: The project has no database connection configured. Please configure the database in project settings.";
    }

    // -----------------------------------------------------------------------
    // Step 1 — Interpretation: get conceptual definition from Model
    //          Interpretation Server
    // -----------------------------------------------------------------------
    let conceptualDefinition: string;
    try {
      conceptualDefinition = await callModelInterpretationTool(
        "conceptual-definition",
        {
          query: userQuery,
          content: project.content,
        }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error getting conceptual definition: ${msg}`;
    }

    // -----------------------------------------------------------------------
    // Step 2 & 3 — Synthesis + Execution: send everything to the Database
    //              Query Server's obda-query tool
    // -----------------------------------------------------------------------
    try {
      const result = await callDatabaseQueryTool("obda-query", {
        query: userQuery,
        conceptualDefinition,
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
      "First interprets the query against the project's ontology to extract relevant concepts, " +
      "then generates SPARQL and executes it via Ontop which translates SPARQL to SQL using " +
      "the project's R2RML mapping. Returns results in ontology terms. Requires the project " +
      "to have URL content (ontology), an R2RML mapping, and a configured database connection. " +
      "Use this for formal, precise ontology-based database queries.",
    schema: obdaQuerySchema,
  }
);
