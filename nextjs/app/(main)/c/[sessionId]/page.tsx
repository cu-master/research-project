"use client";

import ChatSurface from "@/components/chat/chat-surface";
import { Suspense } from "react";
import { useParams } from "next/navigation";

function ChatPageContent() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params.sessionId;

  return (
    <main className="flex h-full flex-col bg-white">
      <ChatSurface sessionId={sessionId} />
    </main>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex h-full flex-col bg-white">
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading...</div>
          </div>
        </main>
      }
    >
      <ChatPageContent />
    </Suspense>
  );
}
