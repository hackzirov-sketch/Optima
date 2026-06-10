"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { WorkspaceSetup } from "./WorkspaceSetup";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { user, logout, hasBackendSession } = useAuth();

  const { workspaces, activeWorkspace, loading: wsLoading } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  if (!user) return null;

  // If backend session exists but user has no workspaces, show setup
  if (hasBackendSession && !wsLoading && workspaces.length === 0) {
    return <WorkspaceSetup />;
  }

  const hideAssistantButton =
    pathname === "/app/chat" ||
    pathname === "/app/assistant" ||
    pathname === "/app/meetings";

  const handleToggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileSidebarOpen(true);
      return;
    }
    setCollapsed((c) => !c);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <div className="hidden md:block">
        <Sidebar user={user} onLogout={logout} collapsed={collapsed} />
      </div>

      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="h-full w-[280px]"
              onClick={(e) => e.stopPropagation()}
            >
              <Sidebar user={user} onLogout={logout} onNavigate={() => setMobileSidebarOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar user={user} onToggleSidebar={handleToggleSidebar} />

        <main className="flex-1 overflow-y-auto bg-[var(--upz-content-bg)] p-4 md:p-6">
          {children}
        </main>

        {!hideAssistantButton && (
          <Link
            href="/app/assistant"
            className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 dark:shadow-indigo-950/50 transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
            aria-label="Open AI assistant"
          >
            <Bot className="h-5 w-5" />
            <span className="hidden sm:inline">{t("app.dashboard.askAI")}</span>
          </Link>
        )}
      </div>
    </div>
  );
}
