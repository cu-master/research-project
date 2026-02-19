/**
 * SPARQL client for querying the Ontop SPARQL endpoint and formatting results.
 */

const ONTOP_SPARQL_URL =
  process.env.ONTOP_SPARQL_URL || "http://localhost:8080/sparql";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SparqlBinding {
  type: "uri" | "literal" | "bnode" | "typed-literal";
  value: string;
  "xml:lang"?: string;
  datatype?: string;
}

export interface SparqlResults {
  head: { vars: string[] };
  results: {
    bindings: Record<string, SparqlBinding>[];
  };
}

// ---------------------------------------------------------------------------
// Execute SPARQL
// ---------------------------------------------------------------------------

/**
 * Execute a SPARQL SELECT / ASK query against the Ontop endpoint.
 * Returns the parsed SPARQL JSON result.
 */
export async function executeSparql(
  sparqlQuery: string
): Promise<SparqlResults> {
  const response = await fetch(ONTOP_SPARQL_URL, {
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

  const json = (await response.json()) as SparqlResults;
  return json;
}

// ---------------------------------------------------------------------------
// Reformulate SPARQL → SQL
// ---------------------------------------------------------------------------

/**
 * Ask Ontop to translate a SPARQL query into SQL without executing it.
 * Uses the /reformulate endpoint provided by Ontop.
 */
export async function reformulateSparqlToSql(
  sparqlQuery: string
): Promise<string> {
  const reformulateUrl = ONTOP_SPARQL_URL.replace(/\/sparql\/?$/, "/ontop/reformulate");

  const response = await fetch(reformulateUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/plain",
    },
    body: `query=${encodeURIComponent(sparqlQuery)}`,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Ontop reformulate endpoint returned HTTP ${response.status}: ${errorBody}`
    );
  }

  return response.text();
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Shorten a URI to a readable local name.
 * e.g. "http://example.org/ontology/Customer" -> "Customer"
 *      "http://example.org/data/customer/42"  -> "customer/42"
 */
function shortenUri(uri: string): string {
  // Try fragment identifier first (#)
  const hashIdx = uri.lastIndexOf("#");
  if (hashIdx !== -1 && hashIdx < uri.length - 1) {
    return uri.substring(hashIdx + 1);
  }
  // Otherwise use last path segment(s) for data URIs
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

/**
 * Extract a display value from a single SPARQL binding value.
 */
function displayValue(binding: SparqlBinding): string {
  if (binding.type === "uri") {
    return shortenUri(binding.value);
  }
  return binding.value;
}

/**
 * Format SPARQL results using ontology terms for column headers
 * and display-friendly values for URIs.
 */
export function formatSparqlResultsAsOntologyTerms(
  results: SparqlResults
): string {
  const vars = results.head.vars;
  const bindings = results.results.bindings;

  if (bindings.length === 0) {
    return "*No results returned.*";
  }

  // Use variable names as ontology-friendly headers (capitalize, remove underscores)
  const headers = vars.map(
    (v) =>
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

/**
 * Return a brief summary of SPARQL results (row count, variable names).
 */
export function summarizeSparqlResults(results: SparqlResults): string {
  const count = results.results.bindings.length;
  const vars = results.head.vars;
  return `${count} result(s) with columns: ${vars.join(", ")}`;
}
