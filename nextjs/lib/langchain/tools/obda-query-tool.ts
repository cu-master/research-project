import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { createModel } from "../model";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getLangChainRequestContext } from "../request-context";
import { getProject } from "@/lib/db/projects";
import { ensureOntopConfigured } from "@/lib/ontop/config-manager";
import {
  executeSparql,
  formatSparqlResultsAsOntologyTerms,
  summarizeSparqlResults,
} from "@/lib/ontop/sparql-client";
import { validateSparql } from "@/lib/sparql/validate";

// ---------------------------------------------------------------------------
// SPARQL generation (inline, self-contained for the orchestrator)
// ---------------------------------------------------------------------------

const SPARQL_SYSTEM_PROMPT = `You are an expert SPARQL query generator for Ontology-Based Data Access (OBDA) with Ontop.

Translate the user's natural language question into a valid SPARQL SELECT query that Ontop can execute using the provided R2RML mapping.

RULES:
1. Read the R2RML mapping to discover available classes (rr:class), predicates (rr:predicate), and URI templates.
2. Convert @prefix declarations from the R2RML mapping into SPARQL PREFIX syntax. SPARQL uses "PREFIX ex: <uri>" with NO trailing dot. NEVER copy the Turtle "@prefix ex: <uri> ." format — that is invalid SPARQL.
3. Add PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> when using rdf:type.
4. Use ONLY classes and predicates that appear in the R2RML mapping.
5. Use meaningful variable names reflecting ontology terms.
6. Include FILTER, ORDER BY, or GROUP BY as appropriate.
7. For non-aggregate expressions (like MONTH(), xsd:date(), YEAR(), etc.) that you want to GROUP BY: NEVER put them directly in GROUP BY or SELECT. Instead use BIND inside WHERE, then reference the bound variable. Example — WRONG: SELECT (MONTH(?date) AS ?m) ... GROUP BY (MONTH(?date)). CORRECT: SELECT ?m ... WHERE { ... BIND(MONTH(?date) AS ?m) } GROUP BY ?m. However, aggregate functions (COUNT, SUM, AVG, MIN, MAX) go directly in the SELECT clause — do NOT use BIND for aggregates. Example: SELECT ?name (COUNT(?x) AS ?total) WHERE { ... } GROUP BY ?name. BIND must always be INSIDE the WHERE { } block, never outside it.
8. For ORDER BY, always place ASC/DESC BEFORE the variable in parentheses: ORDER BY ASC(?var) or ORDER BY DESC(?var). NEVER write ORDER BY ?var ASC — that is invalid SPARQL.
9. NEVER use FILTER NOT EXISTS, FILTER EXISTS, or MINUS — Ontop does not support them. Instead, use OPTIONAL + FILTER(!BOUND(?var)). Example — WRONG: FILTER NOT EXISTS { ?rental ex:rentedItem ?item }. CORRECT: OPTIONAL { ?rental ex:rentedItem ?item } FILTER(!BOUND(?rental)).
10. Default to LIMIT 100 unless the question specifies a different limit.
11. Output ONLY the SPARQL query text. No markdown code fences. No explanations.`;

function buildSparqlPrompt(
  query: string,
  ontologyContent: string,
  r2rmlMapping: string
): string {
  return `## Natural Language Query
${query}

## Ontology / Conceptual Model
${ontologyContent}

## R2RML Mapping (Turtle)
${r2rmlMapping}

Generate the SPARQL SELECT query:`;
}

function extractSparqlFromResponse(text: string): string {
  const block = text.match(/```(?:sparql)?\s*\n([\s\S]*?)\n```/i);
  if (block?.[1]) return block[1].trim();
  return text.trim();
}

function looksLikeSparql(q: string): boolean {
  const u = q.toUpperCase();
  return (
    (u.includes("SELECT") || u.includes("ASK") || u.includes("CONSTRUCT")) &&
    u.includes("WHERE")
  );
}

// ---------------------------------------------------------------------------
// Tool schema
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// OBDA Orchestrator Tool
// ---------------------------------------------------------------------------

/**
 * OBDA Orchestrator tool using Ontop:
 *
 * Step 1   - Load project (ontology, R2RML mapping, DB config)
 * Step 2   - Ensure Ontop is configured & running for this project
 * Step 3   - Generate SPARQL from NL query + ontology + R2RML
 * Step 3.5 - Validate SPARQL (syntax, predicate cross-check, Ontop dry-run)
 * Step 4   - Execute SPARQL via Ontop (Ontop translates SPARQL -> SQL via R2RML)
 * Step 5   - Format results in ontology terms
 */
export const obdaQueryWithOntopTool = tool(
  async ({
    query: userQuery,
    includeDebugContext,
  }: z.infer<typeof obdaQuerySchema>) => {
    // -----------------------------------------------------------------------
    // Step 1: Load project context
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
    // Step 2: Ensure Ontop is configured and running
    // -----------------------------------------------------------------------
    let ontopReady: boolean;
    try {
      ontopReady = await ensureOntopConfigured(project);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `Error configuring Ontop: ${msg}`;
    }

    if (!ontopReady) {
      return "Error: Ontop SPARQL endpoint is not ready after configuration. Make sure Docker is running and the Ontop container can start.";
    }

    // -----------------------------------------------------------------------
    // Step 3: Generate SPARQL from natural language
    // -----------------------------------------------------------------------
    const model = createModel({
      provider: "openai",
      model: "gpt-5.2",
      temperature: 0,
    });
    const sparqlMessages = [
      new SystemMessage(SPARQL_SYSTEM_PROMPT),
      new HumanMessage(
        buildSparqlPrompt(userQuery, project.content, project.r2rml_mapping)
      ),
    ];

    const llmResponse = await model.invoke(sparqlMessages);
    const rawContent =
      typeof llmResponse.content === "string"
        ? llmResponse.content
        : JSON.stringify(llmResponse.content);

    const sparqlQuery = extractSparqlFromResponse(rawContent);

    if (!sparqlQuery || !looksLikeSparql(sparqlQuery)) {
      return (
        `Error: Could not generate a valid SPARQL query for: "${userQuery}".\n\n` +
        `LLM output:\n${rawContent}`
      );
    }

    // -----------------------------------------------------------------------
    // Step 3.5: Validate SPARQL (syntax + predicate cross-check + dry-run)
    // -----------------------------------------------------------------------
    const ontopUrl =
      process.env.ONTOP_SPARQL_URL || "http://localhost:8080/sparql";
    const validation = await validateSparql(
      sparqlQuery,
      project.r2rml_mapping,
      ontopUrl
    );

    if (!validation.valid) {
      return (
        `Error: Generated SPARQL failed validation:\n\n` +
        validation.errors.map((e) => `- ${e}`).join("\n") +
        (validation.warnings.length > 0
          ? `\n\nWarnings:\n` +
            validation.warnings.map((w) => `- ${w}`).join("\n")
          : "") +
        `\n\n**Generated SPARQL:**\n\`\`\`sparql\n${sparqlQuery}\n\`\`\`\n\n` +
        `Try rephrasing your question or regenerating the R2RML mapping.`
      );
    }

    if (validation.warnings.length > 0) {
      console.warn(
        `[OBDA] SPARQL validation warnings:`,
        validation.warnings
      );
    }

    const sqlTranslation = validation.sqlTranslation ?? null;

    // -----------------------------------------------------------------------
    // Step 4: Execute SPARQL via Ontop
    // -----------------------------------------------------------------------
    let sparqlResults;
    try {
      sparqlResults = await executeSparql(sparqlQuery);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return (
        `Error executing SPARQL via Ontop: ${msg}\n\n` +
        `**Generated SPARQL:**\n\`\`\`sparql\n${sparqlQuery}\n\`\`\`\n\n` +
        `This may indicate an issue with the R2RML mapping or the SPARQL query. ` +
        `Try regenerating the R2RML mapping or rephrasing your question.`
      );
    }

    // -----------------------------------------------------------------------
    // Step 5: Format results
    // -----------------------------------------------------------------------
    const summary = summarizeSparqlResults(sparqlResults);
    const resultsTable = formatSparqlResultsAsOntologyTerms(sparqlResults);

    let output = `# OBDA Query Results (Ontop)\n\n`;
    output += `**Project:** ${project.name}\n`;
    output += `**Query:** ${userQuery}\n`;
    output += `**Results:** ${summary}\n\n`;

    output += `## Generated SPARQL\n\n\`\`\`sparql\n${sparqlQuery}\n\`\`\`\n\n`;

    if (sqlTranslation) {
      output += `## Generated SQL (via R2RML)\n\n\`\`\`sql\n${sqlTranslation.trim()}\n\`\`\`\n\n`;
    }

    output += `## Results (Ontology Terms)\n\n${resultsTable}\n`;

    output += `\n## Answer\n\nHere are the results for: "${userQuery}".\n`;

    if (includeDebugContext) {
      output += `\n## Debug: Raw SPARQL JSON\n\n\`\`\`json\n${JSON.stringify(sparqlResults, null, 2)}\n\`\`\`\n`;
    }

    return output;
  },
  {
    name: "obda_query_with_ontop",
    description:
      "Performs an Ontology-Based Data Access (OBDA) query using the Ontop engine. " +
      "Generates SPARQL from the user's natural language query using the project's ontology, " +
      "then executes it via Ontop which translates SPARQL to SQL using the project's R2RML mapping. " +
      "Returns results in ontology terms. Requires the project to have URL content (ontology), " +
      "an R2RML mapping, and a configured database connection. Use this for formal, precise " +
      "ontology-based database queries.",
    schema: obdaQuerySchema,
  }
);
