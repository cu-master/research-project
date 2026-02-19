import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { checkAlignment } from "@/lib/langchain/tools/alignment-check";

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ontologyContent, dbSchema } = body;

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

    const dbSchemaStr =
      typeof dbSchema === "string" ? dbSchema : JSON.stringify(dbSchema, null, 2);

    const result = await checkAlignment(ontologyContent, dbSchemaStr);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error checking alignment:", error);
    return NextResponse.json(
      {
        error: "Failed to check alignment",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
