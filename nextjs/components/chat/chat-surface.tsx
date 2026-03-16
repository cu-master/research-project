"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment, Message, ToolCall } from "@/types/chat";
import MessageBubble from "./message-bubble";
import ChatInput from "./chat-input";
import ProjectSelector from "./project-selector";

import { useSession } from "@/components/layout/session-context";

interface ChatSurfaceProps {
  sessionId?: string;
}

type ChatProgressEvent =
  | { type: "tool_start"; tool: string; label: string }
  | { type: "tool_end"; tool: string; result: string }
  | { type: "text_chunk"; content: string }
  | { type: "done"; response: string; toolsUsed?: ToolCall[]; latency?: number }
  | { type: "error"; message: string };

export default function ChatSurface({ sessionId: sessionIdProp }: ChatSurfaceProps) {
  const {
    currentSessionId,
    setCurrentSessionId,
    setHasUnsavedWork,
    refreshSessions,
  } = useSession();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [sessionProjectId, setSessionProjectId] = useState<string | null>(null);

  // Load the user's default project (used when no session exists yet)
  const loadDefaultProject = useCallback(async () => {
    try {
      const response = await fetch("/api/users/default-project");
      if (response.ok) {
        const data = await response.json();
        if (data.projectId) {
          setSessionProjectId(data.projectId);
        }
      }
    } catch (error) {
      console.error("Failed to load default project:", error);
    }
  }, []);

  // Initialize session on mount from prop (URL param via Next.js dynamic route)
  useEffect(() => {
    if (sessionIdProp) {
      setCurrentSessionId(sessionIdProp);
    } else {
      // No session -- load the user's default project for the selector
      loadDefaultProject();
    }
    setIsInitializing(false);
  }, [sessionIdProp, setCurrentSessionId, loadDefaultProject]);

  // Reset messages immediately when session is cleared (New Chat clicked)
  useEffect(() => {
    if (!currentSessionId) {
      // Immediately clear messages when session is null
      setMessages([]);
      setError(null);
      setHasUnsavedWork(false);
      setIsLoading(false);
      // Reload default project for the selector
      loadDefaultProject();
      // Cancel any ongoing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      return;
    }
  }, [currentSessionId, loadDefaultProject, setHasUnsavedWork]);

  // Load messages when session changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!currentSessionId) {
        return;
      }

      // Don't load if we're still initializing or sending a message
      if (isInitializing || isSendingMessage) {
        return;
      }

      try {
        // Use restore endpoint which loads messages
        const response = await fetch("/api/sessions/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: currentSessionId }),
        });

        if (response.ok) {
          const data = await response.json();

          // Set the session's project_id
          if (data.session) {
            setSessionProjectId(data.session.project_id || null);
          }

          if (data.messages && data.messages.length > 0) {
            // Convert database messages to UI messages
            const uiMessages: Message[] = data.messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              createdAt: new Date(msg.created_at).getTime(),
              attachments: msg.attachments 
                ? (typeof msg.attachments === 'string' ? JSON.parse(msg.attachments) : msg.attachments)
                : undefined,
              toolsUsed: msg.tools_used 
                ? (typeof msg.tools_used === 'string' ? JSON.parse(msg.tools_used) : msg.tools_used)
                : undefined,
              latency: msg.latency ? parseFloat(msg.latency) : undefined,
            }));
            setMessages(uiMessages);
          } else {
            setMessages([]);
          }
        } else {
          // Fallback to regular session endpoint if restore fails
          const fallbackResponse = await fetch(
            `/api/sessions?sessionId=${currentSessionId}`
          );
          if (fallbackResponse.ok) {
            const fallbackData = await fallbackResponse.json();

            if (fallbackData.session) {
              setSessionProjectId(fallbackData.session.project_id || null);
            }

            if (fallbackData.messages && fallbackData.messages.length > 0) {
              const uiMessages: Message[] = fallbackData.messages.map((msg: any) => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                createdAt: new Date(msg.created_at).getTime(),
                attachments: msg.attachments 
                  ? (typeof msg.attachments === 'string' ? JSON.parse(msg.attachments) : msg.attachments)
                  : undefined,
                toolsUsed: msg.tools_used 
                  ? (typeof msg.tools_used === 'string' ? JSON.parse(msg.tools_used) : msg.tools_used)
                  : undefined,
                latency: msg.latency ? parseFloat(msg.latency) : undefined,
              }));
              setMessages(uiMessages);
            } else {
              setMessages([]);
            }
          } else {
            setMessages([]);
          }
        }
      } catch (error) {
        console.error("Failed to load messages:", error);
        // Only set empty messages if we still have a session (not cleared)
        if (currentSessionId) {
          setMessages([]);
        }
      }
    };

    // Only load messages if we have a session and are not initializing or sending
    if (currentSessionId && !isInitializing && !isSendingMessage) {
      loadMessages();
    }
  }, [currentSessionId, isInitializing, isSendingMessage]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (content: string, attachments: Attachment[] = []) => {
    if (isSendingMessage) {
      return;
    }

    const trimmed = content.trim();
    if (!trimmed && attachments.length === 0) {
      return;
    }

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Set sending flag early to prevent loadMessages from running
    setIsSendingMessage(true);

    // Create session if it doesn't exist (first message)
    let sessionIdToUse = currentSessionId;
    if (!sessionIdToUse) {
      try {
        const sessionResponse = await fetch("/api/sessions/new", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: sessionProjectId || undefined,
          }),
          signal: controller.signal,
        });
        if (!sessionResponse.ok) {
          throw new Error("Failed to create session");
        }
        const sessionData = (await sessionResponse.json()) as {
          sessionId?: string;
          projectId?: string | null;
        };
        if (sessionData.sessionId) {
          sessionIdToUse = sessionData.sessionId;
          setCurrentSessionId(sessionIdToUse);
          // Set the project from server response
          if (sessionData.projectId) {
            setSessionProjectId(sessionData.projectId);
          }
          // Update URL to /c/[sessionId] without triggering a full navigation
          // (router.replace would remount the component and lose local state)
          window.history.replaceState(null, "", `/c/${sessionIdToUse}`);
        } else {
          throw new Error("Failed to create session");
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setIsSendingMessage(false);
          return;
        }
        console.error("Failed to create session:", error);
        setError("Failed to create a new chat session. Please try again.");
        setIsSendingMessage(false);
        return;
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      createdAt: Date.now(),
      content: trimmed,
      attachments: attachments.length > 0 ? attachments : undefined
    };

    const optimisticAssistant: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      createdAt: Date.now(),
      content: ""
    };

    const historyPayload = [...messages, userMessage]
      .slice(-10)
      .map(({ role, content, attachments }) => ({
        role,
        content,
        attachments: attachments || undefined
      }));

    setMessages((prev) => [...prev, userMessage, optimisticAssistant]);
    setError(null);
    setIsLoading(true);
    setHasUnsavedWork(true);

    try {
      console.log("Sending message with sessionId:", sessionIdToUse);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message: trimmed,
          history: historyPayload,
          attachments,
          sessionId: sessionIdToUse,
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error("Tier 2 orchestration service returned an error.");
      }

      if (!response.body) {
        throw new Error("Missing response stream from chat endpoint.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let event: ChatProgressEvent;
          try {
            event = JSON.parse(line) as ChatProgressEvent;
          } catch {
            continue;
          }

          if (event.type === "tool_start") {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== optimisticAssistant.id) return msg;
                const nextSteps = [...(msg.progressSteps ?? [])];
                nextSteps.push({
                  tool: event.tool,
                  label: event.label,
                  status: "running",
                });
                return { ...msg, progressSteps: nextSteps };
              })
            );
          } else if (event.type === "tool_end") {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== optimisticAssistant.id) return msg;
                const nextSteps = [...(msg.progressSteps ?? [])];
                const stepIndex = nextSteps.findIndex(
                  (step) => step.tool === event.tool && step.status === "running"
                );
                if (stepIndex >= 0) {
                  nextSteps[stepIndex] = {
                    ...nextSteps[stepIndex],
                    status: "done",
                    result: event.result,
                  };
                } else {
                  nextSteps.push({
                    tool: event.tool,
                    label: event.tool,
                    status: "done",
                    result: event.result,
                  });
                }
                return { ...msg, progressSteps: nextSteps };
              })
            );
          } else if (event.type === "text_chunk") {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === optimisticAssistant.id
                  ? { ...msg, content: (msg.content || "") + event.content }
                  : msg
              )
            );
          } else if (event.type === "done") {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === optimisticAssistant.id
                  ? {
                      ...msg,
                      content: msg.content?.trim() ? msg.content : event.response,
                      progressSteps: undefined,
                      toolsUsed: event.toolsUsed,
                      latency: event.latency,
                    }
                  : msg
              )
            );
            setHasUnsavedWork(false);
            setIsSendingMessage(false);

            setTimeout(() => {
              if (refreshSessions) {
                refreshSessions();
              }
              window.dispatchEvent(
                new CustomEvent("sessionUpdated", {
                  detail: { sessionId: sessionIdToUse },
                })
              );
            }, 500);
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }

      const finalTail = buffer.trim();
      if (finalTail) {
        try {
          const event = JSON.parse(finalTail) as ChatProgressEvent;
          if (event.type === "done") {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === optimisticAssistant.id
                  ? {
                      ...msg,
                      content: msg.content?.trim() ? msg.content : event.response,
                      progressSteps: undefined,
                      toolsUsed: event.toolsUsed,
                      latency: event.latency,
                    }
                  : msg
              )
            );
            setHasUnsavedWork(false);
          }
        } catch {
          // Ignore malformed final chunk.
        }
      }
    } catch (err) {
      // Don't show error if request was aborted by user
      if (err instanceof Error && err.name === "AbortError") {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticAssistant.id));
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticAssistant.id));
        setError(
          err instanceof Error
            ? err.message
            : "Oops, something went wrong. Please try again."
        );
      }
    } finally {
      setIsLoading(false);
      setIsSendingMessage(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleProjectChange = (projectId: string | null) => {
    setSessionProjectId(projectId);
  };

  return (
    <section className="flex h-full flex-col relative">
      <div className="px-4 pt-3 pb-1">
        <ProjectSelector
          sessionId={currentSessionId}
          projectId={sessionProjectId}
          onProjectChange={handleProjectChange}
        />
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto pb-32 pt-4"
      >
        <div className="mx-auto max-w-3xl px-4 flex flex-col gap-3 min-h-full">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-6">
              <h1 className="text-2xl font-medium text-gray-700">
                What are you working on?
              </h1>
              <div className="w-full max-w-3xl">
                <ChatInput
                  disabled={isLoading || isSendingMessage}
                  isLoading={isLoading}
                  onSubmit={sendMessage}
                  onStop={handleStop}
                  placeholder="What do you want to know?"
                />
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </>
          )}

          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-500 border border-red-100">
              {error}
            </div>
          )}
        </div>
      </div>

      {messages.length > 0 && (
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-white via-white to-transparent pb-6 pt-10 px-4">
          <div className="mx-auto max-w-3xl">
            <ChatInput
              disabled={isLoading || isSendingMessage}
              isLoading={isLoading}
              onSubmit={sendMessage}
              onStop={handleStop}
              placeholder="What do you want to know?"
            />
          </div>
        </div>
      )}
    </section>
  );
}
