import type { McpResponse } from "../../shared/types.js";
import { callAI } from "../ai/index.js";
import { createMcpResponse, formatApiError } from "../utils.js";
import {
  answerQuerySchema,
  conceptualDefinitionSchema,
  summarizeContentSchema,
  explainMappingSchema,
} from "./schemas.js";

type ConceptualDefinitionPayload = {
  entities: string[];
  attributes: string[];
  relationships: string[];
  summary: string;
};

function parseJsonObject<T>(raw: string): T | null {
  try {
    let jsonString = raw.trim();
    jsonString = jsonString
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?\s*```$/i, "");
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    return null;
  }
}

function buildConceptualDefinitionPrompt(query: string, content: string): string {
  return `You are a content interpretation assistant for a Retrieval-Augmented Generation (RAG) workflow.

Your job is to "semantically prune" the provided content: extract ONLY the conceptual entities, attributes, and relationships that are relevant to the user's query.

User Query:
"${query}"

Content (conceptual model / spec):
---
${content}
---

Output requirements:
- Be concise and specific.
- Use ONLY concepts present in the content.
- Prefer the domain language (conceptual names), not physical DB names.
- Output a structured JSON object representing the extracted schema.

Return a JSON object with this exact structure:
{
  "entities": ["array of exact entity names"],
  "attributes": ["array of key attributes needed"],
  "relationships": ["array of relationship descriptions (e.g., 'Order connects to Customer')"],
  "summary": "a single focused sentence summarizing the relevant concepts"
}

Return ONLY the JSON object, no additional text or markdown formatting.`;
}

function buildConceptualDefinitionRetryPrompt(query: string, content: string): string {
  return `Return ONLY a VALID JSON object.
No markdown, no explanation, no code fences.

Schema (exact keys required):
{
  "entities": ["string"],
  "attributes": ["string"],
  "relationships": ["string"],
  "summary": "string"
}

Constraints:
- Keep arrays short (max 8 items each).
- Keep summary to one sentence (max 30 words).
- Use only concepts present in the content.
- Ensure JSON is complete and parseable.

User Query:
"${query}"

Content:
---
${content}
---`;
}

function ensureConceptualDefinitionShape(
  parsed: Partial<ConceptualDefinitionPayload> | null
): ConceptualDefinitionPayload {
  if (!parsed || typeof parsed !== "object") {
    return {
      entities: [],
      attributes: [],
      relationships: [],
      summary: "No relevant conceptual entities were extracted.",
    };
  }

  return {
    entities: Array.isArray(parsed.entities)
      ? parsed.entities.filter((v): v is string => typeof v === "string")
      : [],
    attributes: Array.isArray(parsed.attributes)
      ? parsed.attributes.filter((v): v is string => typeof v === "string")
      : [],
    relationships: Array.isArray(parsed.relationships)
      ? parsed.relationships.filter((v): v is string => typeof v === "string")
      : [],
    summary:
      typeof parsed.summary === "string" && /\S/.test(parsed.summary)
        ? parsed.summary.trim()
        : "No relevant conceptual entities were extracted.",
  };
}

// ============================================================================
// Answer Query Handler
// ============================================================================

export async function handleAnswerQuery(
  args: Record<string, unknown>
): Promise<McpResponse> {
  try {
    const { query, content } = answerQuerySchema.parse(args);

    console.log(`[AnswerQuery] Processing query: "${query}"`);
    console.log(`[AnswerQuery] Content length: ${content.length} chars`);

    const prompt = `You are a knowledgeable assistant. Your task is to answer questions using the provided content as context, with comprehensive explanations.

**User Query:** ${query}

**Provided Content:**
---
${content}
---

**Instructions:**

1. **Analyze the Query:** Understand what the user is asking and identify which parts of the provided content are relevant.

2. **Generate Explanation:**
   - Provide a clear, natural language explanation relevant to the query
   - Explicitly reference specific sections, entities, properties, or concepts from the provided content
   - Use the exact names and terminology from the content when referencing them
   - If the content describes data models, schemas, or structures, explain entities, relationships, data types, and constraints when relevant
   - If the content is documentation or general text, summarize and explain the relevant sections

3. **Related Topics Analysis:**
   - After answering the main query, analyze the content to identify:
     - Related concepts or topics that are connected to the answer
     - Additional details that might be relevant but weren't directly asked about
   - Generate 3-5 suggested follow-up topics that would help the user explore related aspects of the content

**Output Format:**
Return a JSON object with this exact structure:
{
  "explanation": "Natural language explanation with explicit references to the provided content...",
  "suggestedFollowUps": [
    "Suggested follow-up question 1",
    "Suggested follow-up question 2",
    "Suggested follow-up question 3"
  ]
}

**Important:**
- Be specific and reference exact names, terms, and sections from the content
- The explanation should be comprehensive but focused on answering the user's query
- Suggested follow-ups should help users discover related aspects of the content
- Return ONLY the JSON object, no additional text or markdown formatting`;

    console.log(`[AnswerQuery] Generating explanation`);
    const aiResponse = await callAI(prompt, 8000);

    let parsedResponse: {
      explanation: string;
      suggestedFollowUps: string[];
    };

    try {
      let jsonString = aiResponse.trim();
      jsonString = jsonString
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?\s*```$/i, "");
      
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found in response");
      }
    } catch (parseError) {
      console.warn(`[AnswerQuery] Failed to parse structured response, using fallback format:`, parseError);
      return createMcpResponse(
        `Explanation:\n${aiResponse}\n\nNote: The response could not be parsed into structured format. Please review the explanation above.`
      );
    }

    const formattedResponse = {
      explanation: parsedResponse.explanation,
      suggestedFollowUps: parsedResponse.suggestedFollowUps || [],
    };

    let responseText = `## Explanation\n\n${formattedResponse.explanation}\n\n`;

    if (formattedResponse.suggestedFollowUps.length > 0) {
      responseText += `## Suggested Follow-up Topics\n\n`;
      formattedResponse.suggestedFollowUps.forEach((followUp, index) => {
        responseText += `${index + 1}. ${followUp}\n`;
      });
    }

    console.log(`[AnswerQuery] Generated response with ${formattedResponse.suggestedFollowUps.length} follow-up suggestions`);

    return createMcpResponse(responseText);
  } catch (error) {
    return createMcpResponse(
      `Error answering query: ${formatApiError(error)}`,
      true
    );
  }
}

// ============================================================================
// Conceptual Definition Handler (Semantic Pruning)
// ============================================================================

export async function handleConceptualDefinition(
  args: Record<string, unknown>
): Promise<McpResponse> {
  try {
    const { query, content } = conceptualDefinitionSchema.parse(args);

    console.log(`[ConceptualDefinition] Processing query: "${query}"`);
    console.log(`[ConceptualDefinition] Content length: ${content.length} chars`);

    const prompt = buildConceptualDefinitionPrompt(query, content);

    let aiResponse = await callAI(prompt, 800);
    console.log(`[ConceptualDefinition] Output:\n${aiResponse}`);

    let parsed = parseJsonObject<ConceptualDefinitionPayload>(aiResponse);

    if (!parsed) {
      console.warn(
        `[ConceptualDefinition] First parse failed; retrying with stricter JSON prompt`
      );
      const retryPrompt = buildConceptualDefinitionRetryPrompt(query, content);
      aiResponse = await callAI(retryPrompt, 800);
      console.log(`[ConceptualDefinition] Retry output:\n${aiResponse}`);
      parsed = parseJsonObject<ConceptualDefinitionPayload>(aiResponse);
    }

    if (!parsed) {
      console.warn(
        `[ConceptualDefinition] Retry parse failed; using safe empty structured fallback`
      );
    }

    const normalized = ensureConceptualDefinitionShape(parsed);

    let responseText = `**Conceptual Summary:** ${normalized.summary}\n\n`;
    
    if (normalized.entities.length > 0) {
      responseText += `**Entities:**\n${normalized.entities.map(e => `- ${e}`).join("\\n")}\n\n`;
    }
    
    if (normalized.attributes.length > 0) {
      responseText += `**Attributes:**\n${normalized.attributes.map(a => `- ${a}`).join("\\n")}\n\n`;
    }

    if (normalized.relationships.length > 0) {
      responseText += `**Relationships:**\n${normalized.relationships.map(r => `- ${r}`).join("\\n")}\n`;
    }

    return createMcpResponse(responseText.trim());
  } catch (error) {
    return createMcpResponse(
      `Error creating conceptual definition: ${formatApiError(error)}`,
      true
    );
  }
}

// ============================================================================
// Summarize Content Handler
// ============================================================================

export async function handleSummarizeContent(
  args: Record<string, unknown>
): Promise<McpResponse> {
  try {
    const { content } = summarizeContentSchema.parse(args);

    console.log(`[SummarizeContent] Content length: ${content.length} chars`);

    const prompt = `You are a content analysis assistant. Your task is to produce a concise, structured summary of the provided content.

**Provided Content:**
---
${content}
---

**Instructions:**

1. **Domain Overview:** Identify the domain or subject area the content describes (e.g., "university enrollment system", "e-commerce platform", "healthcare records").

2. **Key Entities:** List the main entities or concepts found in the content. For each, provide a one-line description.

3. **Relationships:** Briefly describe the most important relationships between entities.

4. **Scope & Coverage:** Note what the content covers well and any notable gaps or limitations.

5. **Statistics:** Provide counts where possible (number of entities, relationships, attributes mentioned).

**Output Format:**
Return a JSON object with this exact structure:
{
  "domain": "Short domain description",
  "entityCount": 5,
  "relationshipCount": 8,
  "entities": [
    { "name": "EntityName", "description": "One-line description" }
  ],
  "keyRelationships": [
    "Entity A relates to Entity B via relationship name"
  ],
  "coverage": "Brief note on what the content covers and any gaps",
  "oneLinerSummary": "A single sentence summarizing the entire content"
}

**Important:**
- Use the exact names and terminology from the content
- Be accurate — only include what is actually present in the content
- Return ONLY the JSON object, no additional text or markdown formatting`;

    const aiResponse = await callAI(prompt, 4000);

    let parsed: {
      domain: string;
      entityCount: number;
      relationshipCount: number;
      entities: { name: string; description: string }[];
      keyRelationships: string[];
      coverage: string;
      oneLinerSummary: string;
    };

    try {
      let jsonString = aiResponse.trim();
      jsonString = jsonString
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?\s*```$/i, "");
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found in response");
      }
    } catch {
      console.warn(`[SummarizeContent] Failed to parse structured response, using raw text`);
      return createMcpResponse(aiResponse);
    }

    let responseText = `## Content Summary\n\n`;
    responseText += `**Domain:** ${parsed.domain}\n\n`;
    responseText += `**Overview:** ${parsed.oneLinerSummary}\n\n`;
    responseText += `**Statistics:** ${parsed.entityCount} entities, ${parsed.relationshipCount} relationships\n\n`;

    if (parsed.entities.length > 0) {
      responseText += `### Entities\n\n`;
      parsed.entities.forEach((e) => {
        responseText += `- **${e.name}**: ${e.description}\n`;
      });
      responseText += `\n`;
    }

    if (parsed.keyRelationships.length > 0) {
      responseText += `### Key Relationships\n\n`;
      parsed.keyRelationships.forEach((r) => {
        responseText += `- ${r}\n`;
      });
      responseText += `\n`;
    }

    if (parsed.coverage) {
      responseText += `### Coverage\n\n${parsed.coverage}\n`;
    }

    console.log(`[SummarizeContent] Generated summary: ${parsed.entityCount} entities, ${parsed.relationshipCount} relationships`);
    return createMcpResponse(responseText);
  } catch (error) {
    return createMcpResponse(
      `Error summarizing content: ${formatApiError(error)}`,
      true
    );
  }
}

// ============================================================================
// Explain Mapping Handler
// ============================================================================

export async function handleExplainMapping(
  args: Record<string, unknown>
): Promise<McpResponse> {
  try {
    const { mapping, content } = explainMappingSchema.parse(args);

    console.log(`[ExplainMapping] Mapping length: ${mapping.length} chars`);
    if (content) {
      console.log(`[ExplainMapping] Content length: ${content.length} chars`);
    }

    const contentSection = content
      ? `\n**Project Content (Conceptual Model):**\n---\n${content}\n---\n\nUse this conceptual model to cross-reference the mapping. Explain how physical tables/columns in the mapping correspond to conceptual entities/properties in the model.`
      : "";

    const prompt = `You are an R2RML mapping expert. Your task is to explain the provided R2RML mapping in clear, plain language that someone without RDF/R2RML knowledge can understand.

**R2RML Mapping (Turtle syntax):**
---
${mapping}
---
${contentSection}

**Instructions:**

1. **Overview:** Start with a brief summary of what this mapping does overall — how many tables are mapped, what domain it covers.

2. **TriplesMap Breakdown:** For each TriplesMap (rr:TriplesMap) in the mapping, explain:
   - Which database table it maps from (rr:logicalTable / rr:tableName)
   - What ontology class it maps to (rr:class in rr:subjectMap)
   - How the subject URI is constructed (rr:template)
   - Each predicate-object mapping: which column maps to which ontology property, including any data type or language specifications

3. **Relationships:** Explain any join conditions or reference object maps (rr:parentTriplesMap, rr:joinCondition) — these represent relationships between entities.

4. **Plain Language Summary:** End with a non-technical summary: "In simple terms, this mapping connects [database tables] to [conceptual entities], allowing queries in terms of [domain concepts] rather than raw SQL."

**Output Format:**
Return a JSON object with this exact structure:
{
  "overview": "Brief summary of the entire mapping",
  "triplesMaps": [
    {
      "name": "TriplesMap identifier",
      "sourceTable": "database table name",
      "targetClass": "ontology class name",
      "subjectTemplate": "URI template",
      "properties": [
        { "column": "db_column", "property": "ontology:property", "description": "plain language explanation" }
      ],
      "joins": [
        { "parentMap": "target TriplesMap", "childColumn": "local column", "parentColumn": "remote column", "description": "plain language explanation" }
      ]
    }
  ],
  "plainSummary": "Non-technical summary of the mapping"
}

**Important:**
- Use the exact names from the mapping (table names, column names, URI prefixes)
- Explain technical terms when they first appear
- Make the explanation accessible to non-RDF experts
- Return ONLY the JSON object, no additional text or markdown formatting`;

    const aiResponse = await callAI(prompt, 8000);

    let parsed: {
      overview: string;
      triplesMaps: {
        name: string;
        sourceTable: string;
        targetClass: string;
        subjectTemplate: string;
        properties: { column: string; property: string; description: string }[];
        joins: { parentMap: string; childColumn: string; parentColumn: string; description: string }[];
      }[];
      plainSummary: string;
    };

    try {
      let jsonString = aiResponse.trim();
      jsonString = jsonString
        .replace(/^```(?:json)?\s*\n?/i, "")
        .replace(/\n?\s*```$/i, "");
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON object found in response");
      }
    } catch {
      console.warn(`[ExplainMapping] Failed to parse structured response, using raw text`);
      return createMcpResponse(aiResponse);
    }

    let responseText = `## R2RML Mapping Explanation\n\n`;
    responseText += `**Overview:** ${parsed.overview}\n\n`;

    if (parsed.triplesMaps.length > 0) {
      responseText += `### Mapping Details\n\n`;
      parsed.triplesMaps.forEach((tm, index) => {
        responseText += `#### ${index + 1}. ${tm.name}\n\n`;
        responseText += `- **Source Table:** \`${tm.sourceTable}\`\n`;
        responseText += `- **Maps To Class:** \`${tm.targetClass}\`\n`;
        if (tm.subjectTemplate) {
          responseText += `- **Subject URI:** \`${tm.subjectTemplate}\`\n`;
        }
        responseText += `\n`;

        if (tm.properties.length > 0) {
          responseText += `**Property Mappings:**\n\n`;
          responseText += `| Column | Property | Description |\n`;
          responseText += `|--------|----------|-------------|\n`;
          tm.properties.forEach((p) => {
            responseText += `| \`${p.column}\` | \`${p.property}\` | ${p.description} |\n`;
          });
          responseText += `\n`;
        }

        if (tm.joins.length > 0) {
          responseText += `**Joins / Relationships:**\n\n`;
          tm.joins.forEach((j) => {
            responseText += `- ${j.description} (\`${j.childColumn}\` → \`${j.parentMap}\`.\`${j.parentColumn}\`)\n`;
          });
          responseText += `\n`;
        }
      });
    }

    responseText += `### Plain Language Summary\n\n${parsed.plainSummary}\n`;

    console.log(`[ExplainMapping] Explained ${parsed.triplesMaps.length} TriplesMap(s)`);
    return createMcpResponse(responseText);
  } catch (error) {
    return createMcpResponse(
      `Error explaining mapping: ${formatApiError(error)}`,
      true
    );
  }
}
