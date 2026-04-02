import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { createModel } from "../model";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

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

const R2RML_SYSTEM_PROMPT = `You are an expert in W3C R2RML (RDB to RDF Mapping Language). Your task is to generate a valid R2RML mapping document in Turtle (.ttl) syntax that maps a physical relational database schema to an ontology/conceptual model.

RULES:
1. Use standard R2RML vocabulary: @prefix rr: <http://www.w3.org/ns/r2rml#> .
2. Use meaningful prefixes for the ontology namespace (e.g., @prefix ex: <http://example.org/ontology/> .).
3. Create a rr:TriplesMap for each database table that corresponds to a class in the ontology.
4. Each TriplesMap must have:
   - rr:logicalTable with rr:tableName
   - rr:subjectMap with rr:class pointing to the ontology class
   - rr:predicateObjectMap entries for each column-to-property mapping
5. For foreign key relationships, use rr:RefObjectMap with rr:parentTriplesMap and rr:joinCondition.
6. Use rr:template for generating IRIs from primary key columns.
7. Use appropriate rr:datatype for literal values (xsd:integer, xsd:string, xsd:boolean, xsd:date, etc.).
8. If a column has no clear ontology mapping, include it as a direct property mapping with a comment noting the assumption.
9. Output ONLY the R2RML Turtle content. Do NOT wrap it in markdown code blocks. Do NOT include explanations before or after.
10. Make sure the output is valid Turtle syntax.`;

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

Generate the complete R2RML mapping now:`;
}

/**
 * Extracts clean Turtle content from LLM response that may contain markdown code blocks.
 */
function extractTurtleContent(response: string): string {
  // Try to extract from markdown code block if present
  const turtleBlockMatch = response.match(
    /```(?:turtle|ttl|n3|sparql)?\s*\n([\s\S]*?)\n```/i
  );
  if (turtleBlockMatch?.[1]) {
    return turtleBlockMatch[1].trim();
  }

  // Try generic code block
  const genericBlockMatch = response.match(/```\s*\n([\s\S]*?)\n```/);
  if (genericBlockMatch?.[1]) {
    const content = genericBlockMatch[1].trim();
    // Verify it looks like Turtle (starts with @prefix or @base)
    if (content.startsWith("@prefix") || content.startsWith("@base")) {
      return content;
    }
  }

  // No code block found, return as-is (trimmed)
  return response.trim();
}

/**
 * LangChain tool that generates W3C R2RML mappings in Turtle syntax
 * by invoking the configured LLM with ontology content and database schema.
 */
export const generateR2rmlMappingTool = tool(
  async ({
    ontologyContent,
    dbSchema,
  }: z.infer<typeof generateR2rmlMappingSchema>) => {
    // const model = createModel({
    //   provider: "anthropic",
    //   model: "claude-sonnet-4-6",
    //   temperature: 0,
    // });
    const model = createModel({});

    const messages = [
      new SystemMessage(R2RML_SYSTEM_PROMPT),
      new HumanMessage(buildR2rmlPrompt(ontologyContent, dbSchema)),
    ];

    const response = await model.invoke(messages);

    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    const r2rmlMapping = extractTurtleContent(content);

    if (!r2rmlMapping || r2rmlMapping.length < 20) {
      return JSON.stringify({
        success: false,
        error: "LLM returned an empty or invalid R2RML mapping.",
        raw: content,
      });
    }

    return JSON.stringify({
      success: true,
      r2rml_mapping: r2rmlMapping,
    });
  },
  {
    name: "generate_r2rml_mapping",
    description:
      "Generates a W3C R2RML mapping in Turtle syntax from ontology/data source content and a physical database schema. Uses an LLM to analyze both inputs and produce the mapping document.",
    schema: generateR2rmlMappingSchema,
  }
);
