import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { generateR2rmlMappingTool } from "@/lib/langchain/tools/r2rml-mapping-tool";
import { updateProject } from "@/lib/db/projects";

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ontologyContent, dbSchema, projectId } = body;

    if (!ontologyContent || typeof ontologyContent !== "string") {
      return NextResponse.json(
        { error: "ontologyContent is required and must be a string" },
        { status: 400 }
      );
    }

    if (!dbSchema) {
      return NextResponse.json(
        { error: "dbSchema is required" },
        { status: 400 }
      );
    }

    // Convert dbSchema to a formatted string for the LLM
    const dbSchemaStr =
      typeof dbSchema === "string" ? dbSchema : JSON.stringify(dbSchema, null, 2);

    // Invoke the LangChain R2RML generation tool
    const resultStr = await generateR2rmlMappingTool.invoke({
      ontologyContent,
      dbSchema: dbSchemaStr,
    });

    let result: { success: boolean; r2rml_mapping?: string; error?: string; raw?: string };
    try {
      const parsed = JSON.parse(resultStr);
      if (typeof parsed !== "object" || parsed === null || typeof parsed.success !== "boolean") {
        throw new Error("Unexpected result shape");
      }
      result = parsed;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse R2RML generation result", raw: resultStr },
        { status: 500 }
      );
    }

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "R2RML generation failed", raw: result.raw },
        { status: 500 }
      );
    }

    // If projectId is provided, auto-save the mapping to the project
    if (projectId && typeof projectId === "string") {
      try {
        await updateProject(projectId, userId, {
          r2rml_mapping: result.r2rml_mapping || null,
        });
      } catch (saveError) {
        console.error("Failed to auto-save R2RML mapping to project:", saveError);
        // Don't fail the request — still return the generated mapping
      }
    }

    return NextResponse.json({
      success: true,
      r2rml_mapping: result.r2rml_mapping,
    });
  } catch (error) {
    console.error("Error generating R2RML mapping:", error);
    return NextResponse.json(
      {
        error: "Failed to generate R2RML mapping",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
