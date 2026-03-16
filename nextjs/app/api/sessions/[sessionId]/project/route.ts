import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { updateSessionProject, getSession } from "@/lib/db/sessions";
import { getProject } from "@/lib/db/projects";

/**
 * PUT /api/sessions/[sessionId]/project
 * Update the project associated with a session.
 * Body: { projectId: string | null }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    const { projectId } = await request.json();

    // Verify session exists and belongs to user
    const session = await getSession(sessionId, userId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // If projectId is provided, verify project exists and belongs to user
    if (projectId !== null && projectId !== undefined) {
      if (typeof projectId !== "string" || !projectId.trim()) {
        return NextResponse.json(
          { error: "projectId must be a non-empty string or null" },
          { status: 400 }
        );
      }

      const project = await getProject(projectId, userId);
      if (!project) {
        return NextResponse.json(
          { error: "Project not found or not owned by user" },
          { status: 404 }
        );
      }
    }

    const updated = await updateSessionProject(sessionId, userId, projectId ?? null);

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to update session project" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      session: updated,
    });
  } catch (error) {
    console.error("Error updating session project:", error);
    return NextResponse.json(
      {
        error: "Failed to update session project",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
