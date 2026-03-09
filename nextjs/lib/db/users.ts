import prisma from "./prisma";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";

export type { User };

/**
 * Create a new user with hashed password
 */
export async function createUser(
  email: string,
  password: string,
  name?: string
): Promise<User> {
  const hashedPassword = await bcrypt.hash(password, 12);
  const result = await prisma.user.create({
    data: {
      email,
      password_hash: hashedPassword,
      name: name || null
    }
  });
  return result;
}

/**
 * Get a user by email address
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await prisma.user.findUnique({
    where: { email }
  });
  return result;
}

/**
 * Verify a password against the stored hash
 */
export async function verifyPassword(
  user: { password_hash: string },
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, user.password_hash);
}

/**
 * Get the user's default project ID
 */
export async function getDefaultProjectId(userId: string): Promise<string | null> {
  const result = await prisma.user.findUnique({
    where: { id: userId },
    select: { default_project_id: true }
  });
  return result?.default_project_id || null;
}

/**
 * Set (or clear) the user's default project
 * Pass null to clear the default project.
 */
export async function setDefaultProjectId(
  userId: string,
  projectId: string | null
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { default_project_id: projectId }
  });
}
