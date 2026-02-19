import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { validateR2rmlMapping } from "@/lib/r2rml/validate";

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { r2rml_mapping, dbSchema } = body;

    if (!r2rml_mapping || typeof r2rml_mapping !== "string") {
      return NextResponse.json(
        { error: "r2rml_mapping is required and must be a string" },
        { status: 400 }
      );
    }

    const result = await validateR2rmlMapping(r2rml_mapping, dbSchema ?? null);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error validating R2RML mapping:", error);
    return NextResponse.json(
      {
        error: "Failed to validate R2RML mapping",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
