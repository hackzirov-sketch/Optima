import type { ComponentType } from "react";
import { Bot, Bookmark, FolderOpen, Hash, Users, User as UserIcon } from "lucide-react";
import type { ChatMessage, ChatReactionEmoji, ChatRoom, ChatType, ChatUser } from "@/types";
import { MOCK_USERS } from "@/data/mockData";
import { PREMIUM_REACTIONS, PremiumAvatarRing, PremiumStatusBadge, getPremiumStatusForUser } from "@/components/premium/PremiumAssets";

export const REACTION_EMOJIS: ChatReactionEmoji[] = PREMIUM_REACTIONS.map((reaction) => reaction.id);

export const CHAT_TYPE_LABELS: Record<ChatType, string> = {
  "1on1": "Direct",
  group: "Group",
  team: "Team",
  project: "Project",
  saved: "Saved",
  ai: "AI",
};

export const CHAT_TYPE_ICONS: Record<ChatType, ComponentType<{ className?: string }>> = {
  "1on1": UserIcon,
  group: Users,
  team: Hash,
  project: FolderOpen,
  saved: Bookmark,
  ai: Bot,
};

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function getUser(userId: string, users: ChatUser[] = MOCK_USERS) {
  return users.find((candidate) => candidate.id === userId);
}

export function getRoomPeer(room: ChatRoom, users: ChatUser[] = MOCK_USERS) {
  if (room.type !== "1on1") return undefined;
  return users.find((candidate) => room.memberIds.includes(candidate.id) && candidate.id !== "me");
}

export function getLastMessage(room: ChatRoom) {
  return room.messages[room.messages.length - 1];
}

type TranslateFn = (key: string, fallback: string) => string;

export function getMessageText(message: ChatMessage | undefined, t?: TranslateFn) {
  if (!message) return t?.("app.chat.messageNotAvailable", "Message not available") ?? "Message not available";
  return t?.(`app.mock.chatMessages.${message.id}`, message.text) ?? message.text;
}

export function getRoomName(room: ChatRoom, t?: TranslateFn) {
  return t?.(`app.mock.chatRooms.${room.id}.name`, room.name) ?? room.name;
}

export function getLinkedTask(room: ChatRoom, t?: TranslateFn) {
  if (!room.linkedTask) return undefined;
  return t?.(`app.mock.chatRooms.${room.id}.linkedTask`, room.linkedTask) ?? room.linkedTask;
}

export function getReplySnippet(message?: ChatMessage, t?: TranslateFn) {
  const text = getMessageText(message, t);
  return text.length > 78 ? `${text.slice(0, 78)}...` : text;
}

export function formatMessageTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatSidebarTime(timestamp?: number) {
  if (!timestamp) return "";
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return formatMessageTime(timestamp);
  if (diff < 604800000) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(timestamp));
  }
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp));
}

export function messagePreview(message: ChatMessage | undefined, users: ChatUser[] = MOCK_USERS, t?: TranslateFn) {
  if (!message) return t?.("app.chat.noMessagesYet", "No messages yet") ?? "No messages yet";
  const sender = message.userId === "me" ? t?.("app.chat.you", "You") ?? "You" : getUser(message.userId, users)?.name.split(" ")[0] ?? t?.("app.chat.someone", "Someone") ?? "Someone";
  return `${sender}: ${getMessageText(message, t)}`;
}

export function Avatar({
  user,
  userId,
  size = 40,
  showOnline = false,
  className = "",
}: {
  user?: ChatUser;
  userId?: string;
  size?: number;
  showOnline?: boolean;
  className?: string;
}) {
  const resolved = user ?? (userId ? getUser(userId) : undefined);
  const initials = resolved?.initials ?? "UP";
  const color = resolved?.color ?? "#6366F1";
  const isOnline = resolved?.status === "online";
  const premiumStatus = getPremiumStatusForUser(resolved);

  return (
    <div className={cn("relative flex-shrink-0", className)} style={{ width: size, height: size }}>
      <PremiumAvatarRing active={showOnline && isOnline} className="h-full w-full">
        <div
          className="flex h-full w-full items-center justify-center rounded-full font-bold text-white shadow-sm ring-1 ring-white/80"
          style={{ background: color, fontSize: Math.max(10, size * 0.34) }}
        >
          {initials}
        </div>
      </PremiumAvatarRing>
      {showOnline && (
        <PremiumStatusBadge
          status={premiumStatus}
          size={Math.max(14, size * 0.34)}
          className="absolute -bottom-1 -right-1"
        />
      )}
    </div>
  );
}

export function RoomGlyph({ room, className = "" }: { room: ChatRoom; className?: string }) {
  const Icon = CHAT_TYPE_ICONS[room.type];

  return (
    <div
      className={cn("flex items-center justify-center rounded-2xl text-white shadow-sm ring-1 ring-white/80", className)}
      style={{ background: "linear-gradient(135deg, #6366F1, #3B82F6)" }}
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}
