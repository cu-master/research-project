import { NextResponse } from "next/server";
import { archiveSession } from "@/lib/db/sessions";
import { getAuthUserId } from "@/lib/auth-helpers";

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

    await archiveSession(sessionId, userId);
    
    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Error archiving session:", error);
    return NextResponse.json(
      {
        error: "Failed to archive session",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
