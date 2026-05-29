'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckSquare, Pin, Search, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/app/DesignSystem";
import { ChatCallOverlay } from "@/components/chat/ChatCallOverlay";
import { ChatHeader, type ChatCallMode, type ChatHeaderAction } from "@/components/chat/ChatHeader";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageInput } from "@/components/chat/MessageInput";
import { cn, getMessageText, getReplySnippet, getRoomName } from "@/components/chat/chatShared";
import { normalizeReactionId } from "@/components/premium/PremiumAssets";
import { MOCK_CHAT_ROOMS, MOCK_USERS } from "@/data/mockData";
import { SMART_TASKS } from "@/data/ecosystemData";
import type { ChatMessage, ChatReactionEmoji, ChatRoom, UserProfile } from "@/types";
import { storage } from "@/utils/storage";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";



interface ActiveCall {
  roomId: string;
  mode: ChatCallMode;
  startedAt: number;
}

function getInitialRooms() {
  const saved = storage.getChatRooms();
  if (saved.length === 0) return MOCK_CHAT_ROOMS;

  const savedIds = new Set(saved.map((room) => room.id));
  const requiredDemoRooms = MOCK_CHAT_ROOMS.filter((room) => ["r-ai", "r-saved"].includes(room.id) && !savedIds.has(room.id));
  return [...requiredDemoRooms, ...saved];
}

function createAiReply(text: string) {
  const clean = text.replace(/^\/ai\s*/i, "").trim();
  if (!clean) {
    return "Men tayyorman. Matn, loyiha yoki vazifa yozing, men uni tartiblayman.";
  }

  if (clean.length < 90) {
    return `Tushunarli. Mana professionalroq variant: "${clean.charAt(0).toUpperCase()}${clean.slice(1)}"`;
  }

  return `Qisqa xulosa: ${clean.slice(0, 150)}${clean.length > 150 ? "..." : ""}\n\nTaklif: buni task, meeting agenda yoki chat reply formatiga aylantirish mumkin.`;
}

function updateMessageReaction(message: ChatMessage, emoji: ChatReactionEmoji): ChatMessage {
  const targetEmoji = normalizeReactionId(emoji);
  const reactions = (message.reactions ?? []).map((reaction) => ({
    ...reaction,
    emoji: normalizeReactionId(reaction.emoji),
    userIds: [...reaction.userIds],
  }));
  const existing = reactions.find((reaction) => reaction.emoji === targetEmoji);

  if (!existing) {
    reactions.push({ emoji: targetEmoji, userIds: ["me"] });
  } else if (existing.userIds.includes("me")) {
    existing.userIds = existing.userIds.filter((userId) => userId !== "me");
  } else {
    existing.userIds.push("me");
  }

  return { ...message, reactions: reactions.filter((reaction) => reaction.userIds.length > 0) };
}

export default function ChatPage() {
  const { user, hasBackendSession } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = (path: string) => router.push(path);
  const [rooms, setRooms] = useState<ChatRoom[]>(getInitialRooms);
  const [activeId, setActiveId] = useState(MOCK_CHAT_ROOMS[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [notice, setNotice] = useState<string | null>(null);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── WebSocket integration ────────────────────────────────────────────────
  const roomIds = useMemo(() => rooms.map((r) => r.id), [rooms]);

  const { isConnected, onlineUsers, sendMessage: wsSend, sendTyping, addReaction: wsReaction } = useWebSocket({
    disabled: !hasBackendSession,
    rooms: roomIds,
    onNewMessage: (msg) => {
      setRooms((current) =>
        current.map((room) => {
          if (room.id !== msg.roomId) return room;
          // Deduplicate
          if (room.messages.some((m) => m.id === msg.id)) return room;
          const newMsg: ChatMessage = {
            id: msg.id,
            userId: msg.userId,
            text: msg.text,
            timestamp: msg.timestamp,
            replyToId: msg.replyToId ?? undefined,
            reactions: msg.reactions,
          };
          return {
            ...room,
            messages: [...room.messages, newMsg],
            unread: msg.userId !== "me" ? (room.unread ?? 0) + 1 : room.unread,
          };
        }),
      );
    },
    onReactionUpdated: (evt) => {
      setRooms((current) =>
        current.map((room) => {
          if (room.id !== evt.roomId) return room;
          return {
            ...room,
            messages: room.messages.map((msg) => {
              if (msg.id !== evt.messageId) return msg;
              return updateMessageReaction(msg, evt.emoji as ChatReactionEmoji);
            }),
          };
        }),
      );
    },
  });
  // ────────────────────────────────────────────────────────────────────────

  const activeRoom = useMemo(() => rooms.find((room) => room.id === activeId) ?? rooms[0], [activeId, rooms]);
  const callRoom = useMemo(
    () => (activeCall ? rooms.find((room) => room.id === activeCall.roomId) : undefined),
    [activeCall, rooms],
  );
  const pinnedMessage = activeRoom?.pinnedMessageId
    ? activeRoom.messages.find((message) => message.id === activeRoom.pinnedMessageId)
    : undefined;
  const normalizedChatSearch = chatSearchQuery.trim().toLowerCase();
  const displayedMessages = useMemo(() => {

    if (!activeRoom) return [];
    if (!normalizedChatSearch) return activeRoom.messages;
    return activeRoom.messages.filter((message) => {
      const sender = MOCK_USERS.find((candidate) => candidate.id === message.userId)?.name ?? "";
      return `${sender} ${getMessageText(message, t)}`.toLowerCase().includes(normalizedChatSearch);
    });
  }, [activeRoom, normalizedChatSearch, t]);

  useEffect(() => {
    storage.saveChatRooms(rooms);
  }, [rooms]);

  useEffect(() => {
    if (activeRoom && activeRoom.id !== activeId) {
      setActiveId(activeRoom.id);
    }
  }, [activeId, activeRoom]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeRoom?.id, activeRoom?.messages.length]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const updateActiveRoom = (updater: (room: ChatRoom) => ChatRoom) => {
    if (!activeRoom) return;
    setRooms((currentRooms) => currentRooms.map((room) => (room.id === activeRoom.id ? updater(room) : room)));
  };

  const handleSelectRoom = (roomId: string) => {
    setActiveId(roomId);
    setMobilePane("chat");
    setReplyTo(null);
    setEditingMessage(null);
    setChatSearchQuery("");
    setRooms((currentRooms) => currentRooms.map((room) => (room.id === roomId ? { ...room, unread: 0 } : room)));
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !activeRoom) return;

    if (editingMessage) {
      updateActiveRoom((room) => ({
        ...room,
        messages: room.messages.map((message) =>
          message.id === editingMessage.id
            ? { ...message, text, edited: true, timestamp: Date.now() }
            : message,
        ),
      }));
      setEditingMessage(null);
      setDraft("");
      return;
    }

    const newMessage: ChatMessage = {
      id: `m-${Date.now()}`,
      userId: "me",
      text,
      timestamp: Date.now(),
      read: true,
      replyToId: replyTo?.id,
    };

    // Emit through WebSocket if connected (non-AI rooms)
    if (isConnected && activeRoom.type !== "ai" && activeRoom.type !== "saved") {
      wsSend(activeRoom.id, text, replyTo?.id);
    }

    updateActiveRoom((room) => ({
      ...room,
      unread: 0,
      messages:
        room.type === "ai"
          ? [
              ...room.messages,
              newMessage,
              {
                id: `m-ai-${Date.now() + 1}`,
                userId: "ai",
                text: createAiReply(text),
                timestamp: Date.now() + 600,
                read: true,
              },
            ]
          : [...room.messages, newMessage],
    }));
    setDraft("");
    setReplyTo(null);
  };

  const handleDeleteMessage = (messageId: string) => {
    updateActiveRoom((room) => ({
      ...room,
      pinnedMessageId: room.pinnedMessageId === messageId ? undefined : room.pinnedMessageId,
      messages: room.messages.filter((message) => message.id !== messageId),
    }));
    if (replyTo?.id === messageId) setReplyTo(null);
    if (editingMessage?.id === messageId) {
      setEditingMessage(null);
      setDraft("");
    }
  };

  const handleReply = (message: ChatMessage) => {
    setReplyTo(message);
    setEditingMessage(null);
  };

  const handleEdit = (message: ChatMessage) => {
    setEditingMessage(message);
    setReplyTo(null);
    setDraft(getMessageText(message, t));
  };

  const handleForward = (message: ChatMessage) => {
    setEditingMessage(null);
    setReplyTo(null);
    setDraft(t("app.chat.forwarded", { text: getMessageText(message, t) }));
    setNotice(t("app.chat.forwardComposer"));
  };

  const handlePinMessage = (messageId: string) => {
    updateActiveRoom((room) => ({
      ...room,
      pinnedMessageId: room.pinnedMessageId === messageId ? undefined : messageId,
    }));
  };

  const handleToggleReaction = (messageId: string, emoji: ChatReactionEmoji) => {
    updateActiveRoom((room) => ({
      ...room,
      messages: room.messages.map((message) => (message.id === messageId ? updateMessageReaction(message, emoji) : message)),
    }));
    if (isConnected && activeRoom && activeRoom.type !== "ai" && activeRoom.type !== "saved") {
      wsReaction(activeRoom.id, messageId, emoji);
    }
  };

  const handleStartCall = (mode: ChatCallMode) => {
    if (!activeRoom) return;
    setActiveCall({ roomId: activeRoom.id, mode, startedAt: Date.now() });
    setMobilePane("chat");
  };

  const handleHeaderAction = (action: ChatHeaderAction) => {
    if (!activeRoom) return;

    if (action === "profile") {
      setNotice(t("app.chat.profilePlaceholder", { name: getRoomName(activeRoom, t) }));
      return;
    }

    if (action === "search") {
      setChatSearchOpen((current) => !current);
      return;
    }

    if (action === "mute") {
      updateActiveRoom((room) => ({ ...room, muted: !room.muted }));
      return;
    }

    if (action === "pin") {
      updateActiveRoom((room) => ({ ...room, pinned: !room.pinned }));
      return;
    }

    if (action === "clear") {
      updateActiveRoom((room) => ({ ...room, messages: [], pinnedMessageId: undefined, unread: 0 }));
      setReplyTo(null);
      setEditingMessage(null);
      setDraft("");
      return;
    }

    if (action === "delete") {
      setRooms((currentRooms) => {
        const remainingRooms = currentRooms.filter((room) => room.id !== activeRoom.id);
        setActiveId(remainingRooms[0]?.id ?? "");
        setMobilePane(remainingRooms.length > 0 ? "list" : "chat");
        return remainingRooms;
      });
      setActiveCall((currentCall) => (currentCall?.roomId === activeRoom.id ? null : currentCall));
      setReplyTo(null);
      setEditingMessage(null);
      setDraft("");
    }
  };

  const handleBackToApp = () => {
    navigate("/app/home");
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex min-h-0 overflow-hidden bg-card text-foreground dark:bg-gray-950 dark:text-gray-100"
      style={{
        background:
          "radial-gradient(circle at 12% 0%, var(--upz-shell-glow-a), transparent 28%), radial-gradient(circle at 92% 8%, var(--upz-shell-glow-b), transparent 24%), var(--upz-bg)",
      }}
    >
      <div
        className="flex h-full min-h-0 w-full overflow-hidden bg-card dark:bg-gray-900"
      >
        <ChatSidebar
          rooms={rooms}
          users={MOCK_USERS}
          activeId={activeRoom?.id}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSelectRoom={handleSelectRoom}
          onBackToApp={handleBackToApp}
          className={cn("w-full md:flex md:w-[360px] md:flex-shrink-0", mobilePane === "chat" ? "hidden" : "flex")}
        />

        {activeRoom ? (
          <section className={cn("relative min-w-0 flex-1 flex-col", mobilePane === "list" ? "hidden md:flex" : "flex")}>
            <ChatHeader
              room={activeRoom}
              users={MOCK_USERS}
              onBackToList={() => setMobilePane("list")}
              onAction={handleHeaderAction}
              onStartCall={handleStartCall}
            />

            <div className="relative z-20 border-b border-gray-200 bg-card/96 px-3 py-1.5 backdrop-blur dark:border-gray-700 dark:bg-gray-900/96">
              <div className="flex h-9 items-center gap-2 rounded-2xl bg-gray-50/80 px-2.5 ring-1 ring-gray-200/80 dark:bg-gray-800/70 dark:ring-gray-700">
                <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-lg bg-card text-indigo-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700">
                  <CheckSquare className="h-3.5 w-3.5" />
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="hidden rounded-full bg-card px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-700 sm:inline-flex">
                    Linked
                  </span>
                  <p className="truncate text-xs font-semibold text-foreground dark:text-gray-100">{SMART_TASKS[0].title}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setNotice("Task created from selected message locally")}
                    className="grid h-7 w-7 place-items-center rounded-full text-gray-500 transition-colors hover:bg-card hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-gray-900"
                    aria-label="Create task from chat"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotice("AI summarized this chat locally")}
                    className="grid h-7 w-7 place-items-center rounded-full text-gray-500 transition-colors hover:bg-card hover:text-indigo-600 dark:text-gray-400 dark:hover:bg-gray-900"
                    aria-label="Summarize chat with AI"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {activeCall && callRoom && (
                <ChatCallOverlay
                  key={activeCall.roomId}
                  room={callRoom}
                  users={MOCK_USERS}
                  mode={activeCall.mode}
                  startedAt={activeCall.startedAt}
                  onClose={() => setActiveCall(null)}
                  onSwitchMode={(mode) => setActiveCall((currentCall) => (currentCall ? { ...currentCall, mode } : currentCall))}
                />
              )}
            </AnimatePresence>

            <AnimatePresence>
              {chatSearchOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="relative z-30 border-b border-gray-200 bg-card px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="mx-auto flex h-9 max-w-4xl items-center gap-2 rounded-2xl border border-border bg-muted px-3 focus-within:border-indigo-300 focus-within:bg-card dark:border-gray-700 dark:bg-gray-800 dark:focus-within:bg-gray-800">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      value={chatSearchQuery}
                      onChange={(event) => setChatSearchQuery(event.target.value)}
                      placeholder={t("app.chat.searchRoom", { room: getRoomName(activeRoom, t) })}
                      className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                      autoFocus
                    />
                    {chatSearchQuery && (
                      <span className="rounded-full bg-card px-2 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-[#E5E7EB]">
                        {t("app.chat.results", { count: displayedMessages.length })}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setChatSearchOpen(false);
                        setChatSearchQuery("");
                      }}
                      className="rounded-xl p-1 text-muted-foreground hover:bg-card hover:text-foreground"
                      aria-label={t("app.chat.closeSearch")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {pinnedMessage && (
              <button
                type="button"
                onClick={() => setNotice(t("app.chat.pinnedNotice"))}
                className="relative z-20 flex h-9 items-center gap-2 border-b border-gray-200 bg-card/96 px-3 text-left backdrop-blur transition-colors hover:bg-indigo-50/70 dark:border-gray-700 dark:bg-gray-900/96 dark:hover:bg-indigo-950/25"
              >
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:ring-indigo-900/60">
                  <Pin className="h-3 w-3" />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600">{t("app.chat.pinnedMessage")}</span>
                  <span className="truncate text-xs text-foreground dark:text-gray-100">{getReplySnippet(pinnedMessage, t)}</span>
                </span>
              </button>
            )}

            <div
              className="relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 sm:px-5"
              style={{
                background:
                  "radial-gradient(circle at 12% 0%, var(--upz-chat-glow-a), transparent 28%), radial-gradient(circle at 100% 20%, var(--upz-chat-glow-b), transparent 24%), linear-gradient(135deg, var(--upz-chat-bg-a), var(--upz-chat-bg-b))",
              }}
            >
              <div className="mx-auto flex max-w-4xl flex-col gap-3">
                <div className="self-center rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
                  {t("app.chat.today")}
                </div>

                <AnimatePresence initial={false}>
                  {displayedMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      room={activeRoom}
                      message={message}
                      users={MOCK_USERS}
                      replyMessage={activeRoom.messages.find((candidate) => candidate.id === message.replyToId)}
                      isPinned={activeRoom.pinnedMessageId === message.id}
                      onReply={handleReply}
                      onEdit={handleEdit}
                      onDelete={handleDeleteMessage}
                      onForward={handleForward}
                      onPin={handlePinMessage}
                      onToggleReaction={handleToggleReaction}
                    />
                  ))}
                </AnimatePresence>

                {activeRoom.messages.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto mt-16 max-w-sm rounded-3xl border border-border bg-card px-6 py-8 text-center shadow-sm">
                    <div className="text-sm font-semibold text-foreground">{t("app.chat.historyCleared")}</div>
                    <p className="mt-2 text-sm text-muted-foreground">{t("app.chat.historyClearedDesc")}</p>
                  </motion.div>
                )}

                {activeRoom.messages.length > 0 && displayedMessages.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto mt-16 max-w-sm rounded-3xl border border-dashed border-border bg-card px-6 py-8 text-center shadow-sm">
                    <div className="text-sm font-semibold text-foreground">{t("app.chat.noMessageFound")}</div>
                    <p className="mt-2 text-sm text-muted-foreground">{t("app.chat.noMessageFoundDesc")}</p>
                  </motion.div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <MessageInput
              room={activeRoom}
              users={MOCK_USERS}
              value={draft}
              replyTo={replyTo}
              editingMessage={editingMessage}
              onChange={(val) => {
                setDraft(val);
                if (isConnected && activeRoom && activeRoom.type !== "ai") {
                  sendTyping(activeRoom.id, val.length > 0);
                }
              }}
              onSend={handleSend}
              onCancelReply={() => setReplyTo(null)}
              onCancelEdit={() => {
                setEditingMessage(null);
                setDraft("");
              }}
            />
          </section>
        ) : (
          <section className="flex min-w-0 flex-1 flex-col items-center justify-center bg-muted px-6 text-center">
            <div className="rounded-3xl border border-border bg-card px-8 py-10 shadow-sm">
              <div className="text-base font-semibold text-foreground">{t("app.chat.noChatsLeft")}</div>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">{t("app.chat.noChatsLeftDesc")}</p>
            </div>
          </section>
        )}
      </div>
      <AnimatePresence>
        <Toast message={notice} />
      </AnimatePresence>
    </div>
  );
}
