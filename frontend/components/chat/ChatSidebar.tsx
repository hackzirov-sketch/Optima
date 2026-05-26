import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bot, Bookmark, FolderOpen, Hash, MessageCircle, Pin, Search, User, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const [activeCategory, setActiveCategory] = useState<ChatCategory>("all");
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

  return (
    <aside className={cn("flex min-h-0 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900", className)}>
      <div className="border-b border-gray-200 p-2.5 dark:border-gray-700 sm:p-3">
        <div className="flex items-center gap-2">
          {onBackToApp && (
            <button
              type="button"
              onClick={onBackToApp}
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
              aria-label="Asosiy menyuga qaytish"
              title="Orqaga"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-3 text-gray-500 transition-colors focus-within:border-indigo-300 focus-within:bg-white dark:border-gray-600 dark:bg-gray-800 dark:text-gray-400 dark:focus-within:bg-gray-700">
            <Search className="h-4 w-4 flex-shrink-0" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t("app.chat.searchChats")}
              className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
              type="search"
            />
          </div>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CHAT_CATEGORIES.map(({ id, label, icon: Icon }) => {
            const active = activeCategory === id;
            const count = categoryCounts[id] ?? 0;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveCategory(id)}
                className={cn(
                  "inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                  active
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200"
                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800",
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

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
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

      <div className="border-t border-gray-200 p-3 dark:border-gray-700">
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
