import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { Bot } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { UserProfile } from "@/types";

interface AppLayoutProps {
  user: UserProfile;
  title: string;
  children: React.ReactNode;
  onLogout: () => void;
}

export function AppLayout({ user, title, children, onLogout }: AppLayoutProps) {
  const { t } = useTranslation();
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);
  const hideAssistantButton = location === "/app/chat" || location === "/app/assistant" || location === "/app/meetings";

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 });
    setMobileSidebarOpen(false);
  }, [location]);

  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileSidebarOpen(true);
      return;
    }

    setCollapsed((current) => !current);
  };

  return (
    <div className="fixed inset-0 flex h-dvh w-screen overflow-hidden bg-[#F7FAFC] text-[#111827]">
      <div className="hidden h-dvh flex-shrink-0 md:block">
        <Sidebar user={user} onLogout={onLogout} collapsed={collapsed} />
      </div>

      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#111827]/35 md:hidden"
            onClick={() => setMobileSidebarOpen(false)}
          >
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
              className="h-full w-[280px]"
              onClick={(event) => event.stopPropagation()}
            >
              <Sidebar user={user} onLogout={onLogout} onNavigate={() => setMobileSidebarOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar user={user} title={title} onToggleSidebar={handleToggleSidebar} />
        <main ref={mainRef} className="min-h-0 flex-1 overflow-y-auto bg-[#F7FAFC] p-4 md:p-6">
          {children}
        </main>
        {!hideAssistantButton && (
          <Link
            href="/app/assistant"
            className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-500"
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
