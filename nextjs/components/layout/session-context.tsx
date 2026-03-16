"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { usePathname } from "next/navigation";

interface Session {
  id: string;
  title: string | null;
  created_at: Date;
  updated_at: Date;
  archived_at: Date | null;
  is_archived: boolean;
  message_count: number;
}

interface SessionContextType {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  sessions: Session[];
  setSessions: (sessions: Session[]) => void;
  refreshSessions: () => Promise<void>;
  hasUnsavedWork: boolean;
  setHasUnsavedWork: (has: boolean) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

/**
 * Extract sessionId from pathname like /c/[sessionId]
 */
function extractSessionIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/c\/([^/]+)/);
  return match ? match[1] : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const urlSessionId = extractSessionIdFromPath(pathname);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(urlSessionId);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [hasUnsavedWork, setHasUnsavedWork] = useState(false);

  const refreshSessions = useCallback(async () => {
    try {
      const response = await fetch("/api/sessions?type=active");
      if (response.ok) {
        const data = await response.json();
        setSessions(data.sessions || []);
      }
    } catch (error) {
      console.error("Failed to refresh sessions:", error);
    }
  }, []);

  // Sync with URL path
  useEffect(() => {
    const pathSessionId = extractSessionIdFromPath(pathname);
    if (pathSessionId && pathSessionId !== currentSessionId) {
      // URL has a sessionId, use it
      setCurrentSessionId(pathSessionId);
    } else if (!pathSessionId && currentSessionId) {
      // usePathname() does not update when window.history.replaceState() is used
      // (chat-surface uses replaceState to update the URL bar after session creation
      // without triggering a Next.js navigation). Check the real browser URL before
      // deciding to wipe the session — if the bar already shows /c/..., keep the session.
      const browserSessionId = extractSessionIdFromPath(window.location.pathname);
      if (!browserSessionId) {
        setCurrentSessionId(null);
      }
    }
  }, [pathname, currentSessionId]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  return (
    <SessionContext.Provider
      value={{
        currentSessionId,
        setCurrentSessionId,
        sessions,
        setSessions,
        refreshSessions,
        hasUnsavedWork,
        setHasUnsavedWork,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
