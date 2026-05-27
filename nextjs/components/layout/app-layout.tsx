"use client";

import { ReactNode } from "react";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import Sidebar from "./sidebar";
import ConnectionStatus from "./connection-status";

function MainContent({ children }: { children: ReactNode }) {
  const { isCollapsed } = useSidebar();

  return (
    <div
      className={`flex-1 flex flex-col h-full transition-all duration-300 ease-in-out ${
        isCollapsed ? "md:pl-16" : "md:pl-64"
      }`}
    >
      <ConnectionStatus />
      <div className="flex-1 flex flex-col overflow-hidden">{children}</div>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-white">
        <Sidebar />
        <MainContent>{children}</MainContent>
      </div>
    </SidebarProvider>
  );
}

