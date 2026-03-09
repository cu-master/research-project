import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { Parser as SparqlParser, type SparqlQuery } from "sparqljs";
import { Parser as N3Parser, type Quad } from "n3";
import type { McpResponse } from "../../shared/types.js";
import { callAI } from "../ai/index.js";
import { createMcpResponse, formatApiError } from "../utils.js";
import { obdaQuerySchema } from "./schemas.js";
import { config } from "../config.js";

const execAsync = promisify(exec);

// ============================================================================
// Ontop Configuration Management
// ============================================================================

const ONTOP_INPUT_DIR = config.ontopInputDir;
const PROPERTIES_FILE = path.join(ONTOP_INPUT_DIR, "ontop.properties");
const MAPPING_FILE = path.join(ONTOP_INPUT_DIR, "mapping.ttl");

let currentConfigHash: string | null = null;

interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/** @internal exported for unit testing */
export function buildPropertiesContent(dbConfig: DbConfig): string {
  let host = dbConfig.host || "localhost";
  const port = dbConfig.port || 5432;
  const database = dbConfig.database || "postgres";
  const user = dbConfig.user || "postgres";
  const password = dbConfig.password || "";

  if (host === "localhost" || host === "127.0.0.1") {
    host = "host.docker.internal";
  }

  const sslParam = dbConfig.ssl ? "?sslmode=require" : "";

  return [
    `jdbc.url=jdbc:postgresql://${host}:${port}/${database}${sslParam}`,
    `jdbc.driver=org.postgresql.Driver`,
    `jdbc.user=${user}`,
    `jdbc.password=${password}`,
  ].join("\n");
}

async function writeOntopConfig(
  r2rmlMapping: string,
  dbConfig: DbConfig
): Promise<void> {
  await fs.mkdir(ONTOP_INPUT_DIR, { recursive: true });

  const propertiesContent = buildPropertiesContent(dbConfig);
  await fs.writeFile(PROPERTIES_FILE, propertiesContent, "utf-8");
  await fs.writeFile(MAPPING_FILE, r2rmlMapping, "utf-8");

  console.log(`[Ontop] Config written`);
}

async function restartOntopContainer(): Promise<void> {
  try {
    await execAsync("docker compose restart ontop", {
      cwd: config.projectRoot,
    });
    console.log("[Ontop] Container restarted");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to restart Ontop container: ${msg}`);
  }
}

async function startOntopContainer(): Promise<void> {
  try {
    await execAsync("docker compose up -d ontop", {
      cwd: config.projectRoot,
    });
    console.log("[Ontop] Container started");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to start Ontop container: ${msg}`);
  }
}

function isOntopReady(ontopSparqlUrl: string): Promise<boolean> {
  const testQuery = encodeURIComponent("ASK { ?s ?p ?o }");
  return fetch(`${ontopSparqlUrl}?query=${testQuery}`, {
    method: "GET",
    headers: { Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(5000),
  })
    .then((r) => r.ok)
    .catch(() => false);
}

async function waitForOntop(
  ontopSparqlUrl: string,
  maxWaitMs = 60000,
  intervalMs = 3000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await isOntopReady(ontopSparqlUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

async function ensureOntopConfigured(
  r2rmlMapping: string,
  dbConfig: DbConfig,
  ontopSparqlUrl: string
): Promise<boolean> {
  const configHash = JSON.stringify({ dbConfig, r2rml: r2rmlMapping.length });
  const needsReconfigure = currentConfigHash !== configHash;

  if (needsReconfigure) {
    await writeOntopConfig(r2rmlMapping, dbConfig);

    const ready = await isOntopReady(ontopSparqlUrl);
    if (ready) {
      await restartOntopContainer();
    } else {
      await startOntopContainer();
    }

    const isReady = await waitForOntop(ontopSparqlUrl);
    if (isReady) {
      currentConfigHash = configHash;
    }
    return isReady;
  }

  if (await isOntopReady(ontopSparqlUrl)) {
    return true;
  }

  await writeOntopConfig(r2rmlMapping, dbConfig);
  await startOntopContainer();
  const isReady = await waitForOntop(ontopSparqlUrl);
  if (isReady) {
    currentConfigHash = configHash;
  }
  return isReady;
}

// ============================================================================
// SPARQL Generation
// ============================================================================

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
  conceptualDefinition: string,
  r2rmlMapping: string
): string {
  return `## Natural Language Query
${query}

## Conceptual Definition (relevant entities, attributes, relationships)
${conceptualDefinition}

## R2RML Mapping (Turtle)
${r2rmlMapping}

Generate the SPARQL SELECT query:`;
}

/** @internal exported for unit testing */
export function extractSparqlFromResponse(text: string): string {
  const block = text.match(/```(?:sparql)?\s*\n([\s\S]*?)\n```/i);
  if (block?.[1]) return block[1].trim();
  return text.trim();
}

/** @internal exported for unit testing */
export function looksLikeSparql(q: string): boolean {
  const u = q.toUpperCase();
  return (
    (u.includes("SELECT") || u.includes("ASK") || u.includes("CONSTRUCT")) &&
    u.includes("WHERE")
  );
}

// ============================================================================
// SPARQL Validation
// ============================================================================

const RR = "http://www.w3.org/ns/r2rml#";

const STANDARD_NAMESPACES = [
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "http://www.w3.org/2000/01/rdf-schema#",
  "http://www.w3.org/2001/XMLSchema#",
  "http://www.w3.org/ns/r2rml#",
  "http://www.w3.org/2002/07/owl#",
  "http://www.w3.org/ns/sparql-service-description#",
];

interface SparqlValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sqlTranslation?: string;
}

/** @internal exported for unit testing */
export function validateSyntax(sparql: string): { valid: boolean; error?: string } {
  try {
    const parser = new SparqlParser();
    parser.parse(sparql);
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function parseR2rml(ttl: string): Promise<Quad[]> {
  return new Promise((resolve, reject) => {
    const parser = new N3Parser();
    const quads: Quad[] = [];
    parser.parse(ttl, (error, quad) => {
      if (error) return reject(error);
      if (quad) quads.push(quad);
      else resolve(quads);
    });
  });
}

function extractMappedUris(quads: Quad[]): {
  classes: Set<string>;
  predicates: Set<string>;
} {
  const classes = new Set<string>();
  const predicates = new Set<string>();

  for (const q of quads) {
    if (q.predicate.value === `${RR}class`) {
      classes.add(q.object.value);
    }
    if (q.predicate.value === `${RR}predicate`) {
      predicates.add(q.object.value);
    }
  }

  return { classes, predicates };
}

function collectNamedNodes(obj: unknown): string[] {
  const uris: string[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    const record = node as Record<string, unknown>;

    if (record.termType === "NamedNode" && typeof record.value === "string") {
      uris.push(record.value);
    }

    for (const val of Object.values(record)) {
      if (val && typeof val === "object") walk(val);
    }
  }

  walk(obj);
  return uris;
}

/** @internal exported for unit testing */
export function crossCheckPredicates(
  sparqlUris: string[],
  mappedClasses: Set<string>,
  mappedPredicates: Set<string>
): string[] {
  const warnings: string[] = [];
  const allMapped = new Set([...mappedClasses, ...mappedPredicates]);
  const alreadyWarned = new Set<string>();

  for (const uri of sparqlUris) {
    if (STANDARD_NAMESPACES.some((ns) => uri.startsWith(ns))) continue;
    if (allMapped.has(uri)) continue;
    if (alreadyWarned.has(uri)) continue;

    alreadyWarned.add(uri);
    warnings.push(
      `URI <${uri}> used in SPARQL is not found in the R2RML mapping. ` +
      `Query may return no results for this term.`
    );
  }

  return warnings;
}

async function dryRunReformulate(
  sparql: string,
  ontopSparqlUrl: string
): Promise<{ success: boolean; sql?: string; error?: string }> {
  const reformulateUrl = ontopSparqlUrl.replace(
    /\/sparql\/?$/,
    "/ontop/reformulate"
  );

  try {
    const response = await fetch(reformulateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/plain",
      },
      body: `query=${encodeURIComponent(sparql)}`,
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        success: false,
        error: `Ontop rejected query (HTTP ${response.status}): ${body}`,
      };
    }

    const sql = await response.text();
    return { success: true, sql };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function validateSparql(
  sparql: string,
  r2rmlTtl: string,
  ontopSparqlUrl: string
): Promise<SparqlValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const syntax = validateSyntax(sparql);
  if (!syntax.valid) {
    return {
      valid: false,
      errors: [`SPARQL syntax error: ${syntax.error}`],
      warnings,
    };
  }

  try {
    const quads = await parseR2rml(r2rmlTtl);
    const { classes, predicates } = extractMappedUris(quads);

    const parser = new SparqlParser();
    const ast: SparqlQuery = parser.parse(sparql);
    const sparqlUris = collectNamedNodes(ast);

    const crossWarnings = crossCheckPredicates(sparqlUris, classes, predicates);
    warnings.push(...crossWarnings);
  } catch (e) {
    warnings.push(
      `Could not cross-check against R2RML: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  const dryRun = await dryRunReformulate(sparql, ontopSparqlUrl);

  if (!dryRun.success) {
    errors.push(`Ontop reformulation failed: ${dryRun.error}`);
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors, warnings, sqlTranslation: dryRun.sql };
}

// ============================================================================
// SPARQL Execution & Formatting
// ============================================================================

interface SparqlBinding {
  type: "uri" | "literal" | "bnode" | "typed-literal";
  value: string;
  "xml:lang"?: string;
  datatype?: string;
}

interface SparqlResults {
  head: { vars: string[] };
  results: {
    bindings: Record<string, SparqlBinding>[];
  };
}

async function executeSparql(
  sparqlQuery: string,
  ontopSparqlUrl: string
): Promise<SparqlResults> {
  const response = await fetch(ontopSparqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
    },
    body: `query=${encodeURIComponent(sparqlQuery)}`,
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Ontop SPARQL endpoint returned HTTP ${response.status}: ${errorBody}`
    );
  }

  return (await response.json()) as SparqlResults;
}

/** @internal exported for unit testing */
export function shortenUri(uri: string): string {
  const hashIdx = uri.lastIndexOf("#");
  if (hashIdx !== -1 && hashIdx < uri.length - 1) {
    return uri.substring(hashIdx + 1);
  }
  try {
    const url = new URL(uri);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2) {
      return segments.slice(-2).join("/");
    }
    return segments[segments.length - 1] || uri;
  } catch {
    return uri;
  }
}

/** @internal exported for unit testing */
export function formatSparqlResultsAsOntologyTerms(results: SparqlResults): string {
  const vars = results.head.vars;
  const bindings = results.results.bindings;

  if (bindings.length === 0) {
    return "*No results returned.*";
  }

  const headers = vars.map((v) =>
    v
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^\s+/, "")
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );

  let table = `| ${headers.join(" | ")} |\n`;
  table += `| ${headers.map(() => "---").join(" | ")} |\n`;

  for (const row of bindings) {
    const cells = vars.map((v) => {
      const binding = row[v];
      if (!binding) return "";
      if (binding.type === "uri") {
        return shortenUri(binding.value);
      }
      return binding.value;
    });
    table += `| ${cells.join(" | ")} |\n`;
  }

  return table;
}

/** @internal exported for unit testing */
export function summarizeSparqlResults(results: SparqlResults): string {
  const count = results.results.bindings.length;
  const vars = results.head.vars;
  return `${count} result(s) with columns: ${vars.join(", ")}`;
}

// ============================================================================
// OBDA Query Handler
// ============================================================================

export async function handleObdaQuery(
  args: Record<string, unknown>
): Promise<McpResponse> {
  try {
    const {
      query: userQuery,
      conceptualDefinition,
      r2rmlMapping,
      dbConfig,
      ontopSparqlUrl: ontopUrlOverride,
      includeDebugContext,
    } = obdaQuerySchema.parse(args);

    const ontopSparqlUrl = ontopUrlOverride || config.ontopSparqlUrl;

    // Step 1: Ensure Ontop is configured and running
    console.log(`[OBDA] Ensuring Ontop is configured...`);
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

    // Step 2: Generate SPARQL from natural language
    console.log(`[OBDA] Generating SPARQL for: "${userQuery}"`);
    const sparqlPrompt = `${SPARQL_SYSTEM_PROMPT}\n\n${buildSparqlPrompt(
      userQuery,
      conceptualDefinition,
      r2rmlMapping
    )}`;

    const llmResponse = await callAI(sparqlPrompt, 2000);
    const sparqlQuery = extractSparqlFromResponse(llmResponse);

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

    // Step 3: Validate SPARQL (syntax + predicate cross-check + dry-run)
    console.log(`[OBDA] Validating SPARQL...`);
    const validation = await validateSparql(
      sparqlQuery,
      r2rmlMapping,
      ontopSparqlUrl
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
      console.warn(`[OBDA] SPARQL validation warnings:`, validation.warnings);
    }

    const sqlTranslation = validation.sqlTranslation ?? null;

    // Step 4: Execute SPARQL via Ontop
    console.log(`[OBDA] Executing SPARQL via Ontop...`);
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

    // Step 5: Format results
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

    console.log(`[OBDA] Query completed: ${summary}`);
    return createMcpResponse(output);
  } catch (error) {
    return createMcpResponse(
      `Error in OBDA query: ${formatApiError(error)}`,
      true
    );
  }
}
