import { z } from "zod";

// ============================================================================
// Tool Schemas
// ============================================================================

export const answerQuerySchema = z.object({
  query: z
    .string()
    .describe("The question or query to answer based on the provided content."),
  content: z
    .string()
    .describe("The content to use as context for answering the query. Typically URL content from a project."),
});

/**
 * Conceptual definition: produce a concise, query-relevant conceptual description
 * (entities, attributes, relationships) from the provided content.
 *
 * This is intended for the Tier-2 Orchestrator RAG workflow: interpretation -> synthesis -> SQL.
 */
export const conceptualDefinitionSchema = z.object({
  query: z
    .string()
    .describe("The user's natural language query that we should interpret against the content."),
  content: z
    .string()
    .describe(
      "The content to interpret (typically URL content from a project describing a conceptual model)."
    ),
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

