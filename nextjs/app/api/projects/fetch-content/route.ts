import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { fetchAndMergeUrls } from "@/lib/url-content";

/**
 * POST /api/projects/fetch-content
 * Standalone endpoint to fetch and merge content from multiple URLs.
 * Used during project creation when no project ID exists yet.
 *
 * Body: { urls: string[] }
 * Returns: { mergedContent, results }
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { urls } = await request.json();

    if (!urls || !Array.isArray(urls)) {
      return NextResponse.json(
        { error: "urls array is required" },
        { status: 400 }
      );
    }

    const validUrls = urls.filter((u: string) => u && u.trim());

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: "At least one valid URL is required" },
        { status: 400 }
      );
    }

    const { mergedContent, results, message } = await fetchAndMergeUrls(validUrls);

    return NextResponse.json({
      success: true,
      message,
      mergedContent,
      results,
    });
  } catch (error) {
    console.error("Error fetching URL content:", error);
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }
}
