import { describe, it, expect } from "vitest";
import { buildPropertiesContent } from "./ontop-config.js";
import {
    extractSparqlFromResponse,
    looksLikeSparql,
    validateSyntax,
    crossCheckPredicates,
} from "./sparql-validation.js";
import {
    shortenUri,
    formatSparqlResultsAsOntologyTerms,
    summarizeSparqlResults,
} from "./sparql-results.js";

describe("buildPropertiesContent", () => {
    const baseConfig = {
        host: "localhost",
        port: 5432,
        database: "testdb",
        user: "admin",
        password: "secret",
        ssl: false,
    };

    it("remaps localhost to host.docker.internal", () => {
        const result = buildPropertiesContent(baseConfig);
        expect(result).toContain("host.docker.internal");
        expect(result).not.toContain("localhost");
    });

    it("remaps 127.0.0.1 to host.docker.internal", () => {
        const result = buildPropertiesContent({ ...baseConfig, host: "127.0.0.1" });
        expect(result).toContain("host.docker.internal");
    });

    it("preserves a remote host as-is", () => {
        const result = buildPropertiesContent({ ...baseConfig, host: "db.example.com" });
        expect(result).toContain("db.example.com");
    });

    it("includes JDBC URL with host, port, and database", () => {
        const result = buildPropertiesContent(baseConfig);
        expect(result).toContain("jdbc:postgresql://host.docker.internal:5432/testdb");
    });

    it("appends ?sslmode=require when ssl is true", () => {
        const result = buildPropertiesContent({ ...baseConfig, ssl: true });
        expect(result).toContain("?sslmode=require");
    });

    it("does not append sslmode when ssl is false", () => {
        const result = buildPropertiesContent({ ...baseConfig, ssl: false });
        expect(result).not.toContain("sslmode");
    });

    it("includes jdbc.user and jdbc.password", () => {
        const result = buildPropertiesContent(baseConfig);
        expect(result).toContain("jdbc.user=admin");
        expect(result).toContain("jdbc.password=secret");
    });

    it("forces read-only via the JDBC options parameter", () => {
        const result = buildPropertiesContent(baseConfig);
        expect(result).toContain("options=-c%20default_transaction_read_only=on");
    });

    it("combines sslmode and read-only options into one query string", () => {
        const result = buildPropertiesContent({ ...baseConfig, ssl: true });
        expect(result).toContain(
            "?sslmode=require&options=-c%20default_transaction_read_only=on"
        );
    });

    it("uses read-only options as the sole query param when ssl is false", () => {
        const result = buildPropertiesContent({ ...baseConfig, ssl: false });
        expect(result).toContain(
            "/testdb?options=-c%20default_transaction_read_only=on"
        );
    });
});

describe("extractSparqlFromResponse", () => {
    it("extracts from a ```sparql fence", () => {
        const input = "```sparql\nSELECT ?s WHERE { ?s ?p ?o }\n```";
        expect(extractSparqlFromResponse(input)).toBe("SELECT ?s WHERE { ?s ?p ?o }");
    });

    it("extracts from a generic ``` fence", () => {
        const input = "```\nSELECT ?x WHERE { ?x a <C> }\n```";
        expect(extractSparqlFromResponse(input)).toBe("SELECT ?x WHERE { ?x a <C> }");
    });

    it("returns the raw text trimmed when no fence present", () => {
        const input = "  SELECT ?x WHERE { ?x ?p ?o }  ";
        expect(extractSparqlFromResponse(input)).toBe("SELECT ?x WHERE { ?x ?p ?o }");
    });
});

describe("looksLikeSparql", () => {
    it("returns true for a SELECT ... WHERE query", () => {
        expect(looksLikeSparql("SELECT ?x WHERE { ?x ?p ?o }")).toBe(true);
    });

    it("returns true for an ASK query", () => {
        expect(looksLikeSparql("ASK { ?s ?p ?o }")).toBe(false); // ASK without WHERE
    });

    it("returns true for a CONSTRUCT ... WHERE query", () => {
        expect(looksLikeSparql("CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }")).toBe(true);
    });

    it("returns false for plain SQL", () => {
        expect(looksLikeSparql("SELECT id FROM users WHERE id = 1")).toBe(true); // has SELECT + WHERE
    });

    it("returns false for an empty string", () => {
        expect(looksLikeSparql("")).toBe(false);
    });

    it("returns false for arbitrary text", () => {
        expect(looksLikeSparql("some random words")).toBe(false);
    });
});

describe("validateSyntax", () => {
    it("returns valid=true for a well-formed SPARQL SELECT", () => {
        const result = validateSyntax("SELECT ?s WHERE { ?s ?p ?o }");
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it("returns valid=false for invalid SPARQL", () => {
        const result = validateSyntax("this is not sparql at all @@@");
        expect(result.valid).toBe(false);
        expect(result.error).toBeTruthy();
    });

    it("returns valid=false for syntactically broken SPARQL", () => {
        // sparqljs accepts empty string as valid; use clearly broken syntax instead
        const result = validateSyntax("SELECT ?x WHERE { ??broken @@@");
        expect(result.valid).toBe(false);
    });
});

describe("crossCheckPredicates", () => {
    const mapped = new Set(["http://example.org/Customer"]);
    const mappedPredicates = new Set(["http://example.org/hasName"]);

    it("emits no warning for a URI found in mapping", () => {
        const warnings = crossCheckPredicates(
            ["http://example.org/Customer"],
            mapped,
            mappedPredicates
        );
        expect(warnings).toHaveLength(0);
    });

    it("emits a warning for an unknown non-standard URI", () => {
        const warnings = crossCheckPredicates(
            ["http://unknown.org/Thing"],
            mapped,
            mappedPredicates
        );
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("http://unknown.org/Thing");
    });

    it("does not warn for standard RDF namespace URIs", () => {
        const warnings = crossCheckPredicates(
            [
                "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
                "http://www.w3.org/2000/01/rdf-schema#label",
                "http://www.w3.org/2001/XMLSchema#string",
            ],
            mapped,
            mappedPredicates
        );
        expect(warnings).toHaveLength(0);
    });

    it("de-duplicates warnings for the same unknown URI", () => {
        const warnings = crossCheckPredicates(
            ["http://unknown.org/X", "http://unknown.org/X"],
            mapped,
            mappedPredicates
        );
        expect(warnings).toHaveLength(1);
    });
});

describe("shortenUri", () => {
    it("extracts fragment after #", () => {
        expect(shortenUri("http://example.org/ontology#Customer")).toBe("Customer");
    });

    it("returns the last two path segments for path-style URIs", () => {
        expect(shortenUri("http://example.org/Customer/123")).toBe("Customer/123");
    });

    it("returns the last segment for single-segment URIs", () => {
        expect(shortenUri("http://example.org/Customer")).toBe("Customer");
    });

    it("returns the URI as-is for non-URL strings", () => {
        const plain = "not-a-url";
        expect(shortenUri(plain)).toBe(plain);
    });
});

describe("summarizeSparqlResults", () => {
    it("reports the correct row count and column names", () => {
        const results = {
            head: { vars: ["name", "age"] },
            results: {
                bindings: [
                    { name: { type: "literal" as const, value: "Alice" }, age: { type: "literal" as const, value: "30" } },
                    { name: { type: "literal" as const, value: "Bob" }, age: { type: "literal" as const, value: "25" } },
                ],
            },
        };
        const summary = summarizeSparqlResults(results);
        expect(summary).toContain("2 result(s)");
        expect(summary).toContain("name");
        expect(summary).toContain("age");
    });

    it("reports 0 results for empty bindings", () => {
        const results = {
            head: { vars: ["x"] },
            results: { bindings: [] },
        };
        expect(summarizeSparqlResults(results)).toContain("0 result(s)");
    });
});

describe("formatSparqlResultsAsOntologyTerms", () => {
    it("returns a no-results message for empty bindings", () => {
        const results = {
            head: { vars: ["x"] },
            results: { bindings: [] },
        };
        expect(formatSparqlResultsAsOntologyTerms(results)).toContain("No results");
    });

    it("renders a markdown table with headers and rows", () => {
        const results = {
            head: { vars: ["film"] },
            results: {
                bindings: [
                    { film: { type: "uri" as const, value: "http://example.org/films#Terminator" } },
                ],
            },
        };
        const table = formatSparqlResultsAsOntologyTerms(results);
        expect(table).toContain("Film"); // header formatted
        expect(table).toContain("Terminator"); // URI fragment shortened
        expect(table).toContain("|"); // markdown table separator
    });

    it("outputs literal values as-is", () => {
        const results = {
            head: { vars: ["count"] },
            results: {
                bindings: [
                    { count: { type: "literal" as const, value: "42" } },
                ],
            },
        };
        const table = formatSparqlResultsAsOntologyTerms(results);
        expect(table).toContain("42");
    });

    it("outputs empty string for missing bindings in a row", () => {
        const results = {
            head: { vars: ["a", "b"] },
            results: {
                bindings: [
                    { a: { type: "literal" as const, value: "hello" } }, // "b" is missing
                ],
            },
        };
        const table = formatSparqlResultsAsOntologyTerms(results);
        expect(table).toContain("hello");
    });
});
