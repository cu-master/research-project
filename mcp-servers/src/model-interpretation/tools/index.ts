import type { ToolDefinition } from "../../shared/types.js";
import { zodToJsonSchema } from "../../shared/utils.js";
import {
  answerQuerySchema,
  conceptualDefinitionSchema,
  summarizeContentSchema,
  explainMappingSchema,
} from "./schemas.js";
import {
  handleAnswerQuery,
  handleConceptualDefinition,
  handleSummarizeContent,
  handleExplainMapping,
} from "./handlers.js";

// ============================================================================
// Tool Registry
// ============================================================================

export const tools: ToolDefinition[] = [
  // === Answer Query ===
  {
    name: "answer-query",
    description:
      "Answers questions using provided content as context. The content (typically URL content from a project) must be passed directly via the 'content' parameter. Returns a comprehensive explanation with suggested follow-up topics.",
    inputSchema: zodToJsonSchema(answerQuerySchema),
    handler: handleAnswerQuery,
  },
  // === Conceptual Definition (Semantic Pruning) ===
  {
    name: "conceptual-definition",
    description:
      "Given a user query and provided content (typically URL content describing a conceptual model), returns a concise conceptual definition (entities, attributes, relationships) relevant to the query. This is intended for the Tier-2 Orchestrator RAG workflow: interpretation -> synthesis -> SQL.",
    inputSchema: zodToJsonSchema(conceptualDefinitionSchema),
    handler: handleConceptualDefinition,
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
];

export const toolMap = new Map(tools.map((t) => [t.name, t]));

// Re-export schemas and handlers for direct access
export * from "./schemas.js";
export * from "./handlers.js";
