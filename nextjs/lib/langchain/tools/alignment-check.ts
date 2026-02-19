import { createModel } from "../model";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export interface AlignmentResult {
  score: number;
  ontologyDomain: string;
  databaseDomain: string;
  matchedConcepts: string[];
  unmatchedOntology: string[];
  unmatchedDatabase: string[];
  recommendation: "proceed" | "warning" | "mismatch";
  summary: string;
}

const ALIGNMENT_SYSTEM_PROMPT = `You are a domain alignment analyst. Your task is to evaluate whether an ontology/data source and a database schema belong to the same or compatible domains.

Analyze both inputs and respond with ONLY a valid JSON object (no markdown, no code blocks, no explanation) in this exact format:

{
  "score": <number 0-100>,
  "ontologyDomain": "<detected domain of the ontology, e.g. Airlines, Healthcare, Education>",
  "databaseDomain": "<detected domain of the database, e.g. Ecommerce, Finance, Logistics>",
  "matchedConcepts": ["<concept1>", "<concept2>"],
  "unmatchedOntology": ["<ontology concept with no DB match>"],
  "unmatchedDatabase": ["<DB table with no ontology match>"],
  "recommendation": "<proceed|warning|mismatch>",
  "summary": "<1-2 sentence explanation>"
}

SCORING RULES:
- 80-100: Strong alignment — most ontology concepts map to database tables/columns. recommendation = "proceed"
- 40-79: Partial alignment — some overlap but significant gaps. recommendation = "warning"
- 0-39: Domain mismatch — ontology and database are about different subjects. recommendation = "mismatch"

MATCHING RULES:
- Compare ontology classes/entities/properties against database table and column names.
- Consider semantic similarity (e.g., "Aircraft" and "planes" table are a match).
- matchedConcepts: list ontology concepts that have a clear database counterpart.
- unmatchedOntology: list ontology concepts with NO database counterpart (limit to top 5).
- unmatchedDatabase: list database tables with NO ontology counterpart (limit to top 5).

Respond with ONLY the JSON object.`;

function buildAlignmentPrompt(
  ontologyContent: string,
  dbSchema: string
): string {
  // Truncate inputs to keep the prompt focused and fast
  const maxOntologyLen = 3000;
  const maxSchemaLen = 3000;

  const trimmedOntology =
    ontologyContent.length > maxOntologyLen
      ? ontologyContent.slice(0, maxOntologyLen) + "\n... (truncated)"
      : ontologyContent;

  const trimmedSchema =
    dbSchema.length > maxSchemaLen
      ? dbSchema.slice(0, maxSchemaLen) + "\n... (truncated)"
      : dbSchema;

  return `Evaluate domain alignment between these two inputs:

## Ontology / Data Source Content

${trimmedOntology}

## Database Schema

${trimmedSchema}

Respond with the JSON alignment assessment:`;
}

function extractJson(text: string): string {
  // Try to extract JSON from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  // Try to find a JSON object directly
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0].trim();
  }

  return text.trim();
}

export async function checkAlignment(
  ontologyContent: string,
  dbSchema: string
): Promise<AlignmentResult> {
  const model = createModel();

  const messages = [
    new SystemMessage(ALIGNMENT_SYSTEM_PROMPT),
    new HumanMessage(buildAlignmentPrompt(ontologyContent, dbSchema)),
  ];

  const response = await model.invoke(messages);

  const content =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  const jsonStr = extractJson(content);

  let parsed: AlignmentResult;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Failed to parse alignment response as JSON. Raw: ${content.slice(0, 500)}`
    );
  }

  // Validate and clamp the score
  parsed.score = Math.max(0, Math.min(100, Math.round(parsed.score ?? 0)));

  // Ensure recommendation is consistent with score
  if (parsed.score >= 80) parsed.recommendation = "proceed";
  else if (parsed.score >= 40) parsed.recommendation = "warning";
  else parsed.recommendation = "mismatch";

  // Ensure arrays exist
  parsed.matchedConcepts = parsed.matchedConcepts ?? [];
  parsed.unmatchedOntology = parsed.unmatchedOntology ?? [];
  parsed.unmatchedDatabase = parsed.unmatchedDatabase ?? [];
  parsed.summary = parsed.summary ?? "";

  return parsed;
}
