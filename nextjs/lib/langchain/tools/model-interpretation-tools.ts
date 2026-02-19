import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { callModelInterpretationTool } from "../clients";
import { getLangChainRequestContext } from "../request-context";
import { getProject } from "@/lib/db/projects";

// ============================================================================
// Shared helper: load and validate project content
// ============================================================================

async function loadProjectContent(): Promise<
  { project: Awaited<ReturnType<typeof getProject>>; error?: undefined } | { project?: undefined; error: string }
> {
  const { projectId, userId } = getLangChainRequestContext();

  if (!projectId || !userId) {
    return { error: "No project context available. Please make sure a project is selected for this session." };
  }

  const project = await getProject(projectId, userId);
  if (!project) {
    return { error: `Project ${projectId} not found.` };
  }

  return { project };
}

// ============================================================================
// Answer Query
// ============================================================================

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
    if (result.error) return `Error: ${result.error}`;
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
      "Answers questions about the project's URL content (conceptual models, documentation, schemas, etc.). Uses the project's URL content as context to generate comprehensive explanations with suggested follow-up topics.",
    schema: answerQuerySchema,
  }
);

// ============================================================================
// Summarize Content
// ============================================================================

export const summarizeContentTool = tool(
  async () => {
    const result = await loadProjectContent();
    if (result.error) return `Error: ${result.error}`;
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

// ============================================================================
// Explain Mapping
// ============================================================================

export const explainMappingTool = tool(
  async () => {
    const result = await loadProjectContent();
    if (result.error) return `Error: ${result.error}`;
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
