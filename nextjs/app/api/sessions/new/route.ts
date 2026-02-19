import { NextResponse } from "next/server";
import { createSession } from "@/lib/db/sessions";
import { getAuthUserId } from "@/lib/auth-helpers";
import { getDefaultProjectId } from "@/lib/db/users";

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Read optional projectId from body; fall back to user's default project
    let projectId: string | null = null;
    try {
      const body = await request.json();
      projectId = body.projectId || null;
    } catch {
      // Body may be empty for backward compatibility
    }

    if (!projectId) {
      try {
        projectId = await getDefaultProjectId(userId);
      } catch (error) {
        console.warn("[SESSION] Could not load default project:", error);
      }
    }

    console.log("[SESSION] Creating new session for user:", userId, "project:", projectId);
    const session = await createSession(userId, projectId || undefined);
    console.log(`[SESSION] ✓ Session created with ID: ${session.id}`);
    
    return NextResponse.json({
      sessionId: session.id,
      projectId: session.project_id || null,
      success: true,
    });
  } catch (error) {
    console.error("[SESSION] ✗ Error creating new session:", error);
    console.error("[SESSION] Error details:", {
      name: error instanceof Error ? error.name : "Unknown",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "Failed to create new session",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
