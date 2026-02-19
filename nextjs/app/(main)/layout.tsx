"use client";

import AppLayout from "@/components/layout/app-layout";
import { SessionProvider } from "@/components/layout/session-context";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <AppLayout>{children}</AppLayout>
    </SessionProvider>
  );
}
