import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Bot, Bookmark, Hash, MessageCircle, Plus, Search } from "lucide-react";
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
  onCreateRoom?: () => void;
  className?: string;
}

function sortRooms(rooms: ChatRoom[]) {
  return [...rooms].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return (getLastMessage(b)?.timestamp ?? 0) - (getLastMessage(a)?.timestamp ?? 0);
  });
}

const CHANNEL_TYPES: ChatRoom["type"][] = ["team", "group", "project", "workspace" as ChatRoom["type"]];
const DM_TYPES: ChatRoom["type"][] = ["1on1"];
const OTHER_TYPES: ChatRoom["type"][] = ["ai", "saved"];

function isChannel(room: ChatRoom) {
  return CHANNEL_TYPES.includes(room.type) || (!DM_TYPES.includes(room.type) && !OTHER_TYPES.includes(room.type));
}
function isDm(room: ChatRoom) { return room.type === "1on1"; }
function isOther(room: ChatRoom) { return OTHER_TYPES.includes(room.type); }

function SectionHeader({ label, onAdd }: { label: string; onAdd?: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1 pt-3">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">
        {label}
      </span>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="grid h-5 w-5 place-items-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          aria-label="Yangi"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function ChannelItem({ room, active, onSelect }: { room: ChatRoom; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 transition-colors",
        active
          ? "bg-indigo-600/15 text-white dark:bg-indigo-600/20"
          : "text-gray-400 hover:bg-gray-100/60 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200",
      )}
    >
      <Hash className="h-4 w-4 flex-shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {room.name ?? getRoomName(room, {} as ReturnType<typeof useTranslation>["t"])}
      </span>
      {(room.unread ?? 0) > 0 && (
        <span className="flex-shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {room.unread}
        </span>
      )}
    </button>
  );
}

function DmItem({ room, users, active, onSelect }: { room: ChatRoom; users: ChatUser[]; active: boolean; onSelect: () => void }) {
  const other = users.find((u) => u.id !== "me" && room.memberIds?.includes(u.id));
  const isOnline = other?.status === "online";
  const name = other?.name ?? room.name ?? "Noma'lum";
  const initials = name.slice(0, 2).toUpperCase();
  const color = other?.color ?? "#6366F1";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors",
        active
          ? "bg-indigo-600/15 text-white dark:bg-indigo-600/20"
          : "text-gray-400 hover:bg-gray-100/60 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200",
      )}
    >
      <div className="relative flex-shrink-0">
        <div
          className="grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold text-white"
          style={{ background: color }}
        >
          {initials}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#1a1d2b]",
            isOnline ? "bg-green-400" : "bg-gray-500",
          )}
        />
      </div>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
      {(room.unread ?? 0) > 0 && (
        <span className="flex-shrink-0 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {room.unread}
        </span>
      )}
    </button>
  );
}

export function ChatSidebar({
  rooms,
  users,
  activeId,
  query,
  onQueryChange,
  onSelectRoom,
  onBackToApp,
  onCreateRoom,
  className,
}: ChatSidebarProps) {
  const { t } = useTranslation();
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery) return rooms.filter((r) => !r.archived);
    return rooms.filter((r) => {
      if (r.archived) return false;
      const name = (r.name ?? getRoomName(r, t)).toLowerCase();
      return name.includes(normalizedQuery);
    });
  }, [rooms, normalizedQuery, t]);

  const channels = useMemo(() => sortRooms(filtered.filter(isChannel)), [filtered]);
  const dms = useMemo(() => sortRooms(filtered.filter(isDm)), [filtered]);
  const others = useMemo(() => sortRooms(filtered.filter(isOther)), [filtered]);

  const onlineCount = users.filter((u) => u.status === "online" && u.id !== "me").length;
  const totalMembers = users.filter((u) => u.id !== "me" && u.id !== "ai").length;

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col border-r border-white/8 bg-[#1A1C2B] dark:bg-[#1A1C2B]",
        className,
      )}
    >
      {/* Workspace header */}
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        {onBackToApp && (
          <button
            type="button"
            onClick={onBackToApp}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Orqaga"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <span className="truncate text-sm font-bold text-white">UPZ Workspace</span>
          </div>
          <p className="text-[11px] text-gray-500">
            {totalMembers} a&apos;zo · {onlineCount} online
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-white/8 px-3 py-2">
        <div className="flex h-8 items-center gap-2 rounded-lg bg-white/8 px-2.5 text-gray-400 focus-within:bg-white/12 focus-within:text-white">
          <Search className="h-3.5 w-3.5 flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Qidirish..."
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
            type="search"
          />
        </div>
      </div>

      {/* Room lists */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent]">
        {/* Channels */}
        {channels.length > 0 && (
          <section>
            <SectionHeader label="Kanallar" onAdd={onCreateRoom} />
            <div className="space-y-0.5 px-1">
              <AnimatePresence initial={false}>
                {channels.map((room) => (
                  <motion.div key={room.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <ChannelItem
                      room={room}
                      active={room.id === activeId}
                      onSelect={() => onSelectRoom(room.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* DMs */}
        {dms.length > 0 && (
          <section>
            <SectionHeader label="To'g'ridan-to'g'ri" />
            <div className="space-y-0.5 px-1">
              <AnimatePresence initial={false}>
                {dms.map((room) => (
                  <motion.div key={room.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <DmItem
                      room={room}
                      users={users}
                      active={room.id === activeId}
                      onSelect={() => onSelectRoom(room.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

        {/* AI / Saved */}
        {others.length > 0 && (
          <section>
            <SectionHeader label="Boshqa" />
            <div className="space-y-0.5 px-1">
              {others.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onSelectRoom(room.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 transition-colors",
                    room.id === activeId
                      ? "bg-indigo-600/15 text-white"
                      : "text-gray-400 hover:bg-white/8 hover:text-gray-200",
                  )}
                >
                  {room.type === "ai" ? <Bot className="h-4 w-4 flex-shrink-0" /> : <Bookmark className="h-4 w-4 flex-shrink-0" />}
                  <span className="truncate text-sm font-medium">{room.name ?? getRoomName(room, t)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {filtered.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-4 py-8 text-center text-sm text-gray-500"
          >
            <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-30" />
            Hech narsa topilmadi
          </motion.div>
        )}
      </div>

      {/* Add channel button */}
      {onCreateRoom && (
        <div className="border-t border-white/8 p-3">
          <button
            type="button"
            onClick={onCreateRoom}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/6 py-2.5 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Plus className="h-4 w-4" />
            Yangi kanal
          </button>
        </div>
      )}
    </aside>
  );
}
