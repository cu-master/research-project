// SPARQL execution + result formatting: runs a query against the Ontop SPARQL endpoint and
// renders the JSON results as a Markdown table with shortened (ontology-term) URIs.

interface SparqlBinding {
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

export async function executeSparql(
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

export function summarizeSparqlResults(results: SparqlResults): string {
  const count = results.results.bindings.length;
  const vars = results.head.vars;
  return `${count} result(s) with columns: ${vars.join(", ")}`;
}
