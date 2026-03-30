import type { McpResponse } from "../../shared/types.js";
import { callAI } from "../ai/index.js";
import { createMcpResponse, formatApiError } from "../utils.js";
import {
  answerQuerySchema,
  summarizeContentSchema,
  explainMappingSchema,
  compareSchemaMappingSchema,
  suggestQueriesSchema,
} from "./schemas.js";


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

**Output Format:**
Return a JSON object with this exact structure:
{
  "explanation": "Natural language explanation with explicit references to the provided content..."
}

**Important:**
- Be specific and reference exact names, terms, and sections from the content
- The explanation should be comprehensive but focused on answering the user's query
- Return ONLY the JSON object, no additional text or markdown formatting`;

    console.log(`[AnswerQuery] Generating explanation`);
    const aiResponse = await callAI(prompt, 8000);

    let parsedResponse: { explanation: string };

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

    const responseText = `## Explanation\n\n${parsedResponse.explanation}\n`;

    console.log(`[AnswerQuery] Generated explanation`);

    return createMcpResponse(responseText);
  } catch (error) {
    return createMcpResponse(
      `Error answering query: ${formatApiError(error)}`,
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


// ============================================================================
// Compare Schema & Mapping Handler
// ============================================================================

export async function handleCompareSchemaMapping(
  args: Record<string, unknown>
): Promise<McpResponse> {
  try {
    const { ontology, dbSchema, mapping } = compareSchemaMappingSchema.parse(args);

    console.log(`[CompareSchemaMapping] Processing comparison`);

    const prompt = `You are a data integration expert. Your task is to analyze the alignment between a domain ontology (conceptual model), a database schema, and an R2RML mapping that connects them.
    
Identify gaps, unmapped concepts, unmapped tables/columns, and any inconsistencies.

**Domain Ontology:**
---
${ontology}
---

**Database Schema:**
---
${dbSchema}
---

**R2RML Mapping:**
---
${mapping}
---

**Instructions:**
1. **Ontology Coverage:** Which entities or properties in the ontology are NOT mapped?
2. **Schema Coverage:** Which tables or columns in the database are NOT mapped? (Ignore basic audit columns like created_at if obviously irrelevant).
3. **Inconsistencies:** Are there mappings to ontology properties that don't exist? Mappings from DB columns that don't exist? Data type mismatches?

**Output Format:**
Return a JSON object with this exact structure:
{
  "unmappedOntologyConcepts": ["List of conceptual entities/properties not mapped"],
  "unmappedDatabaseElements": ["List of tables/columns not mapped"],
  "inconsistencies": ["List of any errors or mismatches found"],
  "summary": "A brief overall assessment of the mapping completeness and quality"
}

Return ONLY the JSON object, no markdown formatting.`;

    const aiResponse = await callAI(prompt, 8000);

    let parsed: {
      unmappedOntologyConcepts: string[];
      unmappedDatabaseElements: string[];
      inconsistencies: string[];
      summary: string;
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
      console.warn(`[CompareSchemaMapping] Failed to parse structured response, using raw text`);
      return createMcpResponse(aiResponse);
    }

    let responseText = `## Alignment Analysis\n\n**Summary:** ${parsed.summary}\n\n`;

    if (parsed.unmappedOntologyConcepts.length > 0) {
      responseText += `### Unmapped Ontology Concepts\n`;
      parsed.unmappedOntologyConcepts.forEach((item) => {
        responseText += `- ${item}\n`;
      });
      responseText += `\n`;
    }

    if (parsed.unmappedDatabaseElements.length > 0) {
      responseText += `### Unmapped Database Elements\n`;
      parsed.unmappedDatabaseElements.forEach((item) => {
        responseText += `- ${item}\n`;
      });
      responseText += `\n`;
    }

    if (parsed.inconsistencies.length > 0) {
      responseText += `### Mapping Inconsistencies\n`;
      parsed.inconsistencies.forEach((item) => {
        responseText += `- ${item}\n`;
      });
      responseText += `\n`;
    }

    return createMcpResponse(responseText);
  } catch (error) {
    return createMcpResponse(
      `Error comparing schema and mapping: ${formatApiError(error)}`,
      true
    );
  }
}

// ============================================================================
// Suggest Queries Handler
// ============================================================================

export async function handleSuggestQueries(
  args: Record<string, unknown>
): Promise<McpResponse> {
  try {
    const { ontology, dbSchema } = suggestQueriesSchema.parse(args);

    console.log(`[SuggestQueries] Generating suggestions`);

    const dbContext = dbSchema 
      ? `\n**Database Schema (for grounding available data):**\n---\n${dbSchema}\n---`
      : "";

    const prompt = `You are a data analyst assistant. Your task is to generate 5-7 meaningful, natural-language business questions that can be answered using the provided domain ontology.

**Domain Ontology:**
---
${ontology}
---${dbContext}

**Instructions:**
1. Generate natural language questions (e.g. "What is the total revenue by product category?").
2. Ensure the questions only reference entities and properties that exist in the ontology.
3. If a database schema is provided, try to ensure the questions can actually be answered by the available data.
4. Provide a mix of simple lookups, aggregations, and relationship-spanning questions.

**Output Format:**
Return a JSON object with this exact structure:
{
  "suggestions": [
    {
      "question": "The natural language question",
      "rationale": "Why this is a useful question and what entities it uses"
    }
  ]
}

Return ONLY the JSON object, no markdown formatting.`;

    const aiResponse = await callAI(prompt, 6000);

    let parsed: {
      suggestions: { question: string; rationale: string }[];
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
      console.warn(`[SuggestQueries] Failed to parse structured response, using raw text`);
      return createMcpResponse(aiResponse);
    }

    let responseText = `## Suggested Queries\n\nHere are some questions you can ask based on the project's conceptual model:\n\n`;

    parsed.suggestions.forEach((s, i) => {
      responseText += `**${i + 1}. ${s.question}**\n* ${s.rationale}\n\n`;
    });

    return createMcpResponse(responseText);
  } catch (error) {
    return createMcpResponse(
      `Error generating query suggestions: ${formatApiError(error)}`,
      true
    );
  }
}
