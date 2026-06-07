import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { createModel } from "../model";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { validateR2rmlMapping } from "@/lib/r2rml/validate";
import { R2RML_MAX_OUTPUT_TOKENS } from "../token-budget";

const generateR2rmlMappingSchema = z.object({
  ontologyContent: z
    .string()
    .min(1)
    .describe(
      "The ontology/data source content (text extracted from URLs). This describes the conceptual model with classes, properties, and relationships."
    ),
  dbSchema: z
    .string()
    .min(1)
    .describe(
      "JSON string of the physical database schema including tables, columns, types, primary keys, and foreign keys."
    ),
});

// All standard prefixes that must always be declared.
const STANDARD_PREFIXES: Record<string, string> = {
  rr: "http://www.w3.org/ns/r2rml#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  owl: "http://www.w3.org/2002/07/owl#",
};

const MANDATORY_PREFIX_BLOCK = Object.entries(STANDARD_PREFIXES)
  .map(([prefix, uri]) => `@prefix ${prefix}: <${uri}> .`)
  .join("\n");

const R2RML_SYSTEM_PROMPT = `You are an expert in W3C R2RML (RDB to RDF Mapping Language). Your task is to generate a valid R2RML mapping document in Turtle (.ttl) syntax that maps a physical relational database schema to an ontology/conceptual model.

RULES:
1. ALWAYS start the output with exactly these prefix declarations and nothing before them:
${MANDATORY_PREFIX_BLOCK}
@prefix ex: <http://example.org/ontology/> .

2. Do NOT use any prefix that has not been declared. If you need an additional prefix, declare it with @prefix before using it. Never use rdfs:, rdf:, xsd:, owl:, or any other prefix without first declaring it.
3. Create a rr:TriplesMap for each database table that corresponds to a class in the ontology.
4. Each TriplesMap must have:
   - rr:logicalTable with rr:tableName
   - rr:subjectMap with rr:class pointing to the ontology class
   - rr:predicateObjectMap entries for each column-to-property mapping
5. For foreign key relationships, use rr:RefObjectMap with rr:parentTriplesMap and rr:joinCondition.
6. Use rr:template for generating IRIs from primary key columns.
7. Use appropriate rr:datatype for literal values (xsd:integer, xsd:string, xsd:boolean, xsd:date, xsd:dateTime, xsd:decimal, etc.).
8. If a column has no clear ontology mapping, include it as a direct property mapping with a comment noting the assumption.
9. Output ONLY the R2RML Turtle content. Do NOT wrap it in markdown code blocks. Do NOT include explanations before or after.
10. Make sure the output is valid Turtle syntax.

EXAMPLE of a correct minimal TriplesMap:
@prefix rr:   <http://www.w3.org/ns/r2rml#> .
@prefix rdf:  <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix ex:   <http://example.org/ontology/> .

<#ActorTriplesMap>
  rr:logicalTable [ rr:tableName "actor" ] ;
  rr:subjectMap [
    rr:template "http://example.org/resource/actor/{actor_id}" ;
    rr:class ex:Actor
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:firstName ;
    rr:objectMap [ rr:column "first_name" ; rr:datatype xsd:string ]
  ] ;
  rr:predicateObjectMap [
    rr:predicate ex:relatedFilm ;
    rr:objectMap [
      rr:parentTriplesMap <#FilmTriplesMap> ;
      rr:joinCondition [ rr:child "film_id" ; rr:parent "film_id" ]
    ]
  ] .`;

function buildR2rmlPrompt(ontologyContent: string, dbSchema: string): string {
  return `Generate a complete R2RML mapping (Turtle syntax) for the following:

## Ontology / Conceptual Model (from data sources)

${ontologyContent}

## Physical Database Schema

${dbSchema}

## Instructions

Analyze both the ontology and the database schema. For each table in the database:
1. Identify which ontology class it corresponds to (by name similarity, semantic meaning, or structural match).
2. Map each column to the most appropriate ontology property.
3. Map foreign key relationships to object properties using rr:RefObjectMap.
4. If a table or column has no clear ontology counterpart, still include it with a reasonable default mapping and add a comment.

Remember: start with ALL required @prefix declarations (rr, rdf, rdfs, xsd, owl, ex) before any TriplesMap.

Generate the complete R2RML mapping now:`;
}

function buildRepairPrompt(
  currentMapping: string,
  errors: string[]
): string {
  return `The R2RML mapping you generated has the following validation errors:

${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}

Here is the current (invalid) mapping:
\`\`\`
${currentMapping}
\`\`\`

Please fix ALL of the errors listed above and return the corrected complete R2RML mapping in valid Turtle syntax.
Remember:
- All @prefix declarations (rr, rdf, rdfs, xsd, owl, ex) must appear at the top before any triples.
- Do NOT use any prefix that is not declared.
- Output ONLY the corrected Turtle content with no markdown fences or explanation.`;
}

// Extracts Turtle from LLM response, unwrapping markdown code blocks if present.
function extractTurtleContent(response: string): string {
  const turtleBlockMatch = response.match(
    /```(?:turtle|ttl|n3|sparql)?\s*\n([\s\S]*?)\n```/i
  );
  if (turtleBlockMatch?.[1]) {
    return turtleBlockMatch[1].trim();
  }

  const genericBlockMatch = response.match(/```\s*\n([\s\S]*?)\n```/);
  if (genericBlockMatch?.[1]) {
    const content = genericBlockMatch[1].trim();
    if (content.startsWith("@prefix") || content.startsWith("@base")) {
      return content;
    }
  }

  return response.trim();
}

// Prepends standard prefix declarations for any prefix used but not declared.
function ensurePrefixes(ttl: string): string {
  const declaredPrefixes = new Set<string>();
  for (const match of ttl.matchAll(/@prefix\s+(\w+)\s*:/g)) {
    declaredPrefixes.add(match[1]);
  }

  const usedPrefixes = new Set<string>();
  for (const match of ttl.matchAll(/\b(\w+):[A-Za-z_]/g)) {
    usedPrefixes.add(match[1]);
  }

  const missingDeclarations: string[] = [];
  for (const prefix of usedPrefixes) {
    if (!declaredPrefixes.has(prefix) && STANDARD_PREFIXES[prefix]) {
      missingDeclarations.push(
        `@prefix ${prefix}: <${STANDARD_PREFIXES[prefix]}> .`
      );
    }
  }

  if (missingDeclarations.length === 0) {
    return ttl;
  }

  return missingDeclarations.join("\n") + "\n" + ttl;
}

const MAX_RETRIES = 2;

// Post-processes the LLM output to inject missing prefixes, then runs a validate-and-retry loop (up to MAX_RETRIES additional attempts) to recover from structural errors.
export const generateR2rmlMappingTool = tool(
  async ({
    ontologyContent,
    dbSchema,
  }: z.infer<typeof generateR2rmlMappingSchema>) => {
    // A full mapping exceeds the 2k chat output cap; use the larger R2RML budget
    // so the Turtle document isn't truncated mid-mapping.
    const model = createModel({ maxTokens: R2RML_MAX_OUTPUT_TOKENS });

    const messages = [
      new SystemMessage(R2RML_SYSTEM_PROMPT),
      new HumanMessage(buildR2rmlPrompt(ontologyContent, dbSchema)),
    ];

    let lastMapping = "";
    let lastErrors: string[] = [];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await model.invoke(messages);

      const content =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      const extracted = extractTurtleContent(content);

      if (!extracted || extracted.length < 20) {
        if (attempt < MAX_RETRIES) {
          messages.push(
            new HumanMessage(
              "Your response was empty or too short. Please output the complete R2RML mapping in valid Turtle syntax."
            )
          );
          continue;
        }
        return JSON.stringify({
          success: false,
          error: "LLM returned an empty or invalid R2RML mapping.",
          raw: content,
        });
      }

      const withPrefixes = ensurePrefixes(extracted);

      const validation = await validateR2rmlMapping(withPrefixes);

      if (validation.valid) {
        return JSON.stringify({
          success: true,
          r2rml_mapping: withPrefixes,
        });
      }

      const errors = validation.issues
        .filter((i) => i.level === "error")
        .map((i) => i.message);

      lastMapping = withPrefixes;
      lastErrors = errors;

      if (attempt < MAX_RETRIES) {
        messages.push(new HumanMessage(buildRepairPrompt(withPrefixes, errors)));
      }
    }

    // All retries exhausted — return the last attempt with a warning.
    return JSON.stringify({
      success: true,
      r2rml_mapping: lastMapping,
      warning: `Mapping was returned after ${MAX_RETRIES} repair attempt(s) but still has validation errors: ${lastErrors.join("; ")}`,
    });
  },
  {
    name: "generate_r2rml_mapping",
    description:
      "Generates a W3C R2RML mapping in Turtle syntax from ontology/data source content and a physical database schema. Uses an LLM to analyze both inputs and produce the mapping document.",
    schema: generateR2rmlMappingSchema,
  }
);
