import { z } from "zod";

export const answerQuerySchema = z.object({
  query: z
    .string()
    .describe("The question or query to answer based on the provided content."),
  content: z
    .string()
    .describe("The content to use as context for answering the query. Typically URL content from a project."),
});


export const summarizeContentSchema = z.object({
  content: z
    .string()
    .describe("The project content to summarize (typically URL content describing a conceptual model, documentation, or schema)."),
});

export const explainMappingSchema = z.object({
  mapping: z
    .string()
    .describe("The R2RML mapping in Turtle (TTL) syntax to explain."),
  content: z
    .string()
    .optional()
    .describe("Optional project content (conceptual model) to cross-reference against the mapping for richer explanations."),
});

export const compareSchemaMappingSchema = z.object({
  ontology: z
    .string()
    .describe("The domain ontology or conceptual model content."),
  dbSchema: z
    .string()
    .describe("The database schema information (e.g. JSON representation of tables and columns)."),
  mapping: z
    .string()
    .describe("The R2RML mapping connecting the schema to the ontology."),
});

export const suggestQueriesSchema = z.object({
  ontology: z
    .string()
    .describe("The domain ontology or conceptual model content to base questions on."),
  dbSchema: z
    .string()
    .optional()
    .describe("Optional database schema to ground the questions in what is actually available."),
});

