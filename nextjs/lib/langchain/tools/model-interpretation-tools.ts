import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { callModelInterpretationTool } from "../clients";
import { getLangChainRequestContext } from "../request-context";
import { getProject } from "@/lib/db/projects";

type ProjectResult =
  | { ok: true; project: NonNullable<Awaited<ReturnType<typeof getProject>>> }
  | { ok: false; error: string };

async function loadProjectContent(): Promise<ProjectResult> {
  const { projectId, userId } = getLangChainRequestContext();

  if (!projectId || !userId) {
    return { ok: false, error: "No project context available. Please make sure a project is selected for this session." };
  }

  const project = await getProject(projectId, userId);
  if (!project) {
    return { ok: false, error: `Project ${projectId} not found.` };
  }

  return { ok: true, project };
}

const answerQuerySchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "The user's question to answer using the project's URL content as context."
    ),
});

export const answerQueryTool = tool(
  async ({ query }: z.infer<typeof answerQuerySchema>) => {
    const result = await loadProjectContent();
    if (!result.ok) return `Error: ${result.error}`;
    const { project } = result;

    if (!project.content || !project.content.trim()) {
      return "Error: The project has no URL content. Please add URLs to the project first.";
    }

    return await callModelInterpretationTool("answer-query", {
      query,
      content: project.content,
    });
  },
  {
    name: "answer_query",
    description:
      "Answers questions about the project's URL content (conceptual models, documentation, schemas, etc.). Uses the project's URL content as context to generate comprehensive explanations.",
    schema: answerQuerySchema,
  }
);

export const summarizeContentTool = tool(
  async () => {
    const result = await loadProjectContent();
    if (!result.ok) return `Error: ${result.error}`;
    const { project } = result;

    if (!project.content || !project.content.trim()) {
      return "Error: The project has no URL content. Please add URLs to the project first.";
    }

    return await callModelInterpretationTool("summarize-content", {
      content: project.content,
    });
  },
  {
    name: "summarize_content",
    description:
      "Generates a structured summary of the project's URL content: domain overview, entity/relationship counts, key entities, important relationships, and coverage. Use when the user asks for an overview or summary of their project content.",
    schema: z.object({}),
  }
);

export const explainMappingTool = tool(
  async () => {
    const result = await loadProjectContent();
    if (!result.ok) return `Error: ${result.error}`;
    const { project } = result;

    if (!project.r2rml_mapping || !project.r2rml_mapping.trim()) {
      return "Error: The project has no R2RML mapping. Please add an R2RML mapping to the project first.";
    }

    return await callModelInterpretationTool("explain-mapping", {
      mapping: project.r2rml_mapping,
      content: project.content?.trim() ? project.content : undefined,
    });
  },
  {
    name: "explain_mapping",
    description:
      "Explains the project's R2RML mapping in plain, non-technical language. Breaks down each TriplesMap showing which database tables map to which ontology classes, how columns map to properties, and how joins represent relationships. Use when the user wants to understand their R2RML mapping.",
    schema: z.object({}),
  }
);

export const compareSchemaMappingTool = tool(
  async () => {
    const result = await loadProjectContent();
    if (!result.ok) return `Error: ${result.error}`;
    const { project } = result;

    if (!project.content || !project.content.trim()) {
      return "Error: The project has no ontology/conceptual content. Please add URLs or upload files to the project first.";
    }

    const dbSchemaStr = project.db_schema ? JSON.stringify(project.db_schema) : "";
    if (!dbSchemaStr || dbSchemaStr === "[]" || dbSchemaStr === "null") {
      return "Error: The project has no database schema fetched. Please fetch the actual schema first in the settings.";
    }

    if (!project.r2rml_mapping || !project.r2rml_mapping.trim()) {
      return "Error: The project has no R2RML mapping to evaluate. Please generate one first.";
    }

    return await callModelInterpretationTool("compare-schema-mapping", {
      ontology: project.content,
      dbSchema: dbSchemaStr,
      mapping: project.r2rml_mapping,
    });
  },
  {
    name: "compare_schema_mapping",
    description:
      "Analyzes the completeness and correctness of the project's R2RML mapping by comparing it against the domain ontology and the database schema. Identifies unmapped concepts, unmapped tables, and mapping errors/inconsistencies. Use this when the user asks to check, review, or find gaps in their mapping.",
    schema: z.object({}),
  }
);

export const suggestQueriesTool = tool(
  async () => {
    const result = await loadProjectContent();
    if (!result.ok) return `Error: ${result.error}`;
    const { project } = result;

    if (!project.content || !project.content.trim()) {
      return "Error: The project has no ontology/conceptual content to base questions on.";
    }

    const dbSchemaStr = project.db_schema ? JSON.stringify(project.db_schema) : "";
    const dbSchema = dbSchemaStr && dbSchemaStr !== "[]" && dbSchemaStr !== "null"
      ? dbSchemaStr 
      : undefined;

    return await callModelInterpretationTool("suggest-queries", {
      ontology: project.content,
      dbSchema,
    });
  },
  {
    name: "suggest_queries",
    description:
      "Generates 5-7 meaningful, natural-language business questions that can be answered using the given ontology (and optionally filters based on the available database schema). Use this when the user asks 'what can I ask?', 'suggest questions', or wants examples of what the system can do.",
    schema: z.object({}),
  }
);
