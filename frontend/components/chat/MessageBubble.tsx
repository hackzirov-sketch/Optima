import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Pin, Smile } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage, ChatReactionEmoji, ChatRoom, ChatUser } from "@/types";
import { EmojiRenderer, ReactionButton, encodeNativeEmojiReaction, findEmojiAsset, getReactionAsset, normalizeReactionId } from "@/components/premium/PremiumAssets";
import { Avatar, cn, formatMessageTime, getMessageText, getReplySnippet, getUser } from "./chatShared";
import { MessageOptionsMenu, type MessageOptionAction } from "./MessageOptionsMenu";
import { ReactionPicker } from "./ReactionPicker";

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

function PremiumMessageText({ text, isOwn, large = false }: { text: string; isOwn: boolean; large?: boolean }) {
  const parts: Array<string | { token: string; key: string }> = [];
  const pattern = /:([a-z0-9-]+):/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const [raw, token] = match;
    const asset = findEmojiAsset(token);
    if (!asset) continue;

    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push({ token, key: `${token}-${match.index}` });
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
              "mx-0.5 inline-flex translate-y-1 items-center rounded-full p-0.5 align-middle shadow-sm",
              large && "translate-y-0 p-1",
              isOwn ? "bg-white/20" : "bg-[#F7FAFC] ring-1 ring-[#E5E7EB]",
            )}
          >
            <EmojiRenderer assetId={part.token} size={large ? 42 : 22} />
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

  const calcFixedPos = (event: ReactMouseEvent, menuW = 196, menuH = 236) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = event.clientX;
    const y = event.clientY;
    const above = y + menuH + 12 > vh;
    const alignRight = x + menuW + 8 > vw;
    const minY = vw < 768 ? 76 : 72;
    const clampedX = alignRight ? Math.max(10, x - menuW) : Math.min(Math.max(10, x), vw - menuW - 10);
    const clampedY = above ? Math.max(minY, y - menuH - 8) : Math.max(minY, Math.min(y + 10, vh - menuH - 10));
    return { fixed: true, x: clampedX, y: clampedY, above, alignRight };
  };

  const openPickerFromHoverButton = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
    setPicker(calcFixedPos(event, 284, 216));
  };

  const openMenuFromClick = (event: ReactMouseEvent | ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setPicker(null);
    menuOpenedAtRef.current = Date.now();
    setMenuOpen(true);
  };

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
        <div className={cn("relative flex max-w-[78%] flex-col sm:max-w-[68%] lg:max-w-[58%]", isOwn ? "items-end" : "items-start")}>
          {showSender && <span className="mb-1 ml-2 text-xs font-medium text-[#6B7280]">{sender?.name}</span>}
          <div className="group/message relative">
            <button
              type="button"
              onPointerDown={openMenuFromClick}
              onClick={openMenuFromClick}
              onContextMenu={openMenuFromContext}
              className={cn(
                "group/bubble relative rounded-[22px] px-4 py-2.5 text-left text-sm leading-relaxed shadow-sm transition-all duration-150 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-400/30",
                largeEmojiOnly && "px-4 py-3 text-4xl leading-tight",
                isOwn
                  ? "rounded-br-md bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-indigo-950/25 hover:shadow-indigo-500/25"
                  : "rounded-bl-md border border-[#E5E7EB] bg-white text-[#111827] hover:bg-white hover:shadow-indigo-100",
              )}
            >
            {replyMessage && (
              <div
                className={cn(
                  "relative mb-2 overflow-hidden rounded-xl border-l-2 px-3 py-2 text-xs",
                  isOwn ? "border-white/70 bg-white/20 text-white" : "border-indigo-300 bg-indigo-50 text-[#111827]",
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
              <PremiumMessageText text={text} isOwn={isOwn} large={largeEmojiOnly} />
            </div>
            <div className={cn("mt-1.5 flex items-center justify-end gap-1 text-[11px]", isOwn ? "text-white/70" : "text-[#6B7280]", largeEmojiOnly && "text-xs")}>
              {message.edited && <span>{t("app.chat.edited")}</span>}
              <span>{formatMessageTime(message.timestamp)}</span>
              {isOwn && <span className={message.read === false ? "text-white/65" : "text-cyan-100"}>{message.read === false ? t("app.chat.sent") : t("app.chat.readStatus")}</span>}
            </div>
            </button>
            <button
              type="button"
              onClick={openPickerFromHoverButton}
              className={cn(
                "absolute top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full border border-white/70 bg-white/86 text-gray-500 opacity-0 shadow-md shadow-indigo-950/10 backdrop-blur transition-all hover:scale-105 hover:text-indigo-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 group-hover/message:opacity-100 dark:border-gray-700 dark:bg-gray-800/88 dark:text-gray-300",
                isOwn ? "left-1.5" : "right-1.5",
              )}
              aria-label="Open quick reactions"
            >
              <Smile className="h-3.5 w-3.5" />
            </button>
          </div>

        {!!message.reactions?.length && (
          <div className={cn("mt-1 flex max-w-[min(100%,300px)] flex-wrap gap-1 overflow-visible", isOwn ? "justify-end pr-2" : "justify-start pl-2")}>
            {message.reactions.map((reaction) => {
              const reactionId = normalizeReactionId(reaction.emoji);
              const active = reaction.userIds.includes("me");
              return (
                <ReactionButton
                  key={reactionId}
                  asset={getReactionAsset(reactionId)}
                  active={active}
                  count={reaction.userIds.length}
                  compact
                  onClick={() => onToggleReaction(message.id, reactionId)}
                />
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
            <ReactionPicker activeEmojis={activeReactionEmojis} onSelect={handleReaction} onSelectNative={handleNativeReaction} />
          </div>,
          document.body,
        )}
    </>
  );
}
