import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import { getProject, updateProjectContent } from "@/lib/db/projects";
import { fetchAndMergeUrls } from "@/lib/url-content";

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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const project = await getProject(id, userId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Read URLs from request body (if provided) or fall back to project's saved URLs
    const body = await request.json().catch(() => ({}));
    const requestUrls: string[] | undefined = body.urls;

    const validUrls = (requestUrls || (project.urls as string[]) || []).filter(
      (u: string) => u && u.trim()
    );

    if (validUrls.length === 0) {
      return NextResponse.json(
        { error: "No URLs configured for this project" },
        { status: 400 }
      );
    }

    const { mergedContent, results, message } = await fetchAndMergeUrls(validUrls);

    // Store the merged content as plain text in the project
    const updated = await updateProjectContent(id, userId, mergedContent);

    if (!updated) {
      return NextResponse.json(
        { error: "Failed to save content" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message,
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
