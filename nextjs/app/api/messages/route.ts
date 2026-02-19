import { NextResponse } from "next/server";
import { saveMessage, getSession } from "@/lib/db/sessions";
import { getAuthUserId } from "@/lib/auth-helpers";

/**
 * POST /api/messages
 * Save a message to the database
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId, role, content, attachments, toolsUsed, latency } = await request.json();

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    if (!role || !["user", "assistant"].includes(role)) {
      return NextResponse.json(
        { error: "role must be 'user' or 'assistant'" },
        { status: 400 }
      );
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 }
      );
    }

    // Verify session exists and belongs to this user
    const session = await getSession(sessionId, userId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Save message to database
    const message = await saveMessage(
      sessionId,
      role,
      content,
      attachments,
      toolsUsed,
      latency
    );

    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
      },
    });
  } catch (error) {
    console.error("Error saving message:", error);
    return NextResponse.json(
      {
        error: "Failed to save message",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
