import type { ToolDefinition } from "../../shared/types.js";
import { zodToJsonSchema } from "../../shared/utils.js";
import {
  answerQuerySchema,
  summarizeContentSchema,
  explainMappingSchema,
  compareSchemaMappingSchema,
  suggestQueriesSchema,
} from "./schemas.js";
import {
  handleAnswerQuery,
  handleSummarizeContent,
  handleExplainMapping,
  handleCompareSchemaMapping,
  handleSuggestQueries,
} from "./handlers.js";

// ============================================================================
// Tool Registry
// ============================================================================

export const tools: ToolDefinition[] = [
  // === Answer Query ===
  {
    name: "answer-query",
    description:
      "Answers questions using provided content as context. The content (typically URL content from a project) must be passed directly via the 'content' parameter. Returns a comprehensive explanation referencing the provided content.",
    inputSchema: zodToJsonSchema(answerQuerySchema),
    handler: handleAnswerQuery,
  },
  // === Summarize Content ===
  {
    name: "summarize-content",
    description:
      "Generates a structured summary of project content including domain overview, entity/relationship counts, key entities and their descriptions, important relationships, and coverage assessment. Useful for understanding what a project's content describes at a glance.",
    inputSchema: zodToJsonSchema(summarizeContentSchema),
    handler: handleSummarizeContent,
  },
  // === Explain Mapping ===
  {
    name: "explain-mapping",
    description:
      "Explains an R2RML mapping in plain, non-technical language. Takes a Turtle (TTL) R2RML mapping and produces a human-readable breakdown of each TriplesMap: which tables map to which classes, how columns map to properties, and how joins represent relationships. Optionally cross-references against project content for richer explanations.",
    inputSchema: zodToJsonSchema(explainMappingSchema),
    handler: handleExplainMapping,
  },
  // === Compare Schema Mapping ===
  {
    name: "compare-schema-mapping",
    description:
      "Given the domain ontology, database schema, and R2RML mapping, identifies gaps such as unmapped ontology concepts, unmapped database tables/columns, and any mapping inconsistencies.",
    inputSchema: zodToJsonSchema(compareSchemaMappingSchema),
    handler: handleCompareSchemaMapping,
  },
  // === Suggest Queries ===
  {
    name: "suggest-queries",
    description:
      "Given the domain ontology and optionally the database schema, generates a list of meaningful, natural-language business questions that can be asked using the available conceptual model.",
    inputSchema: zodToJsonSchema(suggestQueriesSchema),
    handler: handleSuggestQueries,
  },
];

export const toolMap = new Map(tools.map((t) => [t.name, t]));

// Re-export schemas and handlers for direct access
export * from "./schemas.js";
export * from "./handlers.js";
