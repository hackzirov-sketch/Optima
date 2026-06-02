import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Pin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage, ChatReactionEmoji, ChatRoom, ChatUser } from "@/types";
import { EmojiRenderer, encodeNativeEmojiReaction, findEmojiAsset, getReactionAsset, normalizeReactionId } from "@/components/premium/PremiumAssets";
import { Avatar, cn, formatMessageTime, getMessageText, getReplySnippet, getUser } from "./chatShared";
import { FastEmojiRenderer } from "./FastEmojiRenderer";
import { MessageOptionsMenu, type MessageOptionAction } from "./MessageOptionsMenu";

const ReactionPicker = lazy(() => import("./ReactionPicker").then((module) => ({ default: module.ReactionPicker })));

interface MessageBubbleProps {
  room: ChatRoom;
  message: ChatMessage;
  users: ChatUser[];
  replyMessage?: ChatMessage;
  isPinned?: boolean;
  onReply: (message: ChatMessage) => void;
  onEdit: (message: ChatMessage) => void;
  onDelete: (messageId: string) => void;
  onForward: (message: ChatMessage) => void;
  onPin: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: ChatReactionEmoji) => void;
  isPremiumUser?: boolean;
}

type FloatingState = {
  fixed: boolean;
  x: number;
  y: number;
  above?: boolean;
  alignRight?: boolean;
};

function isLargeEmojiOnly(text: string) {
  const withoutAssetTokens = text.replace(/:([a-z0-9-]+):/g, "").trim();
  const assetTokenCount = (text.match(/:([a-z0-9-]+):/g) ?? []).length;
  const hasNativeEmoji = /\p{Extended_Pictographic}/u.test(withoutAssetTokens);
  const hasWords = /[A-Za-z0-9]/.test(withoutAssetTokens);
  const visibleLength = Array.from(withoutAssetTokens.replace(/\s/g, "")).length + assetTokenCount;
  return visibleLength > 0 && visibleLength <= 4 && !hasWords && (hasNativeEmoji || assetTokenCount > 0);
}

function PremiumMessageText({ text, isOwn, isPremiumUser, large = false }: { text: string; isOwn: boolean; isPremiumUser: boolean; large?: boolean }) {
  const parts: Array<string | { token: string; key: string; source: "premium" | "generated" }> = [];
  const pattern = /:([a-z0-9-]+):/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const [raw, token] = match;
    const asset = findEmojiAsset(token);
    const generated = !asset && /^(static|animated)-/.test(token);
    if (!asset && !generated) continue;

    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ token, key: `${token}-${match.index}`, source: asset ? "premium" : "generated" });
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  if (parts.length === 0) return <>{text}</>;

  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={`text-${index}`}>{part}</span>
        ) : (
          <span
            key={part.key}
            className={cn(
              "upz-inline-premium-emoji mx-0.5 inline-flex translate-y-1 items-center align-middle",
              large && "upz-inline-premium-emoji-large translate-y-0",
              !large && (isOwn ? "rounded-full bg-white/20 p-0.5" : "rounded-full bg-[#F7FAFC] p-0.5 ring-1 ring-[#E5E7EB]"),
            )}
          >
            {part.source === "premium" ? (
              <EmojiRenderer assetId={part.token} size={large ? 58 : 22} />
            ) : (
              <FastEmojiRenderer emojiId={part.token} size={large ? "message" : "inline"} isPremiumUser={isPremiumUser} playOnMount decorative />
            )}
          </span>
        ),
      )}
    </>
  );
}

export function MessageBubble({
  room,
  message,
  users,
  replyMessage,
  isPinned,
  onReply,
  onEdit,
  onDelete,
  onForward,
  onPin,
  onToggleReaction,
  isPremiumUser = false,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<FloatingState | null>(null);
  const menuOpenedAtRef = useRef(0);
  const isOwn = message.userId === "me";
  const sender = getUser(message.userId, users);
  const showSender = !isOwn && room.type !== "1on1";
  const activeReactionEmojis = message.reactions?.filter((reaction) => reaction.userIds.includes("me")).map((reaction) => normalizeReactionId(reaction.emoji)) ?? [];
  const text = getMessageText(message, t);
  const largeEmojiOnly = isLargeEmojiOnly(text);

  useEffect(() => {
    if (!menuOpen && !picker) return;
    const close = () => {
      setMenuOpen(false);
      setPicker(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, picker]);

  useEffect(() => {
    if (!picker) return;
    const close = () => setPicker(null);
    const closeListenerId = window.setTimeout(() => window.addEventListener("click", close), 0);
    return () => {
      window.clearTimeout(closeListenerId);
      window.removeEventListener("click", close);
    };
  }, [picker]);

  const openMenuFromContext = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setPicker(null);
    menuOpenedAtRef.current = Date.now();
    setMenuOpen(true);
  };

  const handleAction = (action: MessageOptionAction) => {
    if (action === "react") {
      setPicker({
        fixed: true,
        x: Math.max(10, Math.round((window.innerWidth - 284) / 2)),
        y: Math.max(76, Math.round((window.innerHeight - 216) / 2)),
      });
      setMenuOpen(false);
      return;
    }

    setMenuOpen(false);
    setPicker(null);

    if (action === "reply") onReply(message);
    if (action === "copy") void navigator.clipboard?.writeText(text).catch(() => undefined);
    if (action === "forward") onForward(message);
    if (action === "pin") onPin(message.id);
    if (action === "edit" && isOwn) onEdit(message);
    if (action === "delete") onDelete(message.id);
  };

  const handleReaction = (emoji: ChatReactionEmoji) => {
    onToggleReaction(message.id, emoji);
    setPicker(null);
  };

  const handleNativeReaction = (native: string) => {
    onToggleReaction(message.id, encodeNativeEmojiReaction(native));
    setPicker(null);
  };

  const pickerStyle: CSSProperties = picker
    ? { position: "fixed", left: picker.x, top: picker.y, zIndex: 9999 }
    : {};

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className={cn("flex items-end gap-2.5", isOwn && "flex-row-reverse")}
      >
        {!isOwn && <Avatar user={sender} size={30} />}
        <div className={cn("relative flex max-w-[82%] flex-col sm:max-w-[72%] lg:max-w-[64%]", isOwn ? "items-end" : "items-start")}>
          {showSender && <span className="mb-1 ml-2 text-xs font-medium text-[#6B7280]">{sender?.name}</span>}
          <div className="group/message relative">
            <button
              type="button"
              onContextMenu={openMenuFromContext}
              className={cn(
                "upz-message-bubble group/bubble relative px-3.5 py-2 text-left text-[15px] leading-relaxed shadow-sm transition-all duration-150 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#4BA3D8]/30",
                largeEmojiOnly && "upz-emoji-only-message px-2 py-1 text-[3.3rem] leading-none",
                isOwn ? "upz-message-bubble-own text-[#17212B]" : "upz-message-bubble-peer text-[#17212B]",
              )}
            >
            {replyMessage && (
              <div
                className={cn(
                  "relative mb-2 overflow-hidden rounded-xl border-l-2 px-3 py-2 text-xs",
                  isOwn
                    ? "border-[#5BAE64]/70 bg-white/36 text-[#17212B] dark:bg-white/10 dark:text-[#E5F7EE]"
                    : "border-[#4BA3D8] bg-[#E6F3FB] text-[#17212B] dark:bg-[#12263A] dark:text-[#EAF6FF]",
                )}
              >
                <motion.span
                  aria-hidden="true"
                  animate={{ opacity: [0.35, 0.9, 0.35] }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                  className={cn("absolute inset-y-2 left-0 w-0.5 rounded-full", isOwn ? "bg-white" : "bg-indigo-500")}
                />
                <div className="font-semibold">{getUser(replyMessage.userId, users)?.name ?? t("app.chat.unknown")}</div>
                <div className="mt-0.5 line-clamp-2 opacity-80">{getReplySnippet(replyMessage, t)}</div>
              </div>
            )}
            {isPinned && (
              <div className={cn("mb-1.5 flex items-center gap-1 text-[11px] font-semibold", isOwn ? "text-white/75" : "text-indigo-600")}>
                <Pin className="h-3 w-3" />
                {t("app.chat.pinnedLabel")}
              </div>
            )}
            <div className="whitespace-pre-wrap break-words">
              <PremiumMessageText text={text} isOwn={isOwn} isPremiumUser={isPremiumUser} large={largeEmojiOnly} />
            </div>
            <div className={cn("mt-1 flex items-center justify-end gap-1 text-[11px]", isOwn ? "text-[#54865A]" : "text-[#6C7B86]", largeEmojiOnly && "text-xs")}>
              {message.edited && <span>{t("app.chat.edited")}</span>}
              <span>{formatMessageTime(message.timestamp)}</span>
              {isOwn && <span className={message.read === false ? "text-[#7FA786]" : "text-[#36A8E3]"}>{message.read === false ? t("app.chat.sent") : t("app.chat.readStatus")}</span>}
            </div>
            </button>
          </div>

        {!!message.reactions?.length && (
          <div className={cn("mt-1 flex max-w-[min(100%,300px)] flex-wrap gap-1 overflow-visible", isOwn ? "justify-end pr-2" : "justify-start pl-2")}>
            {message.reactions.map((reaction) => {
              const reactionId = normalizeReactionId(reaction.emoji);
              const active = reaction.userIds.includes("me");
              const generatedReaction = /^(static|animated)-/.test(reactionId);
              return (
                <button
                  key={reactionId}
                  type="button"
                  onClick={() => onToggleReaction(message.id, reactionId)}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full border px-1.5 text-xs font-bold transition-colors",
                    active ? "border-[#8B7CF6]/35 bg-[#8B7CF6]/12 text-[#4F46E5]" : "border-white/70 bg-white/85 text-[#6C7B86] hover:bg-white",
                    "dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
                  )}
                >
                  {generatedReaction ? (
                    <FastEmojiRenderer emojiId={reactionId} size="reaction" mode="animated" isPremiumUser playOnMount playOnClick decorative />
                  ) : (
                    <EmojiRenderer asset={getReactionAsset(reactionId)} size={20} decorative />
                  )}
                  <span>{reaction.userIds.length}</span>
                </button>
              );
            })}
          </div>
        )}

        </div>
      </motion.div>

      {menuOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] grid place-items-center bg-gray-950/10 px-3 py-6 backdrop-blur-[1.5px]"
            style={{ zIndex: 2147483000 }}
            onClick={(event) => {
              event.stopPropagation();
              if (Date.now() - menuOpenedAtRef.current < 250) return;
              setMenuOpen(false);
            }}
          >
            <MessageOptionsMenu isOwn={isOwn} onAction={handleAction} className="w-[min(92vw,224px)]" />
          </div>,
          document.body,
        )}

      {picker &&
        typeof document !== "undefined" &&
        createPortal(
          <div style={pickerStyle}>
            <Suspense fallback={<div className="w-[240px] rounded-[22px] border border-white/80 bg-white/92 p-4 text-xs font-bold text-gray-500 shadow-xl">Loading reactions</div>}>
              <ReactionPicker activeEmojis={activeReactionEmojis} onSelect={handleReaction} onSelectNative={handleNativeReaction} isPremiumUser={isPremiumUser} />
            </Suspense>
          </div>,
          document.body,
        )}
    </>
  );
}
