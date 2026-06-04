// SPARQL/R2RML validation: extracts and syntax-checks generated SPARQL, cross-checks the
// URIs it uses against the R2RML mapping (with an LRU cache), and optionally dry-run
// reformulates it through Ontop.
import * as crypto from "crypto";
import { Parser as SparqlParser, type SparqlQuery } from "sparqljs";
import { Parser as N3Parser, type Quad } from "n3";

export function extractSparqlFromResponse(text: string): string {
  const block = text.match(/```(?:sparql)?\s*\n([\s\S]*?)\n```/i);
  if (block?.[1]) return block[1].trim();
  return text.trim();
}

export function looksLikeSparql(q: string): boolean {
  const u = q.toUpperCase();
  return (
    (u.includes("SELECT") || u.includes("ASK") || u.includes("CONSTRUCT")) &&
    u.includes("WHERE")
  );
}

export function ensureLimit(sparql: string, ast: SparqlQuery, defaultLimit = 100): string {
  const q = ast as unknown as Record<string, unknown>;
  if (q.type === "query" && q.queryType === "SELECT" && q.limit == null) {
    return sparql.trimEnd() + `\nLIMIT ${defaultLimit}`;
  }
  return sparql;
}

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

const sparqlParser = new SparqlParser();

export function validateSyntax(sparql: string): { valid: boolean; error?: string; ast?: SparqlQuery } {
  try {
    const ast = sparqlParser.parse(sparql);
    return { valid: true, ast };
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
      return;
    }

    for (const val of Object.values(record)) {
      if (val && typeof val === "object") walk(val);
    }
  }

  walk(obj);
  return uris;
}

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

interface R2rmlCache {
  classes: Set<string>;
  predicates: Set<string>;
}

const R2RML_CACHE_MAX = 10;
const r2rmlCache = new Map<string, R2rmlCache>();

async function getCachedMappedUris(r2rmlTtl: string): Promise<R2rmlCache> {
  const hash = crypto.createHash("sha256").update(r2rmlTtl).digest("hex");
  const cached = r2rmlCache.get(hash);
  if (cached) {
    r2rmlCache.delete(hash);
    r2rmlCache.set(hash, cached);
    return cached;
  }
  const quads = await parseR2rml(r2rmlTtl);
  const extracted = extractMappedUris(quads);
  if (r2rmlCache.size >= R2RML_CACHE_MAX) {
    const oldest = r2rmlCache.keys().next().value;
    if (oldest !== undefined) r2rmlCache.delete(oldest);
  }
  r2rmlCache.set(hash, extracted);
  return extracted;
}

export async function validateSparql(
  sparql: string,
  r2rmlTtl: string,
  ontopSparqlUrl: string,
  includeDebugContext: boolean = false,
  precomputedAst?: SparqlQuery
): Promise<SparqlValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let ast = precomputedAst;
  if (!ast) {
    const syntax = validateSyntax(sparql);
    if (!syntax.valid) {
      return {
        valid: false,
        errors: [`SPARQL syntax error: ${syntax.error}`],
        warnings,
      };
    }
    ast = syntax.ast!;
  }

  try {
    const { classes, predicates } = await getCachedMappedUris(r2rmlTtl);

    const sparqlUris = collectNamedNodes(ast);

    const crossWarnings = crossCheckPredicates(sparqlUris, classes, predicates);
    warnings.push(...crossWarnings);
  } catch (e) {
    warnings.push(
      `Could not cross-check against R2RML: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  let dryRun: { success: boolean; sql?: string; error?: string } = { success: true };

  if (includeDebugContext) {
    dryRun = await dryRunReformulate(sparql, ontopSparqlUrl);

    if (!dryRun.success) {
      errors.push(`Ontop reformulation failed: ${dryRun.error}`);
      return { valid: false, errors, warnings };
    }
  }

  return { valid: true, errors, warnings, sqlTranslation: dryRun.sql };
}
