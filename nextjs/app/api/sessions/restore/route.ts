import { NextResponse } from "next/server";
import {
  getSession,
  getSessionMessages,
} from "@/lib/db/sessions";
import { getAuthUserId } from "@/lib/auth-helpers";

/**
 * POST /api/sessions/restore
 * Restore a session: load messages into active context
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await request.json();

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Get session scoped to user
    const session = await getSession(sessionId, userId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get messages
    const messages = await getSessionMessages(sessionId);

    return NextResponse.json({
      session,
      messages,
      success: true,
    });
  } catch (error) {
    console.error("Error restoring session:", error);
    return NextResponse.json(
      {
        error: "Failed to restore session",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
