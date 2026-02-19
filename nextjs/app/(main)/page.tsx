"use client";

import ChatSurface from "@/components/chat/chat-surface";
import { Suspense } from "react";

function HomePageContent() {
  return (
    <main className="flex h-full flex-col bg-white">
      <ChatSurface />
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={
      <main className="flex h-full flex-col bg-white">
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500">Loading...</div>
        </div>
      </main>
    }>
      <HomePageContent />
    </Suspense>
  );
}

