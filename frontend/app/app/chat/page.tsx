'use client';


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
import { SMART_TASKS } from "@/data/ecosystemData";
import type { ChatMessage, ChatReactionEmoji, ChatRoom, ChatUser } from "@/types";
import { storage } from "@/utils/storage";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useMeeting, type MeetingMode } from "@/hooks/useMeeting";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useMembers } from "@/hooks/useMembers";
import { chatApi, mapApiChatRoomType, getAccessToken, API_BASE } from "@/lib/api";

const USER_COLORS = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#14B8A6'];
const AI_USER: ChatUser = { id: 'ai', name: 'UPZ AI', initials: 'AI', color: '#0EA5E9', status: 'online', role: 'AI Assistant' };



interface ActiveCall {
  roomId: string;
  mode: ChatCallMode;
  startedAt: number;
}

const AI_ROOM: ChatRoom = {
  id: "r-ai",
  name: "UPZ AI",
  type: "ai",
  memberIds: [],
  messages: [],
  unread: 0,
  pinned: false,
};

function getInitialRooms(): ChatRoom[] {
  return [AI_ROOM];
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

function isPersistedChatRoom(room: ChatRoom) {
  return !room.id.startsWith("r-") && room.type !== "ai" && room.type !== "saved";
}

export default function ChatPage() {
  const { user, hasBackendSession, backendUser } = useAuth();
  const { t } = useTranslation();
  const { activeWorkspace } = useWorkspace();
  const { members } = useMembers(activeWorkspace?.id);

  // WS is initialized below; onlineUsers updated via onUserOnline/Offline callbacks
  const [wsOnlineUsers, setWsOnlineUsers] = useState<string[]>([]);
  // roomId → userId[] currently typing
  const [typingByRoom, setTypingByRoom] = useState<Record<string, string[]>>({});

  // Build real users list: current user + workspace members + AI
  // Status comes from WS online presence
  const chatUsers: ChatUser[] = useMemo(() => {
    const onlineSet = new Set(wsOnlineUsers);
    const currentUser: ChatUser = {
      id: 'me',
      name: user?.name ?? 'Me',
      initials: (user?.name ?? 'M').slice(0, 2).toUpperCase(),
      color: '#6366F1',
      status: 'online',
    };
    const memberUsers: ChatUser[] = members.map((m, i) => ({
      id: m.userId,
      name: `${m.user.firstName} ${m.user.lastName}`.trim(),
      initials: `${m.user.firstName?.[0] ?? ''}${m.user.lastName?.[0] ?? ''}`.toUpperCase(),
      color: USER_COLORS[i % USER_COLORS.length],
      status: onlineSet.has(m.userId) ? ('online' as const) : ('offline' as const),
      role: m.role,
    }));
    return [AI_USER, currentUser, ...memberUsers];
  }, [user, members, wsOnlineUsers]);
  const router = useRouter();
  const navigate = (path: string) => router.push(path);
  const [rooms, setRooms] = useState<ChatRoom[]>(getInitialRooms);
  const [activeId, setActiveId] = useState("r-ai");
  const [roomsKey, setRoomsKey] = useState(0); // increments when rooms reload, forces messages refetch
  const [searchQuery, setSearchQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  const [notice, setNotice] = useState<string | null>(null);
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── WebSocket integration ────────────────────────────────────────────────
  // Only join real backend rooms (never mock r-* IDs — backend validates membership)
  const realRoomIds = useMemo(
    () => rooms.filter((r) => !r.id.startsWith("r-") && r.isMember !== false).map((r) => r.id),
    [rooms],
  );

  // Meeting: ref-based forward-declaration to break circular dep (WS↔meeting)
  const meetingWsRef = useRef({
    meetingJoin: (_id: string) => {},
    meetingLeave: (_id: string) => {},
    meetingOffer: (_id: string, _t: string, _sdp: RTCSessionDescriptionInit) => {},
    meetingAnswer: (_id: string, _t: string, _sdp: RTCSessionDescriptionInit) => {},
    meetingIce: (_id: string, _t: string, _c: RTCIceCandidateInit) => {},
    meetingToggle: (_id: string, _k: 'audio'|'video'|'screen', _on: boolean) => {},
  });

  const meeting = useMeeting({
    meetingId: activeCall?.roomId ?? null,
    mode: (activeCall?.mode as MeetingMode) ?? 'voice',
    enabled: !!activeCall,
    currentUserId: backendUser?.id ?? null,
    meetingJoin: (id) => meetingWsRef.current.meetingJoin(id),
    meetingLeave: (id) => meetingWsRef.current.meetingLeave(id),
    meetingOffer: (id, t, sdp) => meetingWsRef.current.meetingOffer(id, t, sdp),
    meetingAnswer: (id, t, sdp) => meetingWsRef.current.meetingAnswer(id, t, sdp),
    meetingIce: (id, t, c) => meetingWsRef.current.meetingIce(id, t, c),
    meetingToggle: (id, k, on) => meetingWsRef.current.meetingToggle(id, k, on),
  });

  const {
    isConnected, sendMessage: wsSend, sendTyping, addReaction: wsReaction,
    meetingJoin, meetingLeave, meetingOffer, meetingAnswer, meetingIce, meetingToggle,
  } = useWebSocket({
    disabled: !hasBackendSession,
    rooms: realRoomIds,
    ...meeting.handlers,
    onNewMessage: (msg) => {
      setRooms((current) =>
        current.map((room) => {
          if (room.id !== msg.roomId) return room;
          if (room.messages.some((m) => m.id === msg.id)) return room;

          const isMyMsg = !!(backendUser?.id && msg.userId === backendUser.id);
          const senderId = isMyMsg ? "me" : msg.userId;
          const newMsg: ChatMessage = {
            id: msg.id,
            userId: senderId,
            text: msg.text,
            timestamp: msg.timestamp,
            replyToId: msg.replyToId ?? undefined,
            reactions: (msg.reactions ?? []) as ChatMessage["reactions"],
            edited: false,
            editedAt: null,
          };

          // Replace optimistic placeholder sent by this user
          if (isMyMsg) {
            const optIdx = room.messages.findIndex(
              (m) => m.id.startsWith("opt-") && m.userId === "me" && m.text === msg.text,
            );
            if (optIdx !== -1) {
              const msgs = [...room.messages];
              msgs[optIdx] = newMsg;
              return { ...room, messages: msgs };
            }
          }

          // Clear typing for this sender
          setTypingByRoom((prev) => ({
            ...prev,
            [msg.roomId]: (prev[msg.roomId] ?? []).filter((id) => id !== msg.userId),
          }));

          return {
            ...room,
            messages: [...room.messages, newMsg],
            unread: senderId !== "me" ? (room.unread ?? 0) + 1 : room.unread,
          };
        }),
      );
    },
    onTyping: ({ userId, roomId, typing }) => {
      if (userId === backendUser?.id) return;
      setTypingByRoom((prev) => {
        const current = prev[roomId] ?? [];
        if (typing) {
          return { ...prev, [roomId]: [...new Set([...current, userId])] };
        }
        return { ...prev, [roomId]: current.filter((id) => id !== userId) };
      });
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
    onUserOnline: (userId) => setWsOnlineUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId])),
    onUserOffline: (userId) => setWsOnlineUsers((prev) => prev.filter((id) => id !== userId)),
  });

  // Update WS emitters ref so useMeeting can call them
  useEffect(() => {
    meetingWsRef.current = { meetingJoin, meetingLeave, meetingOffer, meetingAnswer, meetingIce, meetingToggle };
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
      const sender = chatUsers.find((candidate) => candidate.id === message.userId)?.name ?? "";
      return `${sender} ${getMessageText(message, t)}`.toLowerCase().includes(normalizedChatSearch);
    });
  }, [activeRoom, normalizedChatSearch, t]);

  // Load real chat rooms when connected; auto-seed #general if none exist
  useEffect(() => {
    if (!hasBackendSession || !activeWorkspace) return;

    const mergeRooms = (apiRooms: ChatRoom[]) => {
      setRooms((prev) => {
        const localRooms = prev.filter((r) => r.id === "r-ai");
        const realIds = new Set(apiRooms.map((r) => r.id));
        const filtered = localRooms.filter((r) => !realIds.has(r.id));
        return [...apiRooms, ...filtered];
      });
      setActiveId((cur) => cur === "r-ai" ? (apiRooms[0]?.id ?? cur) : cur);
      // Force messages to reload even if activeId didn't change
      setRoomsKey((k) => k + 1);
    };

    chatApi.listRooms(activeWorkspace.id).then(async (res) => {
      let apiRooms: ChatRoom[] = (res?.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        type: mapApiChatRoomType(r.type) as ChatRoom["type"],
        memberIds: r.memberIds ?? [],
        messages: [],
        unread: r.unreadCount ?? 0,
        pinned: false,
        isPublic: r.isPublic ?? false,
        inviteCode: r.inviteCode ?? null,
        isMember: r.isMember ?? true,
        createdById: r.createdById,
        description: r.description ?? undefined,
      }));

      // First visit: auto-create #general workspace channel
      if (apiRooms.length === 0) {
        try {
          const created = await chatApi.createRoom(activeWorkspace.id, {
            type: "workspace",
            name: "general",
          });
          apiRooms = [
            {
              id: created.data.id,
              name: created.data.name,
              type: mapApiChatRoomType(created.data.type) as ChatRoom["type"],
              memberIds: created.data.memberIds ?? [],
              messages: [],
              unread: 0,
              pinned: false,
            },
          ];
        } catch {
          // Seed failed silently — user can create manually via "+"
        }
      }

      if (apiRooms.length > 0) mergeRooms(apiRooms);

      // Also load public rooms user hasn't joined yet
      chatApi.listPublicRooms(activeWorkspace.id).then((pubRes) => {
        const pubRooms: ChatRoom[] = (pubRes?.data ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          type: mapApiChatRoomType(r.type) as ChatRoom["type"],
          memberIds: r.memberIds ?? [],
          messages: [],
          unread: 0,
          pinned: false,
          isPublic: true,
          inviteCode: r.inviteCode ?? null,
          isMember: false,
          createdById: r.createdById,
          description: r.description ?? undefined,
        }));
        if (pubRooms.length > 0) {
          setRooms((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const newOnes = pubRooms.filter((r) => !existingIds.has(r.id));
            return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
          });
        }
      }).catch(() => { /* ignore if endpoint unavailable */ });
    }).catch(console.error);
  }, [hasBackendSession, activeWorkspace]);

  // Load messages for active room from API (roomsKey forces reload when workspace changes)
  useEffect(() => {
    if (!hasBackendSession || !activeId) return;
    if (activeId.startsWith("r-")) return;
    chatApi.getMessages(activeId, 1, 50, backendUser?.id).then((res) => {
      const apiMessages: ChatMessage[] = (res?.data ?? [])
        .map((m) => ({
          id: m.id,
          userId: m.userId,
          text: m.text,
          timestamp: m.timestamp,
          replyToId: m.replyToId ?? undefined,
          edited: m.edited,
          reactions: m.reactions ?? [],
        }))
        .reverse();
      setRooms((prev) => prev.map((r) =>
        r.id === activeId ? { ...r, messages: apiMessages } : r,
      ));
    }).catch(console.error);
  }, [hasBackendSession, activeId, backendUser?.id, roomsKey]);

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
      const applyEdit = () => {
        updateActiveRoom((room) => ({
          ...room,
          messages: room.messages.map((message) =>
            message.id === editingMessage.id
              ? { ...message, text, edited: true, editedAt: new Date().toISOString(), timestamp: Date.now() }
              : message,
          ),
        }));
        setEditingMessage(null);
        setDraft("");
      };

      if (isPersistedChatRoom(activeRoom) && !editingMessage.id.startsWith("m-")) {
        chatApi
          .editMessage(editingMessage.id, text, backendUser?.id)
          .then(applyEdit)
          .catch((err) => {
            console.error(err);
            setNotice(t("app.chat.saveFailed", "Saqlashda xatolik"));
          });
        return;
      }

      applyEdit();
      return;
    }

    const persisted = isPersistedChatRoom(activeRoom);

    if (persisted) {
      if (isConnected) {
        // Optimistic: show immediately, replaced on WS echo via dedup in onNewMessage
        const optimistic: ChatMessage = {
          id: `opt-${Date.now()}`,
          userId: "me",
          text,
          timestamp: Date.now(),
          replyToId: replyTo?.id,
          reactions: [],
        };
        updateActiveRoom((room) => ({
          ...room,
          unread: 0,
          messages: [...room.messages, optimistic],
        }));
        wsSend(activeRoom.id, text, replyTo?.id);
      } else {
        chatApi
          .sendMessage(activeRoom.id, text, replyTo?.id, backendUser?.id)
          .then(({ data }) => {
            const newMessage: ChatMessage = {
              id: data.id,
              userId: data.userId,
              text: data.text,
              timestamp: data.timestamp,
              read: true,
              replyToId: data.replyToId,
            };
            updateActiveRoom((room) => ({
              ...room,
              unread: 0,
              messages: [...room.messages, newMessage],
            }));
          })
          .catch((err) => {
            console.error(err);
            setNotice(t("app.chat.sendFailed", "Xabar yuborilmadi"));
          });
      }
      setDraft("");
      setReplyTo(null);
      return;
    }

    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      userId: "me",
      text,
      timestamp: Date.now(),
      read: true,
      replyToId: replyTo?.id,
    };

    if (activeRoom.type === "ai") {
      // Show user message immediately
      updateActiveRoom((room) => ({ ...room, unread: 0, messages: [...room.messages, userMsg] }));
      setDraft("");
      setReplyTo(null);

      // Build JSON history for multi-turn Gemini context (last 30 messages)
      const history = activeRoom.messages
        .slice(-30)
        .filter((m) => m.text && m.text !== '…')
        .map((m) => ({
          role: m.userId === 'ai' ? ('model' as const) : ('user' as const),
          text: m.text,
        }));

      const thinkingId = `m-ai-thinking-${Date.now()}`;
      updateActiveRoom((room) => ({
        ...room,
        messages: [...room.messages, { id: thinkingId, userId: "ai", text: "…", timestamp: Date.now() + 1, read: true }],
      }));

      fetch(`${API_BASE}/chat/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken() ?? ''}`,
        },
        body: JSON.stringify({ message: text, history }),
      })
        .then((r) => r.json())
        .then((res: { data?: { reply?: string } }) => {
          const reply = res?.data?.reply ?? "Hozircha javob bera olmayapman.";
          updateActiveRoom((room) => ({
            ...room,
            messages: room.messages.map((m) =>
              m.id === thinkingId ? { ...m, text: reply } : m,
            ),
          }));
        })
        .catch(() => {
          updateActiveRoom((room) => ({
            ...room,
            messages: room.messages.map((m) =>
              m.id === thinkingId ? { ...m, text: "Tarmoq xatosi. Qayta urinib ko'ring." } : m,
            ),
          }));
        });
      return;
    }

    updateActiveRoom((room) => ({ ...room, unread: 0, messages: [...room.messages, userMsg] }));
    setDraft("");
    setReplyTo(null);
  };

  const handleDeleteMessage = (messageId: string) => {
    const removeLocal = () => {
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

    if (activeRoom && isPersistedChatRoom(activeRoom) && !messageId.startsWith("m-")) {
      chatApi.deleteMessage(messageId).then(removeLocal).catch((err) => {
        console.error(err);
        setNotice(t("app.chat.deleteFailed", "O'chirib bo'lmadi"));
      });
      return;
    }

    removeLocal();
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
    const targetEmoji = normalizeReactionId(emoji);
    const message = activeRoom?.messages.find((item) => item.id === messageId);
    const existing = message?.reactions?.find((reaction) => normalizeReactionId(reaction.emoji) === targetEmoji);
    const removing = existing?.userIds.includes("me");

    updateActiveRoom((room) => ({
      ...room,
      messages: room.messages.map((item) => (item.id === messageId ? updateMessageReaction(item, emoji) : item)),
    }));

    if (!activeRoom || !isPersistedChatRoom(activeRoom) || messageId.startsWith("m-")) {
      if (isConnected && activeRoom && activeRoom.type !== "ai" && activeRoom.type !== "saved") {
        wsReaction(activeRoom.id, messageId, emoji);
      }
      return;
    }

    const apiCall = removing
      ? chatApi.removeReaction(messageId, targetEmoji)
      : chatApi.addReaction(messageId, targetEmoji);
    apiCall.catch((err) => {
      console.error(err);
      setNotice(t("app.chat.reactionFailed", "Reaksiya saqlanmadi"));
    });
  };

  const handleCreateRoom = async () => {
    const name = newRoomName.trim();
    if (!activeWorkspace || !name || creatingRoom) return;
    setCreatingRoom(true);
    try {
      const res = await chatApi.createRoom(activeWorkspace.id, { type: "group", name });
      const created = res.data;
      const room: ChatRoom = {
        id: created.id,
        name: created.name,
        type: mapApiChatRoomType(created.type) as ChatRoom["type"],
        memberIds: created.memberIds ?? [],
        messages: [],
        unread: 0,
        pinned: false,
      };
      setRooms((prev) => [room, ...prev.filter((item) => item.id !== room.id)]);
      setActiveId(room.id);
      setMobilePane("chat");
      setCreateRoomOpen(false);
      setNewRoomName("");
    } catch (err) {
      console.error(err);
      setNotice(t("app.chat.createRoomFailed", "Chat yaratilmadi"));
    } finally {
      setCreatingRoom(false);
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
          users={chatUsers}
          activeId={activeRoom?.id}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSelectRoom={handleSelectRoom}
          onBackToApp={handleBackToApp}
          onCreateRoom={hasBackendSession && activeWorkspace ? () => setCreateRoomOpen(true) : undefined}
          className={cn("w-full md:flex md:w-[360px] md:flex-shrink-0", mobilePane === "chat" ? "hidden" : "flex")}
        />

        {activeRoom ? (
          <section className={cn("relative min-w-0 flex-1 flex-col", mobilePane === "list" ? "hidden md:flex" : "flex")}>
            <ChatHeader
              room={activeRoom}
              users={chatUsers}
              onBackToList={() => setMobilePane("list")}
              onAction={handleHeaderAction}
              onStartCall={handleStartCall}
              currentUserId={backendUser?.id}
              onRoomUpdated={(updated) =>
                setRooms((prev) => prev.map((r) => r.id === activeRoom.id ? { ...r, ...updated } : r))
              }
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
                  users={chatUsers}
                  mode={activeCall.mode}
                  startedAt={activeCall.startedAt}
                  onClose={() => { meeting.leave(); setActiveCall(null); }}
                  onSwitchMode={(mode) => setActiveCall((currentCall) => (currentCall ? { ...currentCall, mode } : currentCall))}
                  localStream={meeting.localStream}
                  peerStreams={meeting.peerStreams}
                  peerStates={meeting.peerStates}
                  localMicOn={meeting.localMicOn}
                  localCameraOn={meeting.localCameraOn}
                  localScreenOn={meeting.localScreenOn}
                  onToggleMic={meeting.toggleMic}
                  onToggleCamera={meeting.toggleCamera}
                  onToggleScreen={meeting.toggleScreen}
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

            {activeRoom.isMember === false && activeRoom.isPublic && (
              <div className="relative z-20 flex items-center gap-3 border-b border-indigo-200 bg-indigo-50 px-4 py-2.5 dark:border-indigo-800 dark:bg-indigo-950/40">
                <p className="flex-1 text-sm font-medium text-indigo-700 dark:text-indigo-300">
                  Bu ommaviy xona. Xabarlarni ko'rish va yozish uchun qo'shiling.
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await chatApi.joinPublicRoom(activeRoom.id);
                      const joined = res.data;
                      setRooms((prev) => prev.map((r) =>
                        r.id === activeRoom.id
                          ? { ...r, isMember: true, memberIds: joined.memberIds ?? r.memberIds }
                          : r,
                      ));
                      setNotice("Xonaga qo'shildingiz!");
                    } catch {
                      setNotice("Qo'shilishda xatolik");
                    }
                  }}
                  className="shrink-0 rounded-2xl bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  Qo'shilish
                </button>
              </div>
            )}

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
                      users={chatUsers}
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

            {/* Typing indicator */}
            {activeRoom && (typingByRoom[activeRoom.id]?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 border-t border-gray-100 bg-card px-4 py-1.5 dark:border-gray-800 dark:bg-gray-900">
                <span className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {typingByRoom[activeRoom.id]
                    .map((id) => chatUsers.find((u) => u.id === id)?.name ?? id)
                    .join(", ")}{" "}
                  yozmoqda…
                </span>
              </div>
            )}

            <MessageInput
              room={activeRoom}
              users={chatUsers}
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
        {createRoomOpen && (
          <motion.div
            key="create-room-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
            onClick={() => !creatingRoom && setCreateRoomOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md rounded-2xl border border-gray-200 bg-card p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className="text-lg font-semibold text-foreground">{t("app.chat.newChat", "Yangi guruh")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("app.chat.newChatDesc", "Jamoa chat xonasini yarating")}</p>
              <input
                value={newRoomName}
                onChange={(event) => setNewRoomName(event.target.value)}
                placeholder={t("app.chat.roomNamePlaceholder", "Masalan: Frontend jamoa")}
                className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-300 dark:border-gray-600 dark:bg-gray-800"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleCreateRoom();
                }}
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={creatingRoom}
                  onClick={() => setCreateRoomOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  {t("common.cancel", "Bekor")}
                </button>
                <button
                  type="button"
                  disabled={creatingRoom || !newRoomName.trim()}
                  onClick={() => void handleCreateRoom()}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creatingRoom ? t("common.loading", "…") : t("common.create", "Yaratish")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        <Toast key="chat-toast" message={notice} />
      </AnimatePresence>
    </div>
  );
}
