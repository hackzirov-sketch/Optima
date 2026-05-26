import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Edit, Mic, Paperclip, Reply, Send, Smile, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatMessage, ChatReactionEmoji, ChatRoom, ChatUser } from "@/types";
import { StickerPicker, getReactionAsset } from "@/components/premium/PremiumAssets";
import { ReactionPicker } from "./ReactionPicker";
import { cn, getReplySnippet, getRoomName, getUser } from "./chatShared";

interface MessageInputProps {
  room: ChatRoom;
  users: ChatUser[];
  value: string;
  replyTo: ChatMessage | null;
  editingMessage: ChatMessage | null;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}

export function MessageInput({
  room,
  users,
  value,
  replyTo,
  editingMessage,
  onChange,
  onSend,
  onCancelReply,
  onCancelEdit,
}: MessageInputProps) {
  const { t } = useTranslation();
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canMention = room.type !== "1on1" && room.type !== "ai" && room.type !== "saved";
  const mentionOpen = canMention && value.includes("@");
  const aiCommandOpen = value.trimStart().toLowerCase().startsWith("/ai");
  const typingUser = room.memberIds.map((id) => getUser(id, users)).find((candidate) => candidate && candidate.id !== "me" && candidate.status === "online");
  const roomName = getRoomName(room, t);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [value]);

  const appendEmoji = (emoji: ChatReactionEmoji) => {
    const asset = getReactionAsset(emoji);
    onChange(`${value}${value.endsWith(" ") || !value ? "" : " "}:${asset.id}:`);
    setEmojiOpen(false);
    textareaRef.current?.focus();
  };

  const appendEmojiAsset = (assetId: string) => {
    onChange(`${value}${value.endsWith(" ") || !value ? "" : " "}:${assetId}:`);
    setEmojiOpen(false);
    textareaRef.current?.focus();
  };

  const appendNativeEmoji = (native: string) => {
    onChange(`${value}${value.endsWith(" ") || !value ? "" : " "}${native}`);
    setEmojiOpen(false);
    textareaRef.current?.focus();
  };

  const appendSticker = (prompt: string) => {
    onChange(`${value}${value.endsWith(" ") || !value ? "" : " "}${prompt}`);
    setStickerOpen(false);
    textareaRef.current?.focus();
  };

  const getAiDraftText = () => value.replace(/^(\s*)\/ai\s*/i, "").trim();

  const applyAiDraft = (mode: "fix" | "professional" | "shorten" | "task") => {
    const source = getAiDraftText();
    if (!source) {
      onChange("/ai ");
      textareaRef.current?.focus();
      return;
    }

    const normalized = source.replace(/\s+/g, " ").trim();
    const capitalized = `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
    const withPunctuation = /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
    const nextValue =
      mode === "fix"
        ? withPunctuation
        : mode === "professional"
          ? `Salom, ${withPunctuation} Iltimos, imkon bo'lsa bugun ko'rib chiqamiz.`
          : mode === "shorten"
            ? `${capitalized.slice(0, 120)}${capitalized.length > 120 ? "..." : ""}`
            : `Task: ${withPunctuation}\nOwner: me\nPriority: medium\nNext step: review and confirm.`;

    onChange(nextValue);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex-shrink-0 border-t border-gray-200 bg-white px-3 py-2.5 backdrop-blur-xl dark:border-gray-700 dark:bg-gray-900 sm:px-5">
      <AnimatePresence>
        {typingUser && !editingMessage && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 3 }}
            className="mb-1.5 flex h-5 items-center gap-1.5 px-2 text-[11px] text-gray-400 dark:text-gray-500"
          >
            <span className="font-medium text-indigo-600 dark:text-indigo-400">{typingUser.name.split(" ")[0]}</span>
            <span>{t("app.chat.isTyping")}</span>
            <span className="ml-0.5 flex items-end gap-0.5" aria-hidden="true">
              <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.2s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-400 [animation-delay:-0.1s]" />
              <span className="h-1 w-1 animate-bounce rounded-full bg-indigo-400" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {aiCommandOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 overflow-hidden rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-2.5 shadow-sm dark:border-indigo-900/50 dark:from-indigo-950/35 dark:via-gray-900 dark:to-blue-950/25"
          >
            <div className="flex items-start gap-2">
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-300 dark:shadow-indigo-950">
                <Bot className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t("app.chat.aiComposeTitle", "AI yozish yordamchisi")}
                </div>
                <p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  {t("app.chat.aiComposeDesc", "/ai dan keyin matn yozing, keyin uni tuzating yoki professional qiling.")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[
                    ["fix", t("app.chat.aiFix", "Tuzatish")],
                    ["professional", t("app.chat.aiProfessional", "Professional")],
                    ["shorten", t("app.chat.aiShorten", "Qisqartirish")],
                    ["task", t("app.chat.aiTask", "Task qilish")],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => applyAiDraft(mode as "fix" | "professional" | "shorten" | "task")}
                      className="rounded-full border border-indigo-100 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-600 hover:text-white dark:border-indigo-800 dark:bg-gray-900 dark:text-indigo-300 dark:hover:bg-indigo-600 dark:hover:text-white"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 flex items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-sm dark:border-indigo-900/50 dark:bg-indigo-950/25"
          >
            <Reply className="h-4 w-4 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{t("app.chat.replyingTo", { name: getUser(replyTo.userId, users)?.name ?? t("app.chat.messageFallback") })}</div>
              <div className="truncate text-xs text-gray-400 dark:text-gray-500">{getReplySnippet(replyTo, t)}</div>
            </div>
            <button type="button" onClick={onCancelReply} className="text-lg leading-none text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200" aria-label={t("app.chat.closeSearch")}>
              x
            </button>
          </motion.div>
        )}
        {editingMessage && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 flex items-center gap-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-950/30"
          >
            <Edit className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">{t("app.chat.editingMessage")}</div>
              <div className="truncate text-xs text-gray-400 dark:text-gray-500">{t("app.chat.pressEnterSave")}</div>
            </div>
            <button type="button" onClick={onCancelEdit} className="text-lg leading-none text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200" aria-label={t("app.chat.editingMessage")}>
              x
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative flex items-end gap-2 rounded-[24px] border border-gray-200 bg-gray-50 p-1.5 shadow-sm transition-colors focus-within:border-indigo-300 focus-within:bg-white dark:border-gray-600 dark:bg-gray-800 dark:focus-within:border-indigo-500 dark:focus-within:bg-gray-700">
        <button
          type="button"
          onClick={() => {
            setStickerOpen((current) => !current);
            setEmojiOpen(false);
          }}
          className={cn(
            "grid h-10 w-10 flex-shrink-0 place-items-center rounded-full transition-colors hover:bg-white hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-gray-100",
            stickerOpen ? "bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100" : "text-gray-400 dark:text-gray-500",
          )}
          aria-label={t("app.chat.attachFile")}
        >
          <Paperclip className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            setEmojiOpen((current) => !current);
            setStickerOpen(false);
          }}
          className={cn(
            "grid h-10 w-10 flex-shrink-0 place-items-center rounded-full transition-colors hover:bg-white hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-gray-100",
            emojiOpen ? "bg-white text-gray-900 dark:bg-gray-700 dark:text-gray-100" : "text-gray-400 dark:text-gray-500",
          )}
          aria-label={t("app.chat.emojiPicker")}
        >
          <Smile className="h-5 w-5" />
        </button>

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={canMention ? t("app.chat.mentionPlaceholder", { room: roomName }) : t("app.chat.messagePlaceholder", { room: roomName })}
          className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent py-2.5 text-sm leading-5 text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
        />

        <button type="button" className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-gray-400 transition-colors hover:bg-white hover:text-gray-900 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-100" aria-label={t("app.chat.voicePlaceholder")}>
          <Mic className="h-5 w-5" />
        </button>
        <motion.button
          type="button"
          disabled={!value.trim()}
          onClick={onSend}
          whileHover={value.trim() ? { scale: 1.04 } : undefined}
          whileTap={value.trim() ? { scale: 0.96 } : undefined}
          className={cn(
            "grid h-11 w-11 flex-shrink-0 place-items-center rounded-full shadow-lg transition-all",
            value.trim()
              ? "bg-gradient-to-br from-indigo-500 to-blue-500 text-white shadow-indigo-950/30"
              : "cursor-not-allowed bg-white text-gray-400 shadow-none dark:bg-gray-700 dark:text-gray-500",
          )}
          aria-label={t("app.chat.sendMessage")}
        >
          <Send className="h-5 w-5" />
        </motion.button>

        <AnimatePresence>
          {emojiOpen && (
            <div className="absolute bottom-[58px] left-0 z-40 max-w-[calc(100vw-1.5rem)]">
              <ReactionPicker mode="message" onSelect={appendEmoji} onSelectAsset={appendEmojiAsset} onSelectNative={appendNativeEmoji} />
            </div>
          )}
          {stickerOpen && (
            <div className="absolute bottom-[58px] left-0 z-40 max-w-[calc(100vw-1.5rem)]">
              <StickerPicker
                onSelect={(sticker) => appendSticker(sticker.prompt)}
                onClose={() => setStickerOpen(false)}
              />
            </div>
          )}
        </AnimatePresence>
      </div>

      {!aiCommandOpen && (
        <div className="mt-1.5 px-2 text-[11px] text-gray-400 dark:text-gray-500">
          {t("app.chat.aiComposeHint", "Maslahat: xabarni yozishda /ai yozib matnni tuzatish yoki qisqartirish mumkin.")}
        </div>
      )}

      <AnimatePresence>
        {mentionOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="mt-2 flex flex-wrap gap-2 px-2"
          >
            {room.memberIds
              .filter((id) => id !== "me")
              .slice(0, 4)
              .map((memberId) => {
                const member = getUser(memberId, users);
                if (!member) return null;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => onChange(value.replace(/@\w*$/, `@${member.name.split(" ")[0]} `))}
                    className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
                  >
                    @{member.name.split(" ")[0]}
                  </button>
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
