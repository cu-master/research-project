import { Parser as SparqlParser, SparqlQuery } from "sparqljs";
import { Parser as N3Parser, Quad } from "n3";

const RR = "http://www.w3.org/ns/r2rml#";

const STANDARD_NAMESPACES = [
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "http://www.w3.org/2000/01/rdf-schema#",
  "http://www.w3.org/2001/XMLSchema#",
  "http://www.w3.org/ns/r2rml#",
  "http://www.w3.org/2002/07/owl#",
  "http://www.w3.org/ns/sparql-service-description#",
];

export interface SparqlValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sqlTranslation?: string;
}

// ── Layer 1: sparqljs syntax parsing ────────────────────────────────

function validateSyntax(sparql: string): { valid: boolean; error?: string } {
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

// ── Layer 2: Predicate cross-check against R2RML ────────────────────

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

/**
 * Recursively walk the sparqljs AST and collect all NamedNode URIs.
 */
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

function crossCheckPredicates(
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

// ── Layer 3: Ontop /reformulate dry-run ─────────────────────────────

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

// ── Public API ──────────────────────────────────────────────────────

/**
 * Validate a SPARQL query through three layers:
 *   1. Syntax parsing (sparqljs)
 *   2. Predicate cross-check against the R2RML mapping (n3)
 *   3. Ontop /reformulate dry-run (confirms Ontop can translate it)
 *
 * Returns early on hard errors; warnings accumulate but don't block.
 */
export async function validateSparql(
  sparql: string,
  r2rmlTtl: string,
  ontopSparqlUrl: string
): Promise<SparqlValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── Layer 1: Syntax ──────────────────────────────────────────────
  const syntax = validateSyntax(sparql);
  if (!syntax.valid) {
    return {
      valid: false,
      errors: [`SPARQL syntax error: ${syntax.error}`],
      warnings,
    };
  }

  // ── Layer 2: Predicate cross-check ───────────────────────────────
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

  // ── Layer 3: Ontop dry-run ───────────────────────────────────────
  const dryRun = await dryRunReformulate(sparql, ontopSparqlUrl);

  if (!dryRun.success) {
    errors.push(`Ontop reformulation failed: ${dryRun.error}`);
    return { valid: false, errors, warnings };
  }

  return { valid: true, errors, warnings, sqlTranslation: dryRun.sql };
}
