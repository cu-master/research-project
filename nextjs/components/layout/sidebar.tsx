"use client";

import { PencilSquareIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon, XMarkIcon, FolderIcon, ArrowRightOnRectangleIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import Link from "next/link";
import { useSidebar } from "./sidebar-context";
import { useSession } from "./session-context";
import { useSession as useAuthSession, signOut } from "next-auth/react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

export default function Sidebar() {
  const { isCollapsed, toggle } = useSidebar();
  const {
    currentSessionId,
    setCurrentSessionId,
    refreshSessions,
    hasUnsavedWork,
  } = useSession();
  const { data: authSession } = useAuthSession();
  const [archivedSessions, setArchivedSessions] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [deleteConfirmSession, setDeleteConfirmSession] = useState<string | null>(null);
  const router = useRouter();

  const userName = authSession?.user?.name || authSession?.user?.email?.split("@")[0] || "User";
  const userInitial = userName.charAt(0).toUpperCase();

  // Track which sessions the user actually sent messages in during this page session.
  // Prevents handleNewChat from archiving sessions the user was merely viewing.
  const sessionsWithActivity = useRef(new Set<string>());

  const handleNewChat = async () => {
    // Check for unsaved work
    if (hasUnsavedWork && currentSessionId) {
      const confirmed = window.confirm(
        "You have an active query. Are you sure you want to start over?"
      );
      if (!confirmed) {
        return;
      }
    }

    // Clear UI immediately so the chat surface resets without waiting for network
    const sessionIdToArchive = currentSessionId;
    router.replace("/", { scroll: false });
    setCurrentSessionId(null);

    // Run cleanup in the background — do not await before clearing UI
    (async () => {
      try {
        let shouldRefreshSessions = false;

        // Archive current session only if the user actually sent messages in it
        // (not if they were merely viewing an old session from history)
        if (sessionIdToArchive && sessionsWithActivity.current.has(sessionIdToArchive)) {
          const sessionResponse = await fetch(`/api/sessions?sessionId=${sessionIdToArchive}`);
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            const session = sessionData.session;
            const messages = sessionData.messages || [];

            if (session && !session.is_archived && messages.length > 0) {
              await fetch("/api/sessions/archive", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sessionId: sessionIdToArchive }),
              });
              shouldRefreshSessions = true;
            }
          }
          sessionsWithActivity.current.delete(sessionIdToArchive);
        }

        // Clear the model interpretation store
        await fetch("/api/sessions/clear-store", { method: "POST" });

        if (shouldRefreshSessions) {
          await refreshSessions();
          await loadAllSessions();
        }
      } catch (error) {
        console.error("Failed to reset chat:", error);
      }
    })();
  };

  // Load both active and archived sessions
  const loadAllSessions = useCallback(async () => {
    try {
      // Load active sessions
      const activeResponse = await fetch("/api/sessions?type=active");
      if (activeResponse.ok) {
        const activeData = await activeResponse.json();
        setActiveSessions(activeData.sessions || []);
      }

      // Load archived sessions
      const archivedResponse = await fetch("/api/sessions?type=archived");
      if (archivedResponse.ok) {
        const archivedData = await archivedResponse.json();
        setArchivedSessions(archivedData.sessions || []);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }, []);

  // Load sessions on mount
  useEffect(() => {
    loadAllSessions();
  }, [loadAllSessions]);

  // Refresh sessions when currentSessionId changes (new session created or switched)
  useEffect(() => {
    if (currentSessionId) {
      // Small delay to ensure database has been updated with messages
      const timer = setTimeout(() => {
        loadAllSessions();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentSessionId, loadAllSessions]);

  // Listen for session update events from chat surface
  useEffect(() => {
    const handleSessionUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.sessionId) {
        sessionsWithActivity.current.add(detail.sessionId);
      }
      loadAllSessions();
    };

    window.addEventListener('sessionUpdated', handleSessionUpdate);
    return () => {
      window.removeEventListener('sessionUpdated', handleSessionUpdate);
    };
  }, [loadAllSessions]);

  const handleSessionClick = async (sessionId: string) => {
    if (hasUnsavedWork && currentSessionId && currentSessionId !== sessionId) {
      const confirmed = window.confirm(
        "You have an active query. Are you sure you want to switch sessions?"
      );
      if (!confirmed) {
        return;
      }
    }

    try {
      // Restore session: load messages
      const response = await fetch("/api/sessions/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (response.ok) {
        // Session restored successfully
        setCurrentSessionId(sessionId);
        // Navigate to /c/[sessionId] (replace to avoid back button issues)
        router.replace(`/c/${sessionId}`, { scroll: false });
      } else {
        console.error("Failed to restore session");
        // Still switch to the session even if restore fails
        setCurrentSessionId(sessionId);
        router.replace(`/c/${sessionId}`, { scroll: false });
      }
    } catch (error) {
      console.error("Error restoring session:", error);
      // Still switch to the session even if restore fails
      setCurrentSessionId(sessionId);
      router.replace(`/c/${sessionId}`, { scroll: false });
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation(); // Prevent session click
    setDeleteConfirmSession(sessionId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmSession) return;

    const sessionIdToDelete = deleteConfirmSession;
    const isActiveSession = currentSessionId === sessionIdToDelete;

    try {
      const response = await fetch(`/api/sessions/${sessionIdToDelete}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // If deleting the active session, clear chat and reset to new chat state
        if (isActiveSession) {
          // Clear the model interpretation store
          await fetch("/api/sessions/clear-store", {
            method: "POST",
          });

          // Clear current session
          setCurrentSessionId(null);
          router.replace("/", { scroll: false });
        }

        // Refresh sessions list
        await loadAllSessions();
        await refreshSessions();
      } else {
        const error = await response.json();
        console.error("Failed to delete session:", error);
        alert("Failed to delete session. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting session:", error);
      alert("Failed to delete session. Please try again.");
    } finally {
      setDeleteConfirmSession(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmSession(null);
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 hidden flex-col bg-gray-50 text-gray-900 border-r border-gray-200 md:flex transition-all duration-300 ease-in-out overflow-x-hidden ${isCollapsed ? "w-16" : "w-64"
        }`}
    >
      {/* New Chat & Projects navigation */}
      <div className="px-2 pt-3 pb-1 flex flex-col gap-0.5">
        <button
          onClick={handleNewChat}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200/50 hover:text-gray-900 ${isCollapsed ? "justify-center" : ""
            }`}
          title="New chat"
        >
          <PencilSquareIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
          {!isCollapsed && <span>New chat</span>}
        </button>
        <Link
          href={"/projects" as any}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200/50 hover:text-gray-900 ${isCollapsed ? "justify-center" : ""
            }`}
          title="Projects"
        >
          <FolderIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
          {!isCollapsed && <span>Projects</span>}
        </Link>
        <Link
          href={"/agent" as any}
          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200/50 hover:text-gray-900 ${isCollapsed ? "justify-center" : ""
            }`}
          title="Agent settings"
        >
          <CpuChipIcon className="h-4 w-4 text-gray-500 flex-shrink-0" />
          {!isCollapsed && <span>Agent</span>}
        </Link>
      </div>

      {/* Chat history */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!isCollapsed && (activeSessions.length > 0 || archivedSessions.length > 0) && (
          <div className="mb-4 px-2 text-xs font-semibold text-gray-500">
            Your Chats
          </div>
        )}
        <div className="flex flex-col gap-1">
          {/* Show active sessions first */}
          {activeSessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-1 rounded-lg transition-colors ${currentSessionId === session.id
                  ? "bg-gray-200/70"
                  : "hover:bg-gray-200/50"
                }`}
            >
              <button
                onClick={() => handleSessionClick(session.id)}
                className={`flex flex-1 items-center rounded-lg px-3 py-2.5 text-sm text-gray-700 hover:text-gray-900 min-w-0 ${isCollapsed ? "justify-center" : ""
                  } ${currentSessionId === session.id
                    ? "font-medium"
                    : ""
                  }`}
                title={session.title || "Untitled Chat"}
              >
                {!isCollapsed && (
                  <span className="truncate min-w-0">
                    {session.title || "Untitled Chat"}
                  </span>
                )}
              </button>
              {!isCollapsed && (
                <button
                  onClick={(e) => handleDeleteClick(e, session.id)}
                  className="flex items-center justify-center rounded-lg p-2 text-gray-400 opacity-0 transition-opacity hover:bg-gray-300/50 hover:text-red-600 group-hover:opacity-100"
                  title="Delete chat"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {/* Show archived sessions */}
          {archivedSessions.map((session) => (
            <div
              key={session.id}
              className={`group flex items-center gap-1 rounded-lg transition-colors ${currentSessionId === session.id
                  ? "bg-gray-200/70"
                  : "hover:bg-gray-200/50"
                }`}
            >
              <button
                onClick={() => handleSessionClick(session.id)}
                className={`flex flex-1 items-center rounded-lg px-3 py-2.5 text-sm text-gray-700 hover:text-gray-900 min-w-0 ${isCollapsed ? "justify-center" : ""
                  } ${currentSessionId === session.id
                    ? "font-medium"
                    : ""
                  }`}
                title={session.title || "Untitled Chat"}
              >
                {!isCollapsed && (
                  <span className="truncate min-w-0">
                    {session.title || "Untitled Chat"}
                  </span>
                )}
              </button>
              {!isCollapsed && (
                <button
                  onClick={(e) => handleDeleteClick(e, session.id)}
                  className="flex items-center justify-center rounded-lg p-2 text-gray-400 opacity-0 transition-opacity hover:bg-gray-300/50 hover:text-red-600 group-hover:opacity-100"
                  title="Delete chat"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          {activeSessions.length === 0 && archivedSessions.length === 0 && !isCollapsed && (
            <div className="px-3 py-2 text-xs text-gray-400">
              No chat history yet
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Delete Chat
              </h3>
              <button
                onClick={handleDeleteCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <p className="text-gray-700 mb-6">
              Are you sure you want to delete this chat? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDeleteCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer with user and collapse button */}
      <div className="border-t border-gray-200 p-4">
        {!isCollapsed ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm flex-1 min-w-0">
                <div className="h-8 w-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold shadow-sm flex-shrink-0">
                  {userInitial}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-gray-900 truncate">{userName}</span>
                  {authSession?.user?.email && (
                    <span className="text-xs text-gray-500 truncate">{authSession.user.email}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={toggle}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold shadow-sm cursor-pointer" title={userName}>
              {userInitial}
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
            </button>
            <button
              onClick={toggle}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
              aria-label="Expand sidebar"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
