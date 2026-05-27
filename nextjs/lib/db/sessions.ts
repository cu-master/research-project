import prisma from "./prisma";
import { Prisma } from "@prisma/client";
import type { Session, Message } from "@prisma/client";

export async function createSession(userId?: string, projectId?: string): Promise<Session> {
  const data: Prisma.SessionCreateInput = {};
  if (userId) {
    data.user = { connect: { id: userId } };
  }
  if (projectId) {
    data.project = { connect: { id: projectId } };
  }

  const result = await prisma.session.create({ data });
  return result;
}

// Only updates if the session belongs to the given user.
export async function updateSessionProject(
  sessionId: string,
  userId: string,
  projectId: string | null
): Promise<Session | null> {
  const existing = await prisma.session.findFirst({
    where: { id: sessionId, user_id: userId }
  });
  if (!existing) return null;

  const data: Prisma.SessionUpdateInput = {};
  if (projectId) {
    data.project = { connect: { id: projectId } };
  } else {
    data.project = { disconnect: true };
  }

  const result = await prisma.session.update({
    where: { id: sessionId },
    data
  });
  return result;
}

// Includes archived sessions. If userId is provided, only returns the session if it belongs to that user.
export async function getSession(sessionId: string, userId?: string): Promise<Session | null> {
  const where: Prisma.SessionWhereInput = { id: sessionId };
  if (userId) {
    where.user_id = userId;
  }

  const result = await prisma.session.findFirst({ where });
  return result;
}

// Only archives if not already archived and belongs to the user (or is a global query).
export async function archiveSession(sessionId: string, userId?: string): Promise<void> {
  const where: Prisma.SessionWhereInput = { id: sessionId, is_archived: false };
  if (userId) {
    where.user_id = userId;
  }

  const existing = await prisma.session.findFirst({ where });
  if (existing) {
    await prisma.session.update({
      where: { id: sessionId },
      data: { is_archived: true, archived_at: new Date() }
    });
  }
}

export async function getArchivedSessions(limit: number = 50, userId?: string): Promise<Session[]> {
  const where: Prisma.SessionWhereInput = { is_archived: true };
  if (userId) {
    where.user_id = userId;
  }

  const result = await prisma.session.findMany({
    where,
    orderBy: [{ archived_at: 'desc' }, { id: 'desc' }],
    take: limit
  });
  return result;
}

export async function getActiveSessions(limit: number = 50, userId?: string): Promise<Session[]> {
  const where: Prisma.SessionWhereInput = { is_archived: false };
  if (userId) {
    where.user_id = userId;
  }

  const result = await prisma.session.findMany({
    where,
    orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
    take: limit
  });
  return result;
}

export async function saveMessage(
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  attachments?: any,
  toolsUsed?: any,
  latency?: number
): Promise<Message> {
  const msg = await prisma.message.create({
    data: {
      session_id: sessionId,
      role,
      content,
      attachments: attachments ? (attachments as Prisma.InputJsonValue) : Prisma.JsonNull,
      tools_used: toolsUsed ? (toolsUsed as Prisma.InputJsonValue) : Prisma.JsonNull,
      latency: latency || null
    }
  });

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { _count: { select: { messages: true } } }
  });

  if (session) {
    const updateData: Prisma.SessionUpdateInput = {
      updated_at: new Date(),
      message_count: session._count.messages,
    };

    // Auto-generate title from the first real user message.
    if (role === "user" && content && (!session.title || session.title.trim() === "" || session.title === "New Chat")) {
      updateData.title = content.length > 50 ? content.substring(0, 50) + "..." : content;
    }

    await prisma.session.update({
      where: { id: sessionId },
      data: updateData
    });
  }

  return msg;
}

export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  const result = await prisma.message.findMany({
    where: { session_id: sessionId },
    orderBy: { created_at: "asc" }
  });
  return result;
}

// Messages are deleted via ON DELETE CASCADE. Only deletes if owned by the user.
export async function deleteSession(sessionId: string, userId?: string): Promise<void> {
  const where: Prisma.SessionWhereInput = { id: sessionId };
  if (userId) {
    where.user_id = userId;
  }

  const existing = await prisma.session.findFirst({ where });
  if (existing) {
    await prisma.session.delete({
      where: { id: sessionId }
    });
  }
}
