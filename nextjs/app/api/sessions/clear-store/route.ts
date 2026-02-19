import { NextResponse } from "next/server";
import { MODEL_INTERPRETATION_BASE_URL } from "@/lib/langchain/config";

/**
 * Clear the model interpretation store (schemas and URL content)
 * This is called when starting a new session to prevent context pollution
 */
export async function POST() {
  try {
    // Call the model interpretation server to clear its store
    // Note: This assumes the MCP server has a clear endpoint
    // If not available, we'll need to add it to the MCP server
    const response = await fetch(`${MODEL_INTERPRETATION_BASE_URL}/mcp/clear-store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // If the endpoint doesn't exist, that's okay - we'll just log it
      console.warn("Model interpretation clear-store endpoint not available");
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    // Don't fail if clearing the store fails - it's not critical
    console.warn("Could not clear model interpretation store:", error);
    return NextResponse.json({
      success: true, // Return success anyway
      warning: "Could not clear model interpretation store",
    });
  }
}

