import { NextResponse } from "next/server";
import { deleteSession, getSession } from "@/lib/db/sessions";
import { getAuthUserId } from "@/lib/auth-helpers";

export async function DELETE(
  request: Request,
  { params }: { params: { sessionId: string } }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = params;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID is required" },
        { status: 400 }
      );
    }

    // Check if session exists AND belongs to this user
    const session = await getSession(sessionId, userId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Delete the session (messages are automatically deleted due to CASCADE)
    await deleteSession(sessionId, userId);

    return NextResponse.json({ 
      success: true,
      message: "Session deleted successfully" 
    });
  } catch (error) {
    console.error("Error deleting session:", error);
    return NextResponse.json(
      {
        error: "Failed to delete session",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
