import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellOff, Menu, MoreVertical, Phone, Pin, Search, Trash, User, Video } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatRoom, ChatUser } from "@/types";
import { PremiumGradientBadge, PremiumStatusBadge, getPremiumStatusForUser } from "@/components/premium/PremiumAssets";
import { Avatar, RoomGlyph, getLinkedTask, getRoomName, getRoomPeer, getUser } from "./chatShared";

export type ChatHeaderAction = "profile" | "search" | "mute" | "pin" | "clear" | "delete";
export type ChatCallMode = "voice" | "video";

interface ChatHeaderProps {
  room: ChatRoom;
  users: ChatUser[];
  onBackToList: () => void;
  onAction: (action: ChatHeaderAction) => void;
  onStartCall: (mode: ChatCallMode) => void;
}

function roomStatus(room: ChatRoom, users: ChatUser[], t: (key: string, options?: Record<string, unknown>) => string) {
  const peer = getRoomPeer(room, users);
  if (room.type === "ai") return { label: t("app.chat.aiOnline", { defaultValue: "UPZ AI online" }) };
  if (room.type === "saved") return { label: t("app.chat.savedPrivate", { defaultValue: "Private saved messages" }) };

  if (room.type === "1on1") {
    if (peer?.status === "online") return { label: t("app.chat.online") };
    if (peer?.status === "away") return { label: t("app.chat.away") };
    return { label: t("app.chat.lastSeen") };
  }

  const onlineCount = room.memberIds.filter((id) => getUser(id, users)?.status === "online").length;
  return { label: t("app.chat.memberStatus", { members: room.memberIds.length, online: onlineCount }) };
}

export function ChatHeader({ room, users, onBackToList, onAction, onStartCall }: ChatHeaderProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const peer = getRoomPeer(room, users);
  const status = roomStatus(room, users, t);
  const memberPreview = room.memberIds.filter((id) => id !== "me").slice(0, 4);
  const roomName = getRoomName(room, t);
  const linkedTask = getLinkedTask(room, t);
  const headerStatus = room.type === "1on1" ? getPremiumStatusForUser(peer) : room.type === "ai" ? "coding" : room.type === "saved" ? "focused" : room.type === "project" ? "building" : "meeting";
  const canCall = room.type !== "ai" && room.type !== "saved";

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const runAction = (action: ChatHeaderAction) => {
    setOpen(false);
    onAction(action);
  };

  return (
    <header className="relative z-40 flex h-[72px] flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-3 backdrop-blur-xl dark:border-gray-700 dark:bg-gray-900 sm:px-5">
      <button
        type="button"
        onClick={onBackToList}
        className="grid h-10 w-10 place-items-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 md:hidden"
        aria-label={t("app.chat.openList")}
      >
        <Menu className="h-5 w-5" />
      </button>

      {room.type === "1on1" ? <Avatar user={peer} size={44} showOnline /> : <RoomGlyph room={room} className="h-11 w-11" />}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">{roomName}</h2>
          {room.projectBadge && <PremiumGradientBadge label={room.projectBadge} icon="/emojis/rocket.svg" className="hidden sm:inline-flex" />}
          {room.muted && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 dark:bg-gray-700 dark:text-gray-400">{t("app.chat.muted")}</span>}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <PremiumStatusBadge status={headerStatus} size={18} className="border-gray-200 dark:border-gray-600" />
          <span className="truncate">{linkedTask ? `${status.label} - ${linkedTask}` : status.label}</span>
        </div>
      </div>

      {room.type !== "1on1" && room.type !== "ai" && room.type !== "saved" && (
        <div className="hidden items-center -space-x-2 lg:flex">
          {memberPreview.map((memberId) => (
            <Avatar key={memberId} userId={memberId} size={28} showOnline className="rounded-full ring-2 ring-white dark:ring-gray-900" />
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
        {canCall && (
          <>
            <button
              type="button"
              onClick={() => onStartCall("voice")}
              className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              aria-label={t("app.chat.startVoice")}
            >
              <Phone className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onStartCall("video")}
              className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              aria-label={t("app.chat.startVideo")}
            >
              <Video className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onAction("search")}
          className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          aria-label={t("app.chat.searchInChat")}
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          className="grid h-10 w-10 place-items-center rounded-full transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          aria-label={t("app.chat.openMenu")}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 4 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute right-3 top-[62px] z-[120] w-56 rounded-2xl border border-gray-200 bg-white p-1.5 text-sm text-gray-900 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => runAction("profile")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
              <User className="h-4 w-4 text-gray-400" />
              {t("app.chat.viewProfile")}
            </button>
            <button type="button" onClick={() => runAction("search")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
              <Search className="h-4 w-4 text-gray-400" />
              {t("app.chat.searchInChat")}
            </button>
            <button type="button" onClick={() => runAction("mute")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
              <BellOff className="h-4 w-4 text-gray-400" />
              {room.muted ? t("app.chat.unmute") : t("app.chat.mute")}
            </button>
            <button type="button" onClick={() => runAction("pin")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
              <Pin className="h-4 w-4 text-gray-400" />
              {room.pinned ? t("app.chat.unpinChat") : t("app.chat.pinChat")}
            </button>
            <div className="my-1 h-px bg-gray-100 dark:bg-gray-700" />
            <button type="button" onClick={() => runAction("clear")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700">
              <Trash className="h-4 w-4 text-gray-400" />
              {t("app.chat.clearHistory")}
            </button>
            <button type="button" onClick={() => runAction("delete")} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-rose-600 transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/30">
              <Trash className="h-4 w-4" />
              {t("app.chat.deleteChat")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
