import prisma from "./prisma";
import { Prisma } from "@prisma/client";
import type { Project } from "@prisma/client";

export interface CreateProjectInput {
  name: string;
  urls?: any;
  content?: string;
  db_type?: string;
  db_name?: string;
  db_host?: string;
  db_port?: number;
  db_database?: string;
  db_user?: string;
  db_password?: string;
  db_ssl?: boolean;
  db_schema?: Record<string, unknown> | null;
  r2rml_mapping?: string | null;
  alignment_result?: any;
}

/**
 * Create a new project for a user
 */
export async function createProject(
  userId: string,
  input: CreateProjectInput
): Promise<Project> {
  const result = await prisma.project.create({
    data: {
      name: input.name,
      content: input.content || "",
      db_type: input.db_type || null,
      db_name: input.db_name || null,
      db_host: input.db_host || null,
      db_port: input.db_port || null,
      db_database: input.db_database || null,
      db_user: input.db_user || null,
      db_password: input.db_password || null,
      db_ssl: input.db_ssl ?? false,
      urls: input.urls ? (input.urls as Prisma.InputJsonValue) : Prisma.JsonNull,
      db_schema: input.db_schema ? (input.db_schema as Prisma.InputJsonValue) : Prisma.JsonNull,
      r2rml_mapping: input.r2rml_mapping || null,
      alignment_result: input.alignment_result ? (input.alignment_result as Prisma.InputJsonValue) : Prisma.JsonNull,
      owner: {
        connect: { id: userId }
      }
    }
  });
  return result;
}

/**
 * Get all projects for a user, ordered by most recently updated
 */
export async function getProjectsByUser(userId: string): Promise<Project[]> {
  const result = await prisma.project.findMany({
    where: { user_id: userId },
    orderBy: { updated_at: "desc" }
  });
  return result;
}

/**
 * Get a project by ID (only if owned by user)
 */
export async function getProject(
  projectId: string,
  userId: string
): Promise<Project | null> {
  const result = await prisma.project.findFirst({
    where: { id: projectId, user_id: userId }
  });
  return result;
}

/**
 * Update a project (only if owned by user)
 */
export async function updateProject(
  projectId: string,
  userId: string,
  input: Partial<CreateProjectInput>
): Promise<Project | null> {
  // First, verify the project exists and is owned by the user
  const existing = await prisma.project.findFirst({
    where: { id: projectId, user_id: userId }
  });
  if (!existing) return null;

  const data: Prisma.ProjectUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.urls !== undefined) data.urls = input.urls as Prisma.InputJsonValue;
  if (input.content !== undefined) data.content = input.content;
  if (input.db_type !== undefined) data.db_type = input.db_type;
  if (input.db_name !== undefined) data.db_name = input.db_name;
  if (input.db_host !== undefined) data.db_host = input.db_host;
  if (input.db_port !== undefined) data.db_port = input.db_port;
  if (input.db_database !== undefined) data.db_database = input.db_database;
  if (input.db_user !== undefined) data.db_user = input.db_user;
  if (input.db_password !== undefined) data.db_password = input.db_password;
  if (input.db_ssl !== undefined) data.db_ssl = input.db_ssl;
  if (input.db_schema !== undefined) data.db_schema = input.db_schema ? (input.db_schema as Prisma.InputJsonValue) : Prisma.JsonNull;
  if (input.r2rml_mapping !== undefined) data.r2rml_mapping = input.r2rml_mapping;
  if (input.alignment_result !== undefined) data.alignment_result = input.alignment_result ? (input.alignment_result as Prisma.InputJsonValue) : Prisma.JsonNull;

  if (Object.keys(data).length === 0) return existing;

  const result = await prisma.project.update({
    where: { id: projectId },
    data
  });
  return result;
}

/**
 * Delete a project (only if owned by user)
 */
export async function deleteProject(
  projectId: string,
  userId: string
): Promise<boolean> {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, user_id: userId }
  });
  if (!existing) return false;

  await prisma.project.delete({
    where: { id: projectId }
  });
  return true;
}

/**
 * Update a project's content text (only if owned by user)
 */
export async function updateProjectContent(
  projectId: string,
  userId: string,
  content: string
): Promise<Project | null> {
  const existing = await prisma.project.findFirst({
    where: { id: projectId, user_id: userId }
  });
  if (!existing) return null;

  const result = await prisma.project.update({
    where: { id: projectId },
    data: { content }
  });
  return result;
}

