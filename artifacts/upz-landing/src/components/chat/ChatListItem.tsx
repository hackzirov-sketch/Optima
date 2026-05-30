import { motion } from "framer-motion";
import { Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatRoom, ChatUser } from "@/types";
import { PremiumStatusBadge, getPremiumStatusForUser } from "@/components/premium/PremiumAssets";
import {
  Avatar,
  CHAT_TYPE_LABELS,
  RoomGlyph,
  cn,
  formatSidebarTime,
  getLastMessage,
  getRoomPeer,
  getRoomName,
  messagePreview,
} from "./chatShared";

const ROOM_STATUS_BY_TYPE = {
  "1on1": "available",
  group: "learning",
  team: "meeting",
  project: "building",
  saved: "focused",
  ai: "coding",
} as const;

interface ChatListItemProps {
  room: ChatRoom;
  users: ChatUser[];
  active: boolean;
  onSelect: (roomId: string) => void;
}

export function ChatListItem({ room, users, active, onSelect }: ChatListItemProps) {
  const { t } = useTranslation();
  const lastMessage = getLastMessage(room);
  const peer = getRoomPeer(room, users);
  const unread = room.unread ?? 0;
  const isDirect = room.type === "1on1";
  const roomName = getRoomName(room, t);
  const roomStatus = isDirect ? getPremiumStatusForUser(peer) : ROOM_STATUS_BY_TYPE[room.type];

  return (
    <motion.button
      type="button"
      layout
      onClick={() => onSelect(room.id)}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors duration-150",
        active ? "bg-[#E6F3FB] dark:bg-indigo-950/40" : "hover:bg-[#F1F5F8] dark:hover:bg-gray-800",
      )}
    >
      {isDirect ? (
        <Avatar user={peer} size={46} showOnline />
      ) : (
        <div className="relative h-[46px] w-[46px] flex-shrink-0">
          <RoomGlyph room={room} className="h-full w-full" />
          <PremiumStatusBadge status={roomStatus} size={16} className="absolute -bottom-1 -right-1 border-gray-200 dark:border-gray-700" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold text-[#17212B] dark:text-gray-100">{roomName}</span>
          {room.pinned && <Pin className="h-3.5 w-3.5 flex-shrink-0 text-[#4BA3D8]/80" />}
          {room.muted && <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-400 dark:bg-gray-700 dark:text-gray-500">{t("app.chat.muted")}</span>}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full bg-[#EEF4F8] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#6C7B86] dark:bg-gray-700 dark:text-gray-400">
            {t(`app.chat.types.${room.type}`, CHAT_TYPE_LABELS[room.type])}
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] text-[#7C8B96] group-hover:text-[#52616B] dark:text-gray-500 dark:group-hover:text-gray-300">
            {messagePreview(lastMessage, users, t)}
          </p>
        </div>
      </div>

      <div className="flex h-full flex-col items-end justify-between gap-2 self-stretch py-0.5">
        <span className={cn("text-[11px]", unread ? "font-semibold text-[#168ACD] dark:text-indigo-400" : "text-[#9AA7B0] dark:text-gray-500")}>{formatSidebarTime(lastMessage?.timestamp)}</span>
        {unread > 0 ? (
          <span className="grid min-h-5 min-w-5 place-items-center rounded-full bg-[#36A8E3] px-1.5 text-[11px] font-bold text-white shadow-sm">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : (
          <span className="h-5 text-[11px] text-gray-400 dark:text-gray-500">{lastMessage?.userId === "me" ? t("app.chat.read") : ""}</span>
        )}
      </div>
    </motion.button>
  );
}
