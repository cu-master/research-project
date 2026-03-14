import { NextResponse } from "next/server";
import { getAuthUserId } from "@/lib/auth-helpers";
import {
  createProject,
  getProjectsByUser,
  CreateProjectInput,
} from "@/lib/db/projects";
import { getDefaultProjectId, setDefaultProjectId } from "@/lib/db/users";

export async function GET() {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await getProjectsByUser(userId);
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthUserId();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const input: CreateProjectInput = {
      name: body.name.trim(),
      urls: Array.isArray(body.urls)
        ? body.urls.filter((u: string) => typeof u === "string" && u.trim())
        : [],
      content:
        body.content && typeof body.content === "string"
          ? body.content
          : undefined,
      db_type: body.db_type || undefined,
      db_name: body.db_name || undefined,
      db_host: body.db_host || undefined,
      db_port: body.db_port ? parseInt(body.db_port, 10) : undefined,
      db_database: body.db_database || undefined,
      db_user: body.db_user || undefined,
      db_password: body.db_password || undefined,
      db_ssl: body.db_ssl === true || body.db_ssl === "true",
      db_schema: body.db_schema || undefined,
      r2rml_mapping: body.r2rml_mapping || undefined,
      alignment_result: body.alignment_result || undefined,
    };

    const project = await createProject(userId, input);

    // Auto-set as default project if user doesn't have one yet
    try {
      const currentDefault = await getDefaultProjectId(userId);
      if (!currentDefault) {
        await setDefaultProjectId(userId, project.id);
        console.log(`[Projects] Auto-set project ${project.id} as default for user ${userId}`);
      }
    } catch (error) {
      console.warn("[Projects] Could not auto-set default project:", error);
      // Don't fail the request if this fails
    }

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
