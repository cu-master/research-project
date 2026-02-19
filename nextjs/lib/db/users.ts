import { query } from "./index";
import bcrypt from "bcryptjs";

export interface User {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  image: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Create a new user with hashed password
 */
export async function createUser(
  email: string,
  password: string,
  name?: string
): Promise<User> {
  const hashedPassword = await bcrypt.hash(password, 12);
  const result = await query<User>(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, hashedPassword, name || null]
  );
  return result.rows[0];
}

/**
 * Get a user by email address
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0] || null;
}

/**
 * Verify a password against the stored hash
 */
export async function verifyPassword(
  user: User,
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

/**
 * Get the user's default project ID
 */
export async function getDefaultProjectId(userId: string): Promise<string | null> {
  const result = await query<{ default_project_id: string | null }>(
    "SELECT default_project_id FROM users WHERE id = $1",
    [userId]
  );
  return result.rows[0]?.default_project_id || null;
}

/**
 * Set (or clear) the user's default project
 * Pass null to clear the default project.
 */
export async function setDefaultProjectId(
  userId: string,
  projectId: string | null
): Promise<void> {
  await query(
    "UPDATE users SET default_project_id = $1 WHERE id = $2",
    [projectId, userId]
  );
}
