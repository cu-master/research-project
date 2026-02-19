import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { getProject, updateProjectContent } from "@/lib/db/projects";
import { fetchAndExtractUrlContent } from "@/lib/url-content";

/**
 * POST /api/projects/[id]/get-content
 * Fetch content from project URLs, merge into one plain-text string,
 * and store in the project's content column.
 *
 * Accepts optional { urls: string[] } in the body to use form-provided URLs
 * instead of the project's saved URLs.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const project = await getProject(params.id, userId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Read URLs from request body (if provided) or fall back to project's saved URLs
    const body = await request.json().catch(() => ({}));
    const requestUrls: string[] | undefined = body.urls;

    const validUrls = (requestUrls || project.urls || []).filter(
      (u: string) => u && u.trim()
    );

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: "No URLs configured for this project" },
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

    // Merge all successfully fetched content into one plain-text string
    const mergedContent = successContents.join("\n\n");

    // Store the merged content as plain text in the project
    const updated = await updateProjectContent(
      params.id,
      userId,
      mergedContent
    );

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to save content" },
        { status: 500 }
      );
    }

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
    console.error("Error fetching project URL content:", error);
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }
}
