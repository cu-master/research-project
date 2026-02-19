import { NextResponse } from "next/server";
import {
  getActiveSessions,
  getArchivedSessions,
  getSession,
  getSessionMessages,
} from "@/lib/db/sessions";
import { getAuthUserId } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "active"; // 'active' or 'archived'
    const sessionId = searchParams.get("sessionId");

    // If sessionId is provided, return messages for that session
    if (sessionId) {
      const session = await getSession(sessionId, userId);
      if (!session) {
        return NextResponse.json(
          { error: "Session not found" },
          { status: 404 }
        );
      }

      const messages = await getSessionMessages(sessionId);
      return NextResponse.json({
        session,
        messages,
      });
    }

    // Otherwise, return list of sessions scoped to the user
    if (type === "archived") {
      const sessions = await getArchivedSessions(50, userId);
      return NextResponse.json({ sessions });
    } else {
      const sessions = await getActiveSessions(50, userId);
      return NextResponse.json({ sessions });
    }
  } catch (error) {
    console.error("Error fetching sessions:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch sessions",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
