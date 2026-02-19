import { query } from "./index";

export interface Project {
  id: string;
  user_id: string;
  name: string;
  urls: string[];
  content: string;
  db_type: string | null;
  db_name: string | null;
  db_host: string | null;
  db_port: number | null;
  db_database: string | null;
  db_user: string | null;
  db_password: string | null;
  db_ssl: boolean;
  db_schema: Record<string, unknown> | null;
  r2rml_mapping: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectInput {
  name: string;
  urls?: string[];
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
}

/**
 * Create a new project for a user
 */
export async function createProject(
  userId: string,
  input: CreateProjectInput
): Promise<Project> {
  const result = await query<Project>(
    `INSERT INTO projects (user_id, name, urls, content, db_type, db_name, db_host, db_port, db_database, db_user, db_password, db_ssl, db_schema, r2rml_mapping)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      userId,
      input.name,
      JSON.stringify(input.urls || []),
      input.content || "",
      input.db_type || null,
      input.db_name || null,
      input.db_host || null,
      input.db_port || null,
      input.db_database || null,
      input.db_user || null,
      input.db_password || null,
      input.db_ssl ?? false,
      input.db_schema ? JSON.stringify(input.db_schema) : null,
      input.r2rml_mapping || null,
    ]
  );
  return result.rows[0];
}

/**
 * Get all projects for a user, ordered by most recently updated
 */
export async function getProjectsByUser(userId: string): Promise<Project[]> {
  const result = await query<Project>(
    `SELECT * FROM projects 
     WHERE user_id = $1 
     ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Get a project by ID (only if owned by user)
 */
export async function getProject(
  projectId: string,
  userId: string
): Promise<Project | null> {
  const result = await query<Project>(
    `SELECT * FROM projects WHERE id = $1 AND user_id = $2`,
    [projectId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Update a project (only if owned by user)
 */
export async function updateProject(
  projectId: string,
  userId: string,
  input: Partial<CreateProjectInput>
): Promise<Project | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 3; // $1 = projectId, $2 = userId

  if (input.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.urls !== undefined) {
    fields.push(`urls = $${paramIndex++}`);
    values.push(JSON.stringify(input.urls));
  }
  if (input.content !== undefined) {
    fields.push(`content = $${paramIndex++}`);
    values.push(input.content);
  }
  if (input.db_type !== undefined) {
    fields.push(`db_type = $${paramIndex++}`);
    values.push(input.db_type || null);
  }
  if (input.db_name !== undefined) {
    fields.push(`db_name = $${paramIndex++}`);
    values.push(input.db_name || null);
  }
  if (input.db_host !== undefined) {
    fields.push(`db_host = $${paramIndex++}`);
    values.push(input.db_host || null);
  }
  if (input.db_port !== undefined) {
    fields.push(`db_port = $${paramIndex++}`);
    values.push(input.db_port || null);
  }
  if (input.db_database !== undefined) {
    fields.push(`db_database = $${paramIndex++}`);
    values.push(input.db_database || null);
  }
  if (input.db_user !== undefined) {
    fields.push(`db_user = $${paramIndex++}`);
    values.push(input.db_user || null);
  }
  if (input.db_password !== undefined) {
    fields.push(`db_password = $${paramIndex++}`);
    values.push(input.db_password || null);
  }
  if (input.db_ssl !== undefined) {
    fields.push(`db_ssl = $${paramIndex++}`);
    values.push(input.db_ssl);
  }
  if (input.db_schema !== undefined) {
    fields.push(`db_schema = $${paramIndex++}`);
    values.push(input.db_schema ? JSON.stringify(input.db_schema) : null);
  }
  if (input.r2rml_mapping !== undefined) {
    fields.push(`r2rml_mapping = $${paramIndex++}`);
    values.push(input.r2rml_mapping || null);
  }

  if (fields.length === 0) return getProject(projectId, userId);

  const result = await query<Project>(
    `UPDATE projects SET ${fields.join(", ")} WHERE id = $1 AND user_id = $2 RETURNING *`,
    [projectId, userId, ...values]
  );
  return result.rows[0] || null;
}

/**
 * Delete a project (only if owned by user)
 */
export async function deleteProject(
  projectId: string,
  userId: string
): Promise<boolean> {
  const result = await query(
    `DELETE FROM projects WHERE id = $1 AND user_id = $2`,
    [projectId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Update a project's content text (only if owned by user)
 */
export async function updateProjectContent(
  projectId: string,
  userId: string,
  content: string
): Promise<Project | null> {
  const result = await query<Project>(
    `UPDATE projects SET content = $3 WHERE id = $1 AND user_id = $2 RETURNING *`,
    [projectId, userId, content]
  );
  return result.rows[0] || null;
}
