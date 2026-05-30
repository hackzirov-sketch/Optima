import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bell, Bot, Bookmark, FolderOpen, Hash, Menu, MessageCircle, Pin, Search, Settings, User, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import type { ChatRoom, ChatUser } from "@/types";
import { ChatListItem } from "./ChatListItem";
import { cn, getLastMessage, getMessageText, getRoomName } from "./chatShared";

interface ChatSidebarProps {
  rooms: ChatRoom[];
  users: ChatUser[];
  activeId?: string;
  query: string;
  onQueryChange: (query: string) => void;
  onSelectRoom: (roomId: string) => void;
  onBackToApp?: () => void;
  className?: string;
}

function sortRooms(rooms: ChatRoom[]) {
  return [...rooms].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (getLastMessage(b)?.timestamp ?? 0) - (getLastMessage(a)?.timestamp ?? 0);
  });
}

type ChatCategory = "all" | "direct" | "groups" | "teams" | "projects" | "ai" | "saved";

const CHAT_CATEGORIES: Array<{
  id: ChatCategory;
  label: string;
  icon: typeof MessageCircle;
  match: (room: ChatRoom) => boolean;
}> = [
  { id: "all", label: "Hammasi", icon: MessageCircle, match: () => true },
  { id: "direct", label: "Shaxsiy", icon: User, match: (room) => room.type === "1on1" },
  { id: "groups", label: "Guruhlar", icon: Users, match: (room) => room.type === "group" },
  { id: "teams", label: "Jamoa", icon: Hash, match: (room) => room.type === "team" },
  { id: "projects", label: "Loyihalar", icon: FolderOpen, match: (room) => room.type === "project" },
  { id: "ai", label: "AI", icon: Bot, match: (room) => room.type === "ai" },
  { id: "saved", label: "Saved", icon: Bookmark, match: (room) => room.type === "saved" },
];

export function ChatSidebar({ rooms, users, activeId, query, onQueryChange, onSelectRoom, onBackToApp, className }: ChatSidebarProps) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [activeCategory, setActiveCategory] = useState<ChatCategory>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const categoryCounts = useMemo(
    () =>
      CHAT_CATEGORIES.reduce(
        (counts, category) => ({
          ...counts,
          [category.id]: rooms.filter((room) => !room.archived && category.match(room)).length,
        }),
        {} as Record<ChatCategory, number>,
      ),
    [rooms],
  );
  const activeCategoryConfig = CHAT_CATEGORIES.find((category) => category.id === activeCategory) ?? CHAT_CATEGORIES[0];
  const visibleRooms = sortRooms(
    rooms.filter((room) => {
      if (room.archived) return false;
      if (!activeCategoryConfig.match(room)) return false;
      if (!normalizedQuery) return true;
      const last = getMessageText(getLastMessage(room), t).toLowerCase();
      return getRoomName(room, t).toLowerCase().includes(normalizedQuery) || last.includes(normalizedQuery);
    }),
  );
  const pinnedRooms = visibleRooms.filter((room) => room.pinned);
  const regularRooms = visibleRooms.filter((room) => !room.pinned);
  const requestNotifications = () => {
    setMenuOpen(false);
    void Notification.requestPermission?.();
  };

  return (
    <aside className={cn("flex min-h-0 flex-col border-r border-[#D9E1E8] bg-[#FFFFFF] dark:border-gray-700 dark:bg-gray-900", className)}>
      <div className="border-b border-[#D9E1E8] p-2.5 dark:border-gray-700 sm:p-3">
        <div className="relative flex items-center gap-2">
          {onBackToApp && (
            <button
              type="button"
              onClick={onBackToApp}
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-[#6C7B86] transition-colors hover:bg-[#EEF4F8] hover:text-[#168ACD] dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label="Asosiy menyuga qaytish"
              title="Orqaga"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full bg-[#F1F5F8] px-3 text-[#7C8B96] transition-colors focus-within:bg-white focus-within:ring-2 focus-within:ring-[#4BA3D8]/25 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:focus-within:bg-gray-700">
            <Search className="h-4 w-4 flex-shrink-0" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("app.chat.searchChats")}
              className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
              type="search"
            />
          </div>
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="relative grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#F1F5F8] text-[#6C7B86] transition-colors hover:bg-[#E6F3FB] hover:text-[#168ACD] dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            aria-label="Open chat menu"
            aria-expanded={menuOpen}
          >
            <Menu className="h-5 w-5" />
            <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#8B5CF6] px-1 text-[11px] font-bold text-white">1</span>
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.99 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="absolute right-0 top-12 z-50 w-[min(300px,calc(100vw-1rem))] overflow-hidden rounded-2xl bg-[#26282A] py-1.5 text-white shadow-2xl shadow-black/25 ring-1 ring-white/10"
                onClick={(event) => event.stopPropagation()}
              >
                <button type="button" onClick={() => { setMenuOpen(false); navigate("/app/settings"); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-white transition-colors hover:bg-white/10">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-indigo-500 text-sm font-bold">J</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">Jurabek</span>
                    <span className="block truncate text-xs text-white/55">online</span>
                  </span>
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#8B5CF6] px-1.5 text-xs font-bold">1</span>
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); onSelectRoom("r-saved"); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-white transition-colors hover:bg-white/10">
                  <Bookmark className="h-5 w-5 text-white/80" />
                  Saved Messages
                </button>
                <button type="button" onClick={requestNotifications} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-white transition-colors hover:bg-white/10">
                  <Bell className="h-5 w-5 text-white/80" />
                  Notifications
                </button>
                <button type="button" onClick={() => { setMenuOpen(false); navigate("/app/settings"); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-white transition-colors hover:bg-white/10">
                  <Settings className="h-5 w-5 text-white/80" />
                  Settings
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CHAT_CATEGORIES.map(({ id, label, icon: Icon }) => {
            const active = activeCategory === id;
            const count = categoryCounts[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveCategory(id)}
                className={cn(
                  "inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
                  active
                    ? "bg-[#E6F3FB] text-[#168ACD] dark:bg-indigo-950/50 dark:text-indigo-200"
                    : "text-[#6C7B86] hover:bg-[#F1F5F8] dark:text-gray-400 dark:hover:bg-gray-800",
                )}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t(`app.chat.categories.${id}`, label)}</span>
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", active ? "bg-white/80 dark:bg-gray-900/70" : "bg-gray-100 dark:bg-gray-800")}>{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        {pinnedRooms.length > 0 && (
          <section className="mb-3">
            <div className="mb-1 flex items-center gap-2 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
              <Pin className="h-3.5 w-3.5" />
              {t("app.chat.pinned")}
            </div>
            <div className="space-y-1">
              <AnimatePresence initial={false}>
                {pinnedRooms.map((room) => (
                  <ChatListItem key={room.id} room={room} users={users} active={room.id === activeId} onSelect={onSelectRoom} />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        <section>
          <div className="mb-1 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
            {activeCategory === "all" ? t("app.chat.allConversations") : t(`app.chat.categories.${activeCategory}`, activeCategoryConfig.label)}
          </div>
          <div className="space-y-1">
            <AnimatePresence initial={false}>
              {regularRooms.map((room) => (
                <ChatListItem key={room.id} room={room} users={users} active={room.id === activeId} onSelect={onSelectRoom} />
              ))}
            </AnimatePresence>
          </div>
        </section>

        {visibleRooms.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {t("app.chat.noChatsMatch")}
          </motion.div>
        )}
      </div>

      <div className="border-t border-[#D9E1E8] p-3 dark:border-gray-700">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-left transition-colors hover:border-indigo-400/25 hover:bg-indigo-500/10 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-indigo-500/30 dark:hover:bg-indigo-500/10"
        >
          <span>
            <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">{t("app.chat.archived")}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{t("app.chat.archivedDesc")}</span>
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-400 dark:bg-gray-700 dark:text-gray-500">0</span>
        </button>
      </div>
    </aside>
  );
}
