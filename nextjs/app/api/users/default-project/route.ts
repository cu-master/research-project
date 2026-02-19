import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { getDefaultProjectId, setDefaultProjectId } from "@/lib/db/users";
import { getProject } from "@/lib/db/projects";

/**
 * GET /api/users/default-project
 * Returns the user's current default project (id + name)
 */
export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projectId = await getDefaultProjectId(userId);

    if (!projectId) {
      return NextResponse.json({ projectId: null, projectName: null });
    }

    // Load the project to get its name
    const project = await getProject(projectId, userId);

    if (!project) {
      // Project was deleted but default_project_id wasn't cleared (shouldn't happen with ON DELETE SET NULL)
      return NextResponse.json({ projectId: null, projectName: null });
    }

    return NextResponse.json({
      projectId: project.id,
      projectName: project.name,
    });
  } catch (error) {
    console.error("Error getting default project:", error);
    return NextResponse.json(
      { error: "Failed to get default project" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/users/default-project
 * Sets (or clears) the user's default project.
 * Body: { projectId: string | null }
 */
export async function PUT(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await request.json();

    // Allow null to clear the default project
    if (projectId === null) {
      await setDefaultProjectId(userId, null);
      return NextResponse.json({
        success: true,
        projectId: null,
        projectName: null,
      });
    }

    // Validate projectId is a string
    if (typeof projectId !== "string" || !projectId.trim()) {
      return NextResponse.json(
        { error: "projectId must be a non-empty string or null" },
        { status: 400 }
      );
    }

    // Verify the project belongs to this user
    const project = await getProject(projectId, userId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found or not owned by user" },
        { status: 404 }
      );
    }

    await setDefaultProjectId(userId, projectId);

    return NextResponse.json({
      success: true,
      projectId: project.id,
      projectName: project.name,
    });
  } catch (error) {
    console.error("Error setting default project:", error);
    return NextResponse.json(
      { error: "Failed to set default project" },
      { status: 500 }
    );
  }
}
