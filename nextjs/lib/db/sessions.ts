import { query } from "./index";

export interface Session {
  id: string;
  title: string | null;
  project_id: string | null;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
  is_archived: boolean;
  message_count: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: any;
  tools_used?: any;
  latency?: number;
  created_at: Date;
}

/**
 * Create a new chat session for a specific user
 */
export async function createSession(userId?: string, projectId?: string): Promise<Session> {
  const result = await query<Session>(
    `INSERT INTO sessions (title, user_id, project_id) 
     VALUES (NULL, $1, $2) 
     RETURNING *`,
    [userId || null, projectId || null]
  );
  return result.rows[0];
}

/**
 * Update the project associated with a session.
 * Only updates if the session belongs to the given user.
 */
export async function updateSessionProject(
  sessionId: string,
  userId: string,
  projectId: string | null
): Promise<Session | null> {
  const result = await query<Session>(
    `UPDATE sessions 
     SET project_id = $1 
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [projectId, sessionId, userId]
  );
  return result.rows[0] || null;
}

/**
 * Get a session by ID (includes archived sessions).
 * If userId is provided, only returns the session if it belongs to that user.
 */
export async function getSession(sessionId: string, userId?: string): Promise<Session | null> {
  if (userId) {
    const result = await query<Session>(
      `SELECT * FROM sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
    return result.rows[0] || null;
  }
  const result = await query<Session>(
    `SELECT * FROM sessions WHERE id = $1`,
    [sessionId]
  );
  return result.rows[0] || null;
}

/**
 * Archive a session
 * Only archives if the session is not already archived and belongs to the user.
 */
export async function archiveSession(sessionId: string, userId?: string): Promise<void> {
  if (userId) {
    await query(
      `UPDATE sessions 
       SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND is_archived = FALSE AND user_id = $2`,
      [sessionId, userId]
    );
  } else {
    await query(
      `UPDATE sessions 
       SET is_archived = TRUE, archived_at = CURRENT_TIMESTAMP 
       WHERE id = $1 AND is_archived = FALSE`,
      [sessionId]
    );
  }
}

/**
 * Get all archived sessions for a user, ordered by most recently archived
 */
export async function getArchivedSessions(limit: number = 50, userId?: string): Promise<Session[]> {
  if (userId) {
    const result = await query<Session>(
      `SELECT * FROM sessions 
       WHERE is_archived = TRUE AND user_id = $2
       ORDER BY archived_at DESC 
       LIMIT $1`,
      [limit, userId]
    );
    return result.rows;
  }
  const result = await query<Session>(
    `SELECT * FROM sessions 
     WHERE is_archived = TRUE 
     ORDER BY archived_at DESC 
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Get all active (non-archived) sessions for a user, ordered by most recently updated
 */
export async function getActiveSessions(limit: number = 50, userId?: string): Promise<Session[]> {
  if (userId) {
    const result = await query<Session>(
      `SELECT * FROM sessions 
       WHERE is_archived = FALSE AND user_id = $2
       ORDER BY updated_at DESC 
       LIMIT $1`,
      [limit, userId]
    );
    return result.rows;
  }
  const result = await query<Session>(
    `SELECT * FROM sessions 
     WHERE is_archived = FALSE 
     ORDER BY updated_at DESC 
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Save a message to the database
 */
export async function saveMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  attachments?: any,
  toolsUsed?: any,
  latency?: number
): Promise<Message> {
  const result = await query<Message>(
    `INSERT INTO messages (session_id, role, content, attachments, tools_used, latency)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      sessionId,
      role,
      content,
      attachments ? JSON.stringify(attachments) : null,
      toolsUsed ? JSON.stringify(toolsUsed) : null,
      latency || null,
    ]
  );
  return result.rows[0];
}

/**
 * Get all messages for a session, ordered by creation time
 */
export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  const result = await query<Message>(
    `SELECT * FROM messages 
     WHERE session_id = $1 
     ORDER BY created_at ASC`,
    [sessionId]
  );
  return result.rows;
}

/**
 * Delete a session and all its messages (only if owned by the user)
 * Messages are automatically deleted due to ON DELETE CASCADE
 */
export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  if (userId) {
    await query(`DELETE FROM sessions WHERE id = $1 AND user_id = $2`, [sessionId, userId]);
  } else {
    await query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
  }
}

