import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { fetchAndExtractUrlContent } from "@/lib/url-content";

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

    // Fetch content from each URL in parallel
    const results: Record<
      string,
      { status: "success" | "error"; content?: string; error?: string }
    > = {};
    const successContents: string[] = [];

    await Promise.all(
      validUrls.map(async (url: string) => {
        try {
          const content = await fetchAndExtractUrlContent(url);

          successContents.push(content);
          results[url] = {
            status: "success",
            content:
              content.substring(0, 200) +
              (content.length > 200 ? "..." : ""),
          };
        } catch (error) {
          results[url] = {
            status: "error",
            error:
              error instanceof Error ? error.message : "Failed to fetch URL",
          };
        }
      })
    );

    // Merge all successfully fetched content into one combined string
    const mergedContent = successContents.join("\n\n");

    const successCount = Object.values(results).filter(
      (r) => r.status === "success"
    ).length;
    const errorCount = Object.values(results).filter(
      (r) => r.status === "error"
    ).length;

    return NextResponse.json({
      success: true,
      message: `Fetched and merged content from ${successCount}/${validUrls.length} URL${validUrls.length > 1 ? "s" : ""}${errorCount > 0 ? ` (${errorCount} failed)` : ""}`,
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
