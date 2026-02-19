import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/**
 * Get the authenticated user's ID from the server-side session.
 * Returns null if the user is not authenticated.
 */
export async function getAuthUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.id || null;
}
