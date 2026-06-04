// OBDA query orchestrator: ensures Ontop is configured, generates + validates SPARQL from a
// natural-language query (with retry-on-parse-error), executes it via Ontop, and formats the
// results. The individual concerns live in the sibling modules imported below.
import type { McpResponse } from "../../shared/types.js";
import { log } from "../../shared/logger.js";
import { callAI } from "../ai/index.js";
import { createMcpResponse, formatApiError } from "../utils.js";
import { obdaQuerySchema } from "./schemas.js";
import { config } from "../config.js";
import { ensureOntopConfigured } from "./ontop-lifecycle.js";
import {
  SPARQL_SYSTEM_PROMPT,
  buildSparqlPrompt,
  buildSparqlFixPrompt,
} from "./sparql-prompts.js";
import {
  extractSparqlFromResponse,
  looksLikeSparql,
  validateSyntax,
  ensureLimit,
  validateSparql,
} from "./sparql-validation.js";
import {
  type SparqlResults,
  executeSparql,
  formatSparqlResultsAsOntologyTerms,
  summarizeSparqlResults,
} from "./sparql-results.js";

export async function handleObdaQuery(
  args: Record<string, unknown>
): Promise<McpResponse> {
  try {
    const {
      query: userQuery,
      r2rmlMapping,
      dbConfig,
      ontopSparqlUrl: ontopUrlOverride,
      includeDebugContext,
    } = obdaQuerySchema.parse(args);

    const ontopSparqlUrl = ontopUrlOverride || config.ontopSparqlUrl;

    log.debug(`[OBDA] Ensuring Ontop is configured...`);
    let ontopReady: boolean;
    try {
      ontopReady = await ensureOntopConfigured(
        r2rmlMapping,
        dbConfig,
        ontopSparqlUrl
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return createMcpResponse(`Error configuring Ontop: ${msg}`, true);
    }

    if (!ontopReady) {
      return createMcpResponse(
        "Error: Ontop SPARQL endpoint is not ready after configuration. " +
        "Make sure Docker is running and the Ontop container can start.",
        true
      );
    }

    log.debug(`[OBDA] Generating SPARQL for: "${userQuery}"`);
    const sparqlPrompt = `${SPARQL_SYSTEM_PROMPT}\n\n${buildSparqlPrompt(
      userQuery,
      r2rmlMapping
    )}`;

    let llmResponse = await callAI(sparqlPrompt, 12000);
    let sparqlQuery = extractSparqlFromResponse(llmResponse);
    log.debug(`[OBDA] Generated SPARQL:\n${sparqlQuery}`);

    if (!sparqlQuery || !looksLikeSparql(sparqlQuery)) {
      const debugDetails = includeDebugContext
        ? `\n\nLLM output:\n${llmResponse}`
        : "";
      return createMcpResponse(
        `Error: Could not generate a valid SPARQL query for: "${userQuery}".\n\n` +
        `Try rephrasing your question and trying again.` +
        debugDetails,
        true
      );
    }

    // Retry with a targeted correction prompt on parse errors, up to MAX_FIX_ATTEMPTS.
    const MAX_FIX_ATTEMPTS = 2;
    let syntaxResult = validateSyntax(sparqlQuery);

    for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS && !syntaxResult.valid; attempt++) {
      log.warn(
        `[OBDA] SPARQL syntax error (fix ${attempt + 1}/${MAX_FIX_ATTEMPTS}): ${syntaxResult.error}`
      );

      const fixPrompt = buildSparqlFixPrompt(sparqlQuery, syntaxResult.error ?? "", r2rmlMapping);
      llmResponse = await callAI(fixPrompt, 12000);
      sparqlQuery = extractSparqlFromResponse(llmResponse);
      log.debug(`[OBDA] Fixed SPARQL (attempt ${attempt + 1}):\n${sparqlQuery}`);

      syntaxResult = validateSyntax(sparqlQuery);
    }

    if (!syntaxResult.valid) {
      const debugDetails = includeDebugContext
        ? `\n\n**Broken SPARQL:**\n\`\`\`sparql\n${sparqlQuery}\n\`\`\``
        : "";
      return createMcpResponse(
        `Error: Generated SPARQL failed validation:\n\n- SPARQL syntax error: ${syntaxResult.error}\n\n` +
        `Try rephrasing your question or regenerating the R2RML mapping.` +
        debugDetails,
        true
      );
    }

    sparqlQuery = ensureLimit(sparqlQuery, syntaxResult.ast!);

    log.debug(`[OBDA] Validating SPARQL...`);
    const validation = await validateSparql(
      sparqlQuery,
      r2rmlMapping,
      ontopSparqlUrl,
      includeDebugContext,
      syntaxResult.ast!
    );

    if (!validation.valid) {
      const debugDetails = includeDebugContext
        ? `\n\n**Generated SPARQL:**\n\`\`\`sparql\n${sparqlQuery}\n\`\`\``
        : "";
      const errorMsg =
        `Error: Generated SPARQL failed validation:\n\n` +
        validation.errors.map((e) => `- ${e}`).join("\n") +
        (validation.warnings.length > 0
          ? `\n\nWarnings:\n` +
          validation.warnings.map((w) => `- ${w}`).join("\n")
          : "") +
        `\n\nTry rephrasing your question or regenerating the R2RML mapping.` +
        debugDetails;
      return createMcpResponse(errorMsg, true);
    }

    if (validation.warnings.length > 0) {
      log.warn(`[OBDA] SPARQL validation warnings:`, validation.warnings);
    }

    const sqlTranslation = validation.sqlTranslation ?? null;
    if (sqlTranslation) {
      log.debug(`[OBDA] Generated SQL (Ontop reformulation):\n${sqlTranslation.trim()}`);
    } else {
      log.debug("[OBDA] SQL reformulation not available");
    }

    log.debug(`[OBDA] Executing SPARQL via Ontop...`);
    let sparqlResults: SparqlResults;
    try {
      sparqlResults = await executeSparql(sparqlQuery, ontopSparqlUrl);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const debugDetails = includeDebugContext
        ? `\n\n**Generated SPARQL:**\n\`\`\`sparql\n${sparqlQuery}\n\`\`\``
        : "";
      return createMcpResponse(
        `Error executing SPARQL via Ontop: ${msg}\n\n` +
        `This may indicate an issue with the R2RML mapping or the SPARQL query. ` +
        `Try regenerating the R2RML mapping or rephrasing your question.` +
        debugDetails,
        true
      );
    }

    const summary = summarizeSparqlResults(sparqlResults);
    const resultsTable = formatSparqlResultsAsOntologyTerms(sparqlResults);

    let output = `# OBDA Query Results (Ontop)\n\n`;
    output += `**Query:** ${userQuery}\n`;
    output += `**Results:** ${summary}\n\n`;

    output += `## Results (Ontology Terms)\n\n${resultsTable}\n`;
    output += `\n## Answer\n\nHere are the results for: "${userQuery}".\n`;

    if (includeDebugContext) {
      output += `\n## Debug: Generated SPARQL\n\n\`\`\`sparql\n${sparqlQuery}\n\`\`\`\n`;

      if (sqlTranslation) {
        output += `\n## Debug: Generated SQL (via R2RML)\n\n\`\`\`sql\n${sqlTranslation.trim()}\n\`\`\`\n`;
      }

      output += `\n## Debug: Raw SPARQL JSON\n\n\`\`\`json\n${JSON.stringify(sparqlResults, null, 2)}\n\`\`\`\n`;
    }

    log.info(`[OBDA] Query completed: ${summary}`);
    return createMcpResponse(output);
  } catch (error) {
    return createMcpResponse(
      `Error in OBDA query: ${formatApiError(error)}`,
      true
    );
  }
}
