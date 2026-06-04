"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { usePathname } from "next/navigation";

interface SessionContextType {
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  hasUnsavedWork: boolean;
  setHasUnsavedWork: (has: boolean) => void;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

function extractSessionIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/c\/([^/]+)/);
  return match ? match[1] : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const urlSessionId = extractSessionIdFromPath(pathname);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(urlSessionId);
  const [hasUnsavedWork, setHasUnsavedWork] = useState(false);

  useEffect(() => {
    const pathSessionId = extractSessionIdFromPath(pathname);
    if (pathSessionId && pathSessionId !== currentSessionId) {
      setCurrentSessionId(pathSessionId);
    } else if (!pathSessionId && currentSessionId) {
      // usePathname() doesn't update on history.replaceState (used by chat-surface after
      // session creation). Check window.location before wiping the session.
      const browserSessionId = extractSessionIdFromPath(window.location.pathname);
      if (!browserSessionId) {
        setCurrentSessionId(null);
      }
    }
  }, [pathname, currentSessionId]);

  return (
    <SessionContext.Provider
      value={{
        currentSessionId,
        setCurrentSessionId,
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
