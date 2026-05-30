import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pin, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Toast } from "@/components/app/DesignSystem";
import { ChatCallOverlay } from "@/components/chat/ChatCallOverlay";
import { ChatHeader, type ChatCallMode, type ChatHeaderAction } from "@/components/chat/ChatHeader";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { MessageInput } from "@/components/chat/MessageInput";
import { cn, getMessageText, getReplySnippet, getRoomName } from "@/components/chat/chatShared";
import { normalizeReactionId } from "@/components/premium/PremiumAssets";
import { MOCK_CHAT_ROOMS, MOCK_USERS } from "@/data/mockData";
import type { ChatMessage, ChatReactionEmoji, ChatRoom, UserProfile } from "@/types";
import { storage } from "@/utils/storage";

interface Props {
  user: UserProfile;
  onLogout: () => void;
}

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

export default function ChatPage(_: Props) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
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
    <div className="fixed inset-0 z-[100] flex min-h-0 overflow-hidden bg-[var(--upz-messenger-shell)] text-[#17212B] dark:bg-gray-950 dark:text-gray-100">
      <div className="flex h-full min-h-0 w-full overflow-hidden">
        <ChatSidebar
          rooms={rooms}
          users={MOCK_USERS}
          activeId={activeRoom?.id}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSelectRoom={handleSelectRoom}
          onBackToApp={handleBackToApp}
          className={cn("w-full md:flex md:w-[372px] md:flex-shrink-0", mobilePane === "chat" ? "hidden" : "flex")}
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
                  className="relative z-30 border-b border-[#D9E1E8] bg-[#FFFFFF]/96 px-3 py-2 backdrop-blur dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="mx-auto flex h-9 max-w-4xl items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-[#F7FAFC] px-3 focus-within:border-indigo-300 focus-within:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus-within:bg-gray-800">
                    <Search className="h-4 w-4 text-[#6B7280]" />
                    <input
                      value={chatSearchQuery}
                      onChange={(event) => setChatSearchQuery(event.target.value)}
                      placeholder={t("app.chat.searchRoom", { room: getRoomName(activeRoom, t) })}
                      className="min-w-0 flex-1 bg-transparent text-sm text-[#111827] outline-none placeholder:text-[#6B7280] dark:text-gray-100 dark:placeholder:text-gray-500"
                      autoFocus
                    />
                    {chatSearchQuery && (
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-[#6B7280] ring-1 ring-[#E5E7EB]">
                        {t("app.chat.results", { count: displayedMessages.length })}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setChatSearchOpen(false);
                        setChatSearchQuery("");
                      }}
                      className="rounded-xl p-1 text-[#6B7280] hover:bg-white hover:text-[#111827] dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
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
              className="relative z-20 flex h-9 items-center gap-2 border-b border-[#D9E1E8] bg-[#FFFFFF]/96 px-3 text-left backdrop-blur transition-colors hover:bg-[#F2F8FC] dark:border-gray-700 dark:bg-gray-900/96 dark:hover:bg-indigo-950/25"
              >
                <span className="grid h-6 w-6 place-items-center rounded-lg bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 dark:bg-indigo-950/40 dark:ring-indigo-900/60">
                  <Pin className="h-3 w-3" />
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-indigo-600">{t("app.chat.pinnedMessage")}</span>
                  <span className="truncate text-xs text-[#111827] dark:text-gray-100">{getReplySnippet(pinnedMessage, t)}</span>
                </span>
              </button>
            )}

            <div
              className="upz-messenger-wallpaper relative z-0 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 sm:px-5"
            >
              <div className="mx-auto flex max-w-[780px] flex-col gap-2.5">
                <div className="self-center rounded-full bg-[#728A96]/70 px-3 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur">
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
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto mt-16 max-w-sm rounded-3xl border border-[#E5E7EB] bg-white px-6 py-8 text-center shadow-sm">
                    <div className="text-sm font-semibold text-[#111827] dark:text-gray-100">{t("app.chat.historyCleared")}</div>
                    <p className="mt-2 text-sm text-[#6B7280]">{t("app.chat.historyClearedDesc")}</p>
                  </motion.div>
                )}

                {activeRoom.messages.length > 0 && displayedMessages.length === 0 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto mt-16 max-w-sm rounded-3xl border border-dashed border-[#E5E7EB] bg-white px-6 py-8 text-center shadow-sm">
                    <div className="text-sm font-semibold text-[#111827] dark:text-gray-100">{t("app.chat.noMessageFound")}</div>
                    <p className="mt-2 text-sm text-[#6B7280]">{t("app.chat.noMessageFoundDesc")}</p>
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
              onChange={setDraft}
              onSend={handleSend}
              onCancelReply={() => setReplyTo(null)}
              onCancelEdit={() => {
                setEditingMessage(null);
                setDraft("");
              }}
            />
          </section>
        ) : (
          <section className="flex min-w-0 flex-1 flex-col items-center justify-center bg-[#F7FAFC] px-6 text-center">
            <div className="rounded-3xl border border-[#E5E7EB] bg-white px-8 py-10 shadow-sm">
              <div className="text-base font-semibold text-[#111827] dark:text-gray-100">{t("app.chat.noChatsLeft")}</div>
              <p className="mt-2 max-w-sm text-sm text-[#6B7280]">{t("app.chat.noChatsLeftDesc")}</p>
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
