import { useState } from "react";
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
  const hideAssistantButton = location === "/app/chat" || location === "/app/assistant" || location === "/app/meetings";

  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileSidebarOpen(true);
      return;
    }

    setCollapsed((current) => !current);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#F7FAFC] text-[#111827]">
      <div className="hidden md:block">
        <Sidebar user={user} onLogout={onLogout} collapsed={collapsed} />
      </div>

      <AnimatePresence>
        {mobileSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#111827]/35 backdrop-blur-sm md:hidden"
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

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar user={user} title={title} onToggleSidebar={handleToggleSidebar} />
        <main
          className="flex-1 overflow-y-auto p-4 md:p-6"
          style={{
            background:
              "radial-gradient(circle at 12% 0%, var(--upz-shell-glow-a), transparent 28%), radial-gradient(circle at 92% 8%, var(--upz-shell-glow-b), transparent 24%), var(--upz-bg)",
          }}
        >
          {children}
        </main>
        {!hideAssistantButton && (
          <Link
            href="/app/assistant"
            className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 px-4 py-3 text-sm font-semibold text-white shadow-xl shadow-indigo-200 transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
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
