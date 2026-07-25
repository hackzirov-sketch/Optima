import { ArrowDown, ArrowLeft, Bell, BellOff, Bot, Camera, Check, CheckCheck, Copy, Download, FileText, Hash, ImagePlus, Link2, LoaderCircle, MailPlus, Megaphone, MessageCircle, MessagesSquare, Mic, MoreVertical, Paperclip, Pencil, Phone, PhoneOff, Pin, Plus, RadioTower, Reply, Save, Search, Send, Settings, ShieldCheck, Smile, Sparkles, Square, Trash2, User as UserIcon, UserPlus, UserRound, Users, UsersRound, Video, X } from "lucide-react";
import { FormEvent, KeyboardEvent, type MouseEvent, type PointerEvent, type TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, Button, EmptyState, Modal } from "../components/ui";
import { StarfieldBackground } from "../components/StarfieldBackground";
import { AudioMessage } from "../components/AudioMessage";
import { MeetingRoomPage } from "./MeetingRoomPage";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getSocket } from "../lib/socket";
import { useI18n, type TranslateFn } from "../lib/i18n/i18n";
import type { ChatMessage, ChatRoom, RoomInvite, User, WorkspaceMember } from "../types";

const localeTag: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };

function memberUser(member: WorkspaceMember, t: TranslateFn): User {
  return (member.user || {
    id: member.userId,
    firstName: member.firstName || t("chat.userFallback"),
    lastName: member.lastName || "",
    username: member.username || "user",
    email: member.email || "",
    avatarUrl: member.avatarUrl,
  }) as User;
}

const quickEmojis = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "✅", "🙏"];

type AiConversationMessage = {
  id: string;
  role: "user" | "model";
  text: string;
  createdAt: string;
  sources?: Array<{ title: string; url: string }>;
};

function loadAiConversation(userId?: string): AiConversationMessage[] {
  try {
    if (!userId) return [];
    const value = JSON.parse(localStorage.getItem(`optima-ai-conversation:${userId}`) || "[]");
    return Array.isArray(value) ? value.slice(-40) : [];
  } catch {
    return [];
  }
}

export function ChatPage() {
  const { user, workspace } = useAuth();
  const { show } = useToast();
  const { t, locale } = useI18n();
  const [, navigate] = useLocation();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("room"));
  const [search, setSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [startingCall, setStartingCall] = useState<"audio" | "video" | null>(null);
  const [directCall, setDirectCall] = useState<{ meetingId: string; roomId: string; peerId: string; kind: "audio" | "video"; phase: "incoming" | "outgoing" | "active" } | null>(null);
  const [catalog, setCatalog] = useState<"all" | "direct" | "group" | "channel" | "bot">("all");
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiAssistPrompt, setAiAssistPrompt] = useState("");
  const [aiOpen, setAiOpen] = useState(() => new URLSearchParams(window.location.search).get("bot") === "optima-ai");
  const [aiDraft, setAiDraft] = useState("");
  const [aiMessages, setAiMessages] = useState<AiConversationMessage[]>(() => loadAiConversation(user?.id));
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [draft, setDraft] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [roomContext, setRoomContext] = useState<{ roomId: string; x: number; y: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [connected, setConnected] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"group" | "direct">("group");
  const [creating, setCreating] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [globalUsers, setGlobalUsers] = useState<Array<Pick<User, "id" | "firstName" | "lastName" | "username" | "avatarUrl">>>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [workspaceInviteOpen, setWorkspaceInviteOpen] = useState(false);
  const [invitingWorkspace, setInvitingWorkspace] = useState(false);
  const [roomInfoOpen, setRoomInfoOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [roomSettingsName, setRoomSettingsName] = useState("");
  const [roomSettingsDescription, setRoomSettingsDescription] = useState("");
  const [roomSettingsAvatar, setRoomSettingsAvatar] = useState<string | null>(null);
  const [savingRoomSettings, setSavingRoomSettings] = useState(false);
  const [uploadingRoomAvatar, setUploadingRoomAvatar] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"members" | "media" | "files" | "links" | "music" | "voice">("members");
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailMemberSearch, setDetailMemberSearch] = useState("");
  const [detailMemberTotal, setDetailMemberTotal] = useState(0);
  const [detailMembers, setDetailMembers] = useState<Array<{ publicId: string; firstName: string; lastName: string; username?: string | null; avatarUrl?: string | null; lastSeen?: string | null; role: string }>>([]);
  const [sharedItems, setSharedItems] = useState<Array<{ id?: string; messageId: string; fileName?: string; fileSize?: number; mimeType?: string; storageUrl?: string; content?: string; url?: string[] | string; username?: string; createdAt: string }>>([]);
  const [mediaPreview, setMediaPreview] = useState<{ url: string; name: string } | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [roomInvites, setRoomInvites] = useState<RoomInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const aiMessageList = useRef<HTMLDivElement>(null);
  const aiShouldScroll = useRef(false);
  const preserveMessageScroll = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const roomAvatarInput = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const cancelRecording = useRef(false);
  const recordingTimer = useRef<number | null>(null);
  const swipeGesture = useRef<{ id: string; startX: number; startY: number; horizontal: boolean } | null>(null);
  const pointerGesture = useRef<{ id: string; startX: number; startY: number; dragging: boolean } | null>(null);
  const swipeCurrent = useRef<{ id: string; offset: number; armed: boolean } | null>(null);
  const swipeResetTimer = useRef<number | null>(null);
  const [swipingMessage, setSwipingMessage] = useState<{ id: string; offset: number; armed: boolean } | null>(null);

  const selectedRoom = rooms.find((room) => room.id === selectedId) || null;
  const contextRoom = rooms.find((room) => room.id === roomContext?.roomId) || null;

  function formatTime(value: string) {
    return new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function formatDay(value: string) {
    const date = new Date(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return t("chat.today");
    return new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { day: "numeric", month: "long" }).format(date);
  }

  const memberMap = useMemo(() => {
    const result = new Map<string, Pick<User, "id" | "firstName" | "lastName" | "username" | "avatarUrl">>();
    members.forEach((member) => result.set(member.userId, memberUser(member, t)));
    rooms.flatMap((room) => room.memberProfiles || []).forEach((profile) => result.set(profile.id, profile));
    globalUsers.forEach((profile) => result.set(profile.id, profile));
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, rooms, globalUsers]);
  const detailPeer = selectedRoom?.type === "direct"
    ? selectedRoom.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id) || null
    : null;

  useEffect(() => {
    const socket = getSocket();
    const incoming = (data: { meetingId: string; roomId: string; fromUserId: string; kind: "audio" | "video" }) => setDirectCall({ meetingId: data.meetingId, roomId: data.roomId, peerId: data.fromUserId, kind: data.kind, phase: "incoming" });
    const accepted = (data: { meetingId: string }) => setDirectCall((current) => current?.meetingId === data.meetingId ? { ...current, phase: "active" } : current);
    const closed = (data: { meetingId: string }) => setDirectCall((current) => current?.meetingId === data.meetingId ? null : current);
    socket.on("call:incoming", incoming); socket.on("call:accepted", accepted); socket.on("call:declined", closed); socket.on("call:ended", closed);
    return () => { socket.off("call:incoming", incoming); socket.off("call:accepted", accepted); socket.off("call:declined", closed); socket.off("call:ended", closed); };
  }, []);

  function roomTitle(room: ChatRoom) {
    if (room.name) return room.name;
    if (room.type === "direct") {
      const other = room.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id);
      return other ? `${other.firstName} ${other.lastName}`.trim() : t("chat.personalChatLabel");
    }
    return t("chat.unnamedGroup");
  }

  function chooseRoom(id: string) {
    setAiOpen(false);
    setSelectedId(id);
    setRooms((current) => current.map((room) => room.id === id ? { ...room, unreadCount: 0 } : room));
    window.history.replaceState({}, "", `/chat?room=${id}`);
  }

  function chooseAi() {
    aiShouldScroll.current = true;
    setAiOpen(true);
    setSelectedId(null);
    setCatalog("bot");
    window.history.replaceState({}, "", "/chat?bot=optima-ai");
  }

  async function sendAiMessage() {
    const prompt = aiDraft.trim();
    if (!prompt || aiThinking) return;
    const userMessage: AiConversationMessage = { id: crypto.randomUUID(), role: "user", text: prompt, createdAt: new Date().toISOString() };
    const next = [...aiMessages, userMessage].slice(-40);
    aiShouldScroll.current = true;
    setAiMessages(next);
    setAiDraft("");
    setAiThinking(true);
    try {
      const history = next.slice(-12, -1).map(({ role, text }) => ({ role, text }));
      const result = await api.chat.ai(prompt, history);
      const list = aiMessageList.current;
      aiShouldScroll.current = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      const completed = [...next, { id: crypto.randomUUID(), role: "model" as const, text: result.reply, createdAt: new Date().toISOString(), sources: result.sources }].slice(-40);
      setAiMessages(completed);
      if (user?.id) localStorage.setItem(`optima-ai-conversation:${user.id}`, JSON.stringify(completed));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.aiNotResponding"), "error");
    } finally {
      setAiThinking(false);
    }
  }

  function showRoomContext(event: MouseEvent, room: ChatRoom) {
    event.preventDefault();
    setRoomContext({ roomId: room.id, x: Math.min(event.clientX, window.innerWidth - 250), y: Math.min(event.clientY, window.innerHeight - 230) });
  }

  async function deleteSelectedRoom() {
    if (!selectedRoom || selectedRoom.isSystem || selectedRoom.type === "direct") return;
    if (!window.confirm(t("chat.deleteGroupConfirm", { title: roomTitle(selectedRoom) }))) return;
    try {
      await api.chat.deleteRoom(selectedRoom.id);
      const remaining = rooms.filter((room) => room.id !== selectedRoom.id);
      setRooms(remaining);
      setHeaderMenuOpen(false);
      if (remaining[0]) chooseRoom(remaining[0].id);
      else { setSelectedId(null); navigate("/chat"); }
      show(t("chat.groupDeleted"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.groupDeleteFailed"), "error");
    }
  }

  async function deleteRoomFromContext(room: ChatRoom) {
    if (!window.confirm(t("chat.deleteGroupConfirm", { title: roomTitle(room) }))) return;
    try {
      await api.chat.deleteRoom(room.id);
      const remaining = rooms.filter((item) => item.id !== room.id);
      setRooms(remaining);
      setRoomContext(null);
      if (selectedId === room.id) remaining[0] ? chooseRoom(remaining[0].id) : setSelectedId(null);
      show(t("chat.groupDeleted"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.groupDeleteFailed"), "error");
    }
  }

  async function loadRooms(preferredId?: string) {
    if (!workspace) return;
    const [nextRooms, nextMembers, community] = await Promise.all([api.chat.rooms(workspace.id), api.workspaces.members(workspace.id), api.chat.community()]);
    const systemRooms = [community.channel, community.group].filter(Boolean).map((room) => ({
      ...room!, memberIds: room!.memberIds || [], memberProfiles: room!.memberProfiles || [],
      unreadCount: room!.unreadCount || 0, memberCount: room!.memberCount || 0,
      isReadOnly: room!.isReadOnly || false, memberStatus: "active" as const,
    }));
    const mergedRooms = [...systemRooms, ...nextRooms.filter((room) => !systemRooms.some((system) => system.id === room.id))];
    setRooms(mergedRooms);
    setMembers(nextMembers);
    const target = preferredId || selectedId;
    if (target && mergedRooms.some((room) => room.id === target)) setSelectedId(target);
    else if (mergedRooms[0] && window.innerWidth > 820) chooseRoom(mergedRooms[0].id);
    else setSelectedId(null);
    setLoadingRooms(false);
  }

  useEffect(() => {
    setLoadingRooms(true);
    void loadRooms().catch((error) => {
      setLoadingRooms(false);
      show(error instanceof Error ? error.message : t("chat.loadRoomsFailed"), "error");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    if (selectedRoom?.memberStatus === "pending") {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }
    setLoadingMessages(true);
    api.chat.messages(selectedId)
      .then((result) => {
        setMessages([...result.data].sort((a, b) => (a.sequence || +new Date(a.createdAt)) - (b.sequence || +new Date(b.createdAt))));
        setHasOlderMessages((result.total || 0) > result.data.length);
      })
      .catch((error) => show(error instanceof Error ? error.message : t("chat.loadMessagesFailed"), "error"))
      .finally(() => setLoadingMessages(false));
  }, [selectedId, selectedRoom?.memberStatus, show]);

  async function loadOlderMessages() {
    if (!selectedId || loadingMessages || loadingOlderMessages || !hasOlderMessages) return;
    const oldestSequence = messages.find((message) => typeof message.sequence === "number")?.sequence;
    if (!oldestSequence) { setHasOlderMessages(false); return; }
    const list = messageList.current;
    const previousHeight = list?.scrollHeight || 0;
    setLoadingOlderMessages(true);
    try {
      const result = await api.chat.messages(selectedId, oldestSequence);
      setHasOlderMessages(result.data.length === 80);
      preserveMessageScroll.current = true;
      setMessages((current) => {
        const byId = new Map([...result.data, ...current].map((message) => [message.id, message]));
        return [...byId.values()].sort((a, b) => (a.sequence || +new Date(a.createdAt)) - (b.sequence || +new Date(b.createdAt)));
      });
      window.requestAnimationFrame(() => {
        if (list) list.scrollTop += list.scrollHeight - previousHeight;
      });
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.loadOlderFailed"), "error");
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  useEffect(() => {
    if (!workspace) return;
    const socket = getSocket();
    const onConnect = () => {
      setConnected(true);
      socket.emit("join_workspace", { workspaceId: workspace.id });
      if (selectedId && selectedRoom?.memberStatus !== "pending") socket.emit("join_room", { roomId: selectedId });
    };
    const onDisconnect = () => setConnected(false);
    const onMessage = (message: ChatMessage) => {
      if (message.roomId !== selectedId) {
        setRooms((current) => current.map((room) => room.id === message.roomId ? { ...room, unreadCount: message.senderId === user?.id ? room.unreadCount : room.unreadCount + 1, lastMessage: { id: message.id, content: message.content, senderId: message.senderId, createdAt: message.createdAt } } : room));
        return;
      }
      setMessages((current) => {
        if (message.clientMessageId && current.some((item) => item.clientMessageId === message.clientMessageId)) {
          return current.map((item) => item.clientMessageId === message.clientMessageId ? {
            ...message,
            content: message.content || item.content,
            attachments: message.attachments?.length ? message.attachments : item.attachments,
          } : item);
        }
        return current.some((item) => item.id === message.id) ? current : [...current, message];
      });
    };
    const onTyping = (data: { roomId: string; userId: string; typing: boolean }) => {
      if (data.roomId !== selectedId || data.userId === user?.id) return;
      setTypingUsers((current) => data.typing ? [...new Set([...current, data.userId])] : current.filter((id) => id !== data.userId));
    };
    const onReaction = (data: { roomId: string; messageId: string; emoji: string; userId: string; action: "added" | "removed" }) => {
      if (data.roomId !== selectedId) return;
      setMessages((current) => current.map((item) => {
        if (item.id !== data.messageId) return item;
        const reactions = [...(item.reactions || [])];
        const index = reactions.findIndex((reaction) => reaction.emoji === data.emoji);
        const userIds = index >= 0 ? reactions[index].userIds : [];
        const nextIds = data.action === "added" ? [...new Set([...userIds, data.userId])] : userIds.filter((id) => id !== data.userId);
        if (!nextIds.length && index >= 0) reactions.splice(index, 1);
        else if (index >= 0) reactions[index] = { emoji: data.emoji, userIds: nextIds };
        else reactions.push({ emoji: data.emoji, userIds: nextIds });
        return { ...item, reactions };
      }));
    };
    const onError = (data: { code?: string; message?: string }) => {
      if (data?.code) show(data.message || "Real-time xatolik", "error");
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("new_message", onMessage);
    socket.on("typing", onTyping);
    socket.on("reaction_updated", onReaction);
    socket.on("error", onError);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("new_message", onMessage);
      socket.off("typing", onTyping);
      socket.off("reaction_updated", onReaction);
      socket.off("error", onError);
    };
  }, [workspace, selectedId, selectedRoom?.memberStatus, user?.id, show]);

  useEffect(() => {
    const socket = getSocket();
    if (selectedId && selectedRoom?.memberStatus !== "pending" && socket.connected) socket.emit("join_room", { roomId: selectedId });
    return () => {
      if (selectedId && socket.connected) socket.emit("leave_room", { roomId: selectedId });
    };
  }, [selectedId, selectedRoom?.memberStatus]);

  useEffect(() => {
    if (preserveMessageScroll.current) {
      preserveMessageScroll.current = false;
      return;
    }
    messagesEnd.current?.scrollIntoView({ behavior: messages.length > 10 ? "smooth" : "auto" });
    const timer = window.setTimeout(() => {
      const node = messageList.current;
      if (node && node.scrollHeight - node.scrollTop - node.clientHeight < 96) setShowScrollButton(false);
    }, messages.length > 10 ? 420 : 0);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => {
    if (!aiOpen || !aiShouldScroll.current) return;
    const frame = window.requestAnimationFrame(() => {
      const node = aiMessageList.current;
      if (node) node.scrollTo({ top: node.scrollHeight, behavior: aiMessages.length > 1 ? "smooth" : "auto" });
      aiShouldScroll.current = false;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [aiMessages.length, aiOpen]);

  useEffect(() => {
    if (!detailsOpen || !selectedId) return;
    setDetailsLoading(true);
    const request = detailsTab === "members"
      ? api.chat.roomMembers(selectedId, detailMemberSearch.trim()).then((result) => { setDetailMembers(result.items); setDetailMemberTotal(result.total); setSharedItems([]); })
      : api.chat.shared(selectedId, detailsTab).then((items) => { setSharedItems(items); setDetailMembers([]); });
    void request.catch((error) => show(error instanceof Error ? error.message : t("chat.loadDetailsFailed"), "error")).finally(() => setDetailsLoading(false));
  }, [detailsOpen, detailsTab, detailMemberSearch, selectedId, show]);

  useEffect(() => {
    if (!selectedId || !messages.length) return;
    const latest = messages[messages.length - 1];
    if (latest.id.startsWith("optimistic:")) return;
    setRooms((current) => current.map((room) => room.id === selectedId ? { ...room, unreadCount: 0 } : room));
    const socket = getSocket();
    if (socket.connected) socket.emit("message_read", { roomId: selectedId, messageId: latest.id });
  }, [messages, selectedId]);

  useEffect(() => {
    const query = memberSearch.trim();
    if (!createOpen || createMode !== "direct" || query.length < 2) {
      setGlobalUsers([]);
      setSearchingUsers(false);
      return;
    }
    setSearchingUsers(true);
    const timer = window.setTimeout(() => {
      api.search.global(query)
        .then((result) => setGlobalUsers(result.users.filter((entry) => entry.id !== user?.id)))
        .catch((error) => show(error instanceof Error ? error.message : t("chat.usersNotFound"), "error"))
        .finally(() => setSearchingUsers(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [createMode, createOpen, memberSearch, show, user?.id]);

  function announceTyping(value: string) {
    setDraft(value);
    if (!selectedId) return;
    const socket = getSocket();
    socket.emit("typing", { roomId: selectedId, typing: true });
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => socket.emit("typing", { roomId: selectedId, typing: false }), 1200);
  }

  async function runComposerAi() {
    const prompt = aiAssistPrompt.trim() || draft.replace(/^\/ai\s*/i, "").trim();
    if (!prompt || aiThinking) return;
    setAiThinking(true);
    try {
      const result = await api.chat.ai(t("chat.composerAiPromptTemplate", { prompt }), []);
      setDraft(result.reply);
      setAiAssistPrompt("");
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.aiComposeFailed"), "error");
    } finally {
      setAiThinking(false);
    }
  }

  async function sendMessage() {
    const content = draft.trim();
    if (!content || !selectedRoom) return;
    if (/^\/ai(?:\s|$)/i.test(content)) {
      await runComposerAi();
      return;
    }
    if (editing) {
      try {
        const updated = await api.chat.editMessage(editing.id, content);
        setMessages((current) => current.map((item) => item.id === editing.id ? updated : item));
        setDraft("");
        setEditing(null);
      } catch (error) {
        show(error instanceof Error ? error.message : t("chat.editMessageFailed"), "error");
      }
      return;
    }
    setDraft("");
    const clientMessageId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: `optimistic:${clientMessageId}`,
      roomId: selectedRoom.id,
      senderId: user!.id,
      content,
      replyToId: replyingTo?.id || null,
      clientMessageId,
      createdAt: new Date().toISOString(),
      reactions: [],
      sender: user,
    };
    setMessages((current) => [...current, optimistic]);
    const socket = getSocket();
    socket.emit("typing", { roomId: selectedRoom.id, typing: false });
    try {
      if (socket.connected) {
        await new Promise<void>((resolve, reject) => {
          socket.timeout(9000).emit("send_message", { roomId: selectedRoom.id, text: content, clientMessageId, replyToId: replyingTo?.id }, (error: Error | null) => error ? reject(error) : resolve());
        });
      } else {
        const saved = await api.chat.send(selectedRoom.id, content, clientMessageId, replyingTo?.id);
        setMessages((current) => current.map((item) => item.clientMessageId === clientMessageId ? saved : item));
      }
    } catch {
      try {
        const saved = await api.chat.send(selectedRoom.id, content, clientMessageId, replyingTo?.id);
        setMessages((current) => current.map((item) => item.clientMessageId === clientMessageId ? saved : item));
      } catch (error) {
        setMessages((current) => current.filter((item) => item.clientMessageId !== clientMessageId));
        setDraft(content);
        show(error instanceof Error ? error.message : t("chat.sendMessageFailed"), "error");
      }
    }
    setReplyingTo(null);
  }

  function startReplySwipe(event: TouchEvent<HTMLDivElement>, message: ChatMessage) {
    if (event.touches.length !== 1 || message.id.startsWith("optimistic:")) return;
    const touch = event.touches[0];
    swipeGesture.current = { id: message.id, startX: touch.clientX, startY: touch.clientY, horizontal: false };
    if (swipeResetTimer.current) window.clearTimeout(swipeResetTimer.current);
  }

  function moveReplySwipe(event: TouchEvent<HTMLDivElement>, message: ChatMessage) {
    const gesture = swipeGesture.current;
    if (!gesture || gesture.id !== message.id || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    if (!gesture.horizontal) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        swipeGesture.current = null;
        swipeCurrent.current = null;
        setSwipingMessage(null);
        return;
      }
      if (Math.abs(dx) < 7) return;
      gesture.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!gesture.horizontal || dx >= 0) return;
    const offset = -Math.min(76, Math.abs(dx) * 0.78);
    const next = { id: message.id, offset, armed: Math.abs(offset) >= 48 };
    swipeCurrent.current = next;
    setSwipingMessage(next);
  }

  function finishReplySwipe(message: ChatMessage) {
    const active = swipeCurrent.current?.id === message.id ? swipeCurrent.current : null;
    swipeGesture.current = null;
    swipeCurrent.current = null;
    if (!active) return;
    if (active.armed) {
      setReplyingTo(message);
      setEditing(null);
      setActiveMenu(null);
      navigator.vibrate?.(18);
      window.requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(".composer textarea")?.focus());
    }
    setSwipingMessage({ id: message.id, offset: 0, armed: false });
    swipeResetTimer.current = window.setTimeout(() => setSwipingMessage(null), 190);
  }

  function startPointerReply(event: PointerEvent<HTMLDivElement>, message: ChatMessage) {
    if (event.pointerType !== "mouse" || event.button !== 0 || message.id.startsWith("optimistic:")) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, video, audio")) return;
    pointerGesture.current = { id: message.id, startX: event.clientX, startY: event.clientY, dragging: false };
  }

  function movePointerReply(event: PointerEvent<HTMLDivElement>, message: ChatMessage) {
    const gesture = pointerGesture.current;
    if (!gesture || gesture.id !== message.id || event.pointerType !== "mouse") return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (!gesture.dragging) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        pointerGesture.current = null;
        return;
      }
      if (dx > -7 || Math.abs(dx) <= Math.abs(dy)) return;
      gesture.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const offset = -Math.min(76, Math.abs(Math.min(0, dx)) * 0.78);
    const next = { id: message.id, offset, armed: Math.abs(offset) >= 48 };
    swipeCurrent.current = next;
    setSwipingMessage(next);
  }

  function finishPointerReply(event: PointerEvent<HTMLDivElement>, message: ChatMessage) {
    const gesture = pointerGesture.current;
    if (!gesture || gesture.id !== message.id) return;
    pointerGesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture.dragging) finishReplySwipe(message);
  }

  async function deleteMessage(message: ChatMessage) {
    setActiveMenu(null);
    try {
      await api.chat.deleteMessage(message.id);
      setMessages((current) => current.filter((item) => item.id !== message.id));
      show(t("chat.messageDeleted"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.messageDeleteFailed"), "error");
    }
  }

  async function reactToMessage(message: ChatMessage, emoji: string) {
    setActiveMenu(null);
    try {
      const socket = getSocket();
      if (!socket.connected) throw new Error(t("chat.realtimeUnavailable"));
      socket.emit("add_reaction", { roomId: message.roomId, messageId: message.id, emoji });
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.reactionFailed"), "error");
    }
  }

  async function uploadAttachment(file: File) {
    if (!selectedRoom || uploading) return;
    setUploading(true);
    try {
      const attachment = await api.chat.uploadFile(selectedRoom.id, file);
      const socket = getSocket();
      const clientMessageId = crypto.randomUUID();
      if (socket.connected) {
        try {
          await new Promise<void>((resolve, reject) => socket.timeout(12000).emit("send_message", { roomId: selectedRoom.id, text: draft.trim(), clientMessageId, attachments: [attachment], replyToId: replyingTo?.id }, (error: Error | null) => error ? reject(error) : resolve()));
        } catch {
          await api.chat.send(selectedRoom.id, draft.trim(), clientMessageId, replyingTo?.id, [attachment]);
        }
      } else await api.chat.send(selectedRoom.id, draft.trim(), clientMessageId, replyingTo?.id, [attachment]);
      setDraft("");
      setReplyingTo(null);
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.fileSendFailed"), "error");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function startCall(kind: "audio" | "video") {
    if (!workspace || !selectedRoom || startingCall) return;
    if (selectedRoom.type !== "direct" || !detailPeer) {
      show(t("chat.directCallOnlyPersonal"), "error");
      return;
    }
    setStartingCall(kind);
    try {
      const meeting = await api.meetings.create(workspace.id, {
        title: roomTitle(selectedRoom),
        description: `${roomTitle(selectedRoom)} suhbati`,
        startTime: new Date().toISOString(),
        maxParticipants: Math.max(2, selectedRoom.memberCount + 2),
      });
      sessionStorage.setItem(`optima:meeting-camera:${meeting.id}`, kind === "video" ? "on" : "off");
      const call = { meetingId: meeting.id, roomId: selectedRoom.id, peerId: detailPeer.id, kind, phase: "outgoing" as const };
      setDirectCall(call);
      getSocket().emit("call:invite", { meetingId: call.meetingId, roomId: call.roomId, targetUserId: call.peerId, kind: call.kind });
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.callStartFailed"), "error");
      setStartingCall(null);
    }
  }

  function acceptDirectCall() {
    if (!directCall) return;
    sessionStorage.setItem(`optima:meeting-camera:${directCall.meetingId}`, directCall.kind === "video" ? "on" : "off");
    getSocket().emit("call:accept", { meetingId: directCall.meetingId, roomId: directCall.roomId, targetUserId: directCall.peerId, kind: directCall.kind });
    setDirectCall({ ...directCall, phase: "active" });
  }

  function closeDirectCall() {
    if (!directCall) return;
    getSocket().emit(directCall.phase === "incoming" ? "call:decline" : "call:end", { meetingId: directCall.meetingId, roomId: directCall.roomId, targetUserId: directCall.peerId, kind: directCall.kind });
    setDirectCall(null);
    setStartingCall(null);
  }

  async function sendVoice(blob: Blob) {
    if (!selectedRoom || sending) return;
    setSending(true);
    try {
      const attachment = await api.chat.uploadAudio(selectedRoom.id, blob);
      const socket = getSocket();
      const clientMessageId = crypto.randomUUID();
      if (socket.connected) {
        try {
          await new Promise<void>((resolve, reject) => {
            socket.timeout(12000).emit("send_message", { roomId: selectedRoom.id, text: "", clientMessageId, attachments: [attachment] }, (error: Error | null) => error ? reject(error) : resolve());
          });
        } catch {
          await api.chat.send(selectedRoom.id, "", clientMessageId, undefined, [attachment]);
        }
      } else await api.chat.send(selectedRoom.id, "", clientMessageId, undefined, [attachment]);
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.voiceSendFailed"), "error");
    } finally {
      setSending(false);
    }
  }

  async function startRecording() {
    if (!selectedRoom || recording || sending) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const nextRecorder = new MediaRecorder(stream, { mimeType });
      recordingChunks.current = [];
      cancelRecording.current = false;
      recordingStream.current = stream;
      recorder.current = nextRecorder;
      nextRecorder.ondataavailable = (event) => { if (event.data.size) recordingChunks.current.push(event.data); };
      nextRecorder.onstop = () => {
        const blob = new Blob(recordingChunks.current, { type: nextRecorder.mimeType });
        stream.getTracks().forEach((track) => track.stop());
        recordingStream.current = null;
        recorder.current = null;
        if (!cancelRecording.current && blob.size > 0) void sendVoice(blob);
      };
      nextRecorder.start(250);
      setRecording(true);
      setRecordingSeconds(0);
      recordingTimer.current = window.setInterval(() => setRecordingSeconds((value) => {
        if (value >= 299) { nextRecorder.stop(); setRecording(false); return 300; }
        return value + 1;
      }), 1000);
    } catch {
      show(t("chat.micPermissionDenied"), "error");
    }
  }

  function stopRecording(cancel = false) {
    cancelRecording.current = cancel;
    if (recordingTimer.current) window.clearInterval(recordingTimer.current);
    recordingTimer.current = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false);
    setRecordingSeconds(0);
  }

  useEffect(() => () => {
    cancelRecording.current = true;
    if (recordingTimer.current) window.clearInterval(recordingTimer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    recordingStream.current?.getTracks().forEach((track) => track.stop());
  }, []);

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function createConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setCreating(true);
    const data = new FormData(event.currentTarget);
    try {
      const room = createMode === "direct"
        ? await api.chat.createRoom(workspace.id, { type: "direct", targetUserId: selectedMembers[0] })
        : await api.chat.createRoom(workspace.id, { type: "group", visibility: "members_only", name: String(data.get("name") || "").trim(), memberIds: selectedMembers });
      await loadRooms(room.id);
      setCreateOpen(false);
      setSelectedMembers([]);
      setMemberSearch("");
      show(createMode === "direct" ? t("chat.directChatOpened") : t("chat.groupCreated"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.conversationCreateFailed"), "error");
    } finally {
      setCreating(false);
    }
  }

  async function acceptInvite() {
    if (!selectedRoom) return;
    try {
      await api.chat.acceptInvite(selectedRoom.id);
      await loadRooms(selectedRoom.id);
      show(t("chat.inviteAccepted"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.inviteAcceptFailed"), "error");
    }
  }

  async function inviteToWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setInvitingWorkspace(true);
    const data = new FormData(event.currentTarget);
    try {
      await api.workspaces.invite(workspace.id, String(data.get("email") || "").trim(), String(data.get("role") || "junior"));
      setWorkspaceInviteOpen(false);
      show(t("chat.workspaceInviteSent"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.inviteSendFailed"), "error");
    } finally {
      setInvitingWorkspace(false);
    }
  }

  async function openRoomInvites() {
    if (!selectedRoom || selectedRoom.type === "direct") return;
    setRoomInfoOpen(true);
    setLoadingInvites(true);
    setInviteError("");
    try {
      setRoomInvites(await api.chat.listInvites(selectedRoom.id));
    } catch (error) {
      setInviteError(error instanceof Error ? error.message : t("chat.inviteLinksLoadFailed"));
    } finally {
      setLoadingInvites(false);
    }
  }

  async function createRoomInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoom) return;
    setCreatingInvite(true);
    const data = new FormData(event.currentTarget);
    const maxUses = Number(data.get("maxUses"));
    const expiresInHours = Number(data.get("expiresInHours"));
    try {
      const created = await api.chat.createInvite(selectedRoom.id, {
        ...(maxUses > 0 ? { maxUses } : {}),
        ...(expiresInHours > 0 ? { expiresInHours } : {}),
      });
      setRoomInvites((current) => [created, ...current]);
      show(t("chat.inviteLinkCreated"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.linkCreateFailed"), "error");
    } finally {
      setCreatingInvite(false);
    }
  }

  async function copyInvite(code: string) {
    const url = new URL(`/join/chat/${code}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      show(t("chat.inviteLinkCopied"));
    } catch {
      show(t("chat.linkCopyFailed"), "error");
    }
  }

  async function revokeRoomInvite(inviteId: string) {
    if (!selectedRoom) return;
    try {
      await api.chat.revokeInvite(selectedRoom.id, inviteId);
      setRoomInvites((current) => current.map((entry) => entry.id === inviteId ? { ...entry, isActive: false, revokedAt: new Date().toISOString() } : entry));
      show(t("chat.inviteLinkRevoked"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.linkRevokeFailed"), "error");
    }
  }

  const roomCatalog = (room: ChatRoom) => {
    if (room.type === "direct") return "direct";
    if (room.type === "group" || room.type === "private") return "group";
    return "channel";
  };
  async function openDiscussion(messageId: string) {
    try {
      const discussion = await api.chat.discussion(messageId);
      chooseRoom(discussion.roomId);
      window.setTimeout(() => document.getElementById(`message-${discussion.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.discussionOpenFailed"), "error");
    }
  }
  async function toggleChannelMute() {
    if (!selectedRoom) return;
    try {
      const result = await api.chat.mute(selectedRoom.id, !selectedRoom.isMuted);
      setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, isMuted: result.isMuted } : room));
      show(result.isMuted ? t("chat.channelMuted") : t("chat.channelUnmuted"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.settingSaveFailed"), "error");
    }
  }

  function openRoomSettings() {
    if (!selectedRoom || selectedRoom.type === "direct") return;
    setRoomSettingsName(selectedRoom.name || "");
    setRoomSettingsDescription(selectedRoom.description || "");
    setRoomSettingsAvatar(selectedRoom.avatarUrl || null);
    setDetailsOpen(false);
    setRoomSettingsOpen(true);
  }

  async function uploadRoomAvatar(file?: File) {
    if (!selectedRoom || !file) return;
    if (!file.type.startsWith("image/")) return show(t("chat.imageOnlyError"), "error");
    if (file.size > 5 * 1024 * 1024) return show(t("chat.imageSizeError"), "error");
    setUploadingRoomAvatar(true);
    try {
      const uploaded = await api.chat.uploadFile(selectedRoom.id, file);
      const updated = await api.chat.updateRoomSettings(selectedRoom.id, { avatarUrl: uploaded.storageUrl });
      setRoomSettingsAvatar(updated.avatarUrl || uploaded.storageUrl);
      setRooms((current) => current.map((room) => room.id === updated.id ? { ...room, ...updated } : room));
      show(t("chat.chatPhotoUpdated"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.photoUploadFailed"), "error");
    } finally {
      setUploadingRoomAvatar(false);
      if (roomAvatarInput.current) roomAvatarInput.current.value = "";
    }
  }

  async function saveRoomSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoom || !roomSettingsName.trim()) return;
    setSavingRoomSettings(true);
    try {
      const updated = await api.chat.updateRoomSettings(selectedRoom.id, {
        name: roomSettingsName.trim(),
        description: roomSettingsDescription.trim(),
        avatarUrl: roomSettingsAvatar,
      });
      setRooms((current) => current.map((room) => room.id === updated.id ? { ...room, ...updated } : room));
      setRoomSettingsOpen(false);
      show(selectedRoom.type === "channel" ? t("chat.channelSettingsSaved") : t("chat.groupSettingsSaved"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.settingsSaveFailed"), "error");
    } finally {
      setSavingRoomSettings(false);
    }
  }
  async function forwardMessage(targetRoomId: string) {
    if (!forwardingMessage || forwarding) return;
    setForwarding(true);
    try {
      const attachments = forwardingMessage.attachments?.map((attachment) => ({
        storageKey: `forwarded/${attachment.id}`,
        storageUrl: attachment.url,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
      }));
      await api.chat.send(targetRoomId, forwardingMessage.content, crypto.randomUUID(), undefined, attachments);
      setForwardingMessage(null);
      show(t("chat.messageForwarded"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.sendMessageFailed"), "error");
    } finally {
      setForwarding(false);
    }
  }
  const catalogItems = [
    { id: "all" as const, label: t("chat.catalogAll"), icon: MessagesSquare, count: rooms.reduce((sum, room) => sum + room.unreadCount, 0) },
    { id: "direct" as const, label: t("chat.catalogDirect"), icon: UserIcon, count: rooms.filter((room) => roomCatalog(room) === "direct").reduce((sum, room) => sum + room.unreadCount, 0) },
    { id: "group" as const, label: t("chat.catalogGroups"), icon: Users, count: rooms.filter((room) => roomCatalog(room) === "group").reduce((sum, room) => sum + room.unreadCount, 0) },
    { id: "channel" as const, label: t("chat.catalogChannels"), icon: RadioTower, count: rooms.filter((room) => roomCatalog(room) === "channel").reduce((sum, room) => sum + room.unreadCount, 0) },
    { id: "bot" as const, label: t("chat.catalogBots"), icon: Bot, count: 0 },
  ];
  const filteredRooms = rooms.filter((room) => (catalog === "all" || roomCatalog(room) === catalog) && roomTitle(room).toLowerCase().includes(search.toLowerCase()));
  const visibleMessages = messageSearch.trim()
    ? messages.filter((message) => `${message.content} ${message.attachments?.map((attachment) => attachment.fileName).join(" ") || ""}`.toLowerCase().includes(messageSearch.trim().toLowerCase()))
    : messages;
  const availableMembers = members.map((member) => memberUser(member, t)).filter((member) => member.id !== user?.id);
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const localCandidates = availableMembers.filter((member) => `${member.firstName} ${member.lastName} ${member.username} ${member.email}`.toLowerCase().includes(normalizedMemberSearch));
  const pickerCandidates = createMode === "direct" && normalizedMemberSearch.length >= 2 ? globalUsers : localCandidates;

  return (
    <div className={`chat-page ${selectedRoom || aiOpen ? "chat-room-open" : ""}`}>
      <StarfieldBackground />
      {mediaPreview && <div className="media-viewer" role="dialog" aria-modal="true" aria-label={mediaPreview.name} onClick={() => setMediaPreview(null)}><header><strong>{mediaPreview.name}</strong><a href={mediaPreview.url} download onClick={(event) => event.stopPropagation()} aria-label={t("chat.downloadImageAria")}><Download size={19} /></a><button onClick={() => setMediaPreview(null)} aria-label={t("chat.closeAria")}><X size={22} /></button></header><img src={mediaPreview.url} alt={mediaPreview.name} onClick={(event) => event.stopPropagation()} /></div>}
      {roomContext && contextRoom && <div className="room-context-menu" style={{ left: roomContext.x, top: roomContext.y }} role="menu" onMouseLeave={() => setRoomContext(null)}>
        <button onClick={() => { chooseRoom(contextRoom.id); setRoomContext(null); }}><MessageCircle size={17} />{t("chat.openConversation")}</button>
        <button onClick={() => { setCatalog(roomCatalog(contextRoom)); chooseRoom(contextRoom.id); setRoomContext(null); }}><Hash size={17} />{t("chat.showInCategory")}</button>
        {contextRoom.type !== "direct" && !contextRoom.isSystem && <button onClick={() => { chooseRoom(contextRoom.id); setRoomContext(null); window.setTimeout(() => void openRoomInvites(), 0); }}><UserPlus size={17} />{t("chat.inviteToGroup")}</button>}
        {contextRoom.type !== "direct" && !contextRoom.isSystem && contextRoom.createdById === user?.id && <button className="danger" onClick={() => void deleteRoomFromContext(contextRoom)}><Trash2 size={17} />{t("chat.deleteGroup")}</button>}
      </div>}
      <aside className="chat-sidebar">
        <header className="chat-sidebar-header"><button className="icon-button chat-home-back" onClick={() => navigate("/")} aria-label={t("chat.backToHomeAria")} title={t("chat.homeTitle")}><ArrowLeft size={20} /></button><div><p className="eyebrow">Workspace</p><h1>{t("chat.messagesTitle")}</h1></div><button className="icon-button icon-button-dark" onClick={() => setCreateOpen(true)} aria-label={t("chat.newConversationAria")} title={t("chat.newConversationAria")}><Plus size={19} /></button></header>
        <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("chat.searchChatPlaceholder")} aria-label={t("chat.searchChatPlaceholder")} />{search && <button onClick={() => setSearch("")} aria-label={t("chat.clearSearchAria")}><X size={15} /></button>}</label>
        <nav className="chat-catalog" aria-label={t("chat.catalogAria")}>
          <span className={`catalog-indicator catalog-${catalog}`} aria-hidden="true" />
          {catalogItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={catalog === item.id ? "active" : ""} onClick={() => setCatalog(item.id)} aria-current={catalog === item.id ? "page" : undefined} title={item.label}><Icon size={16} /><span>{item.label}</span>{item.count > 0 && <b>{item.count}</b>}</button>; })}
        </nav>
        <div className="room-list room-list-transition" key={catalog}>
          {loadingRooms && <div className="center-loader"><LoaderCircle className="spin" size={22} /></div>}
          {!loadingRooms && catalog === "bot" && <button className={`room-item ai-room-item ${aiOpen ? "active" : ""}`} onClick={chooseAi}><span className="room-avatar"><Bot size={18} /></span><span className="room-copy"><span><strong>OPTIMA AI</strong></span><span><small>{t("chat.aiRoomSubtitle")}</small></span></span></button>}
          {!loadingRooms && filteredRooms.length === 0 && catalog !== "bot" && <div className="sidebar-empty">{catalog === "channel" ? <Megaphone size={22} /> : <MessageCircle size={22} />}<p>{catalog === "channel" ? t("chat.channelNotFound") : t("chat.conversationNotFound")}</p><button onClick={() => setCreateOpen(true)}>{t("chat.newChatButton")}</button></div>}
          {filteredRooms.map((room) => {
            const other = room.type === "direct" ? room.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id) : null;
            return (
              <button key={room.id} className={`room-item ${room.id === selectedId ? "active" : ""}`} onClick={() => chooseRoom(room.id)} onContextMenu={(event) => showRoomContext(event, room)}>
                {room.type === "direct" ? <Avatar firstName={other?.firstName} lastName={other?.lastName} url={other?.avatarUrl} /> : room.avatarUrl ? <span className="room-avatar room-avatar-image"><img src={room.avatarUrl} alt="" /></span> : <span className="room-avatar room-avatar-letter">{(room.name || (room.type === "channel" ? "K" : "G")).trim().charAt(0).toUpperCase()}</span>}
                <span className="room-copy"><span><strong>{roomTitle(room)}</strong><time>{room.lastMessage ? formatTime(room.lastMessage.createdAt) : ""}</time></span><span><small>{room.lastMessage?.content || (room.memberStatus === "pending" ? t("chat.invitePending") : t("chat.noMessagesYet"))}</small>{room.unreadCount > 0 && <b>{room.unreadCount}</b>}</span></span>
              </button>
            );
          })}
        </div>
        <footer className="chat-connection"><span className={connected ? "online" : ""} /><small>{connected ? t("shell.realtime") : t("chat.reconnecting")}</small></footer>
      </aside>

      <section className="conversation">
        {!selectedRoom && !aiOpen && !loadingRooms && <EmptyState icon={<MessageCircle size={27} />} title={t("chat.selectConversationTitle")} description={t("chat.selectConversationDesc")} action={<Button onClick={() => setCreateOpen(true)} icon={<Plus size={17} />}>{t("chat.newConversationButton")}</Button>} />}
        {aiOpen && <div className="ai-conversation">
          <header className="conversation-header"><button className="icon-button chat-back" onClick={() => { setAiOpen(false); window.history.replaceState({}, "", "/chat"); }} aria-label={t("chat.backToBotsAria")}><ArrowLeft size={20} /></button><span className="room-avatar room-avatar-sm"><Bot size={17} /></span><div className="conversation-title"><h2>OPTIMA AI</h2><p>{aiThinking ? t("chat.aiThinkingStatus") : t("chat.aiOnlineAssistant")}</p></div><span className="ai-provider-badge"><ShieldCheck size={14} /> {t("chat.secureBadge")}</span></header>
          <div ref={aiMessageList} className="message-list ai-message-list" aria-live="polite">
            {aiMessages.length === 0 && <div className="message-empty"><span><Bot size={25} /></span><h3>OPTIMA AI</h3><p>{t("chat.aiEmptyDesc")}</p></div>}
            {aiMessages.map((message) => <div key={message.id} className={`message ${message.role === "user" ? "message-mine" : ""}`}><div className="message-bubble">{message.role === "model" && <strong>OPTIMA AI</strong>}<p>{message.text}</p>{message.sources && message.sources.length > 0 && <div className="ai-sources"><small>{t("chat.sourcesLabel")}</small>{message.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><Link2 size={13} />{source.title}</a>)}</div>}<span><time>{formatTime(message.createdAt)}</time></span></div></div>)}
            {aiThinking && <div className="typing-bubble ai-typing"><Bot size={16} /><i /><i /><i /></div>}
          </div>
          <div className="composer ai-composer"><textarea value={aiDraft} onChange={(event) => setAiDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendAiMessage(); } }} placeholder={t("chat.aiComposerPlaceholder")} rows={1} maxLength={6000} aria-label={t("chat.aiQuestionAria")} /><button className="send-button" onClick={() => void sendAiMessage()} disabled={!aiDraft.trim() || aiThinking} aria-label={t("chat.sendQuestionAria")}>{aiThinking ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button></div>
        </div>}
        {selectedRoom && (
          <>
            <header className="conversation-header">
              <button className="icon-button chat-back" onClick={() => { setSelectedId(null); window.history.replaceState({}, "", "/chat"); }} aria-label={t("chat.backToChatsAria")} title={t("chat.chatsTitle")}><ArrowLeft size={20} /></button>
              {selectedRoom.type === "direct" && detailPeer ? <Avatar firstName={detailPeer.firstName} lastName={detailPeer.lastName} url={detailPeer.avatarUrl} size="sm" /> : selectedRoom.avatarUrl ? <span className="room-avatar room-avatar-sm room-avatar-image"><img src={selectedRoom.avatarUrl} alt="" /></span> : <span className="room-avatar room-avatar-sm room-avatar-letter">{(selectedRoom.name || (selectedRoom.type === "channel" ? "K" : "G")).trim().charAt(0).toUpperCase()}</span>}
              <button className="conversation-title" onClick={() => { setDetailsTab(selectedRoom.type === "direct" ? "media" : "members"); setDetailMemberSearch(""); setDetailsOpen(true); }} aria-label={t("chat.openInfoAria")}><h2>{roomTitle(selectedRoom)}</h2><p>{typingUsers.length ? t("chat.typingStatus") : selectedRoom.type === "direct" ? (connected ? t("chat.onlineStatus") : t("chat.offlineStatus")) : t("chat.membersCountLabel", { count: selectedRoom.memberCount })}</p></button>
              <div className="conversation-tools">
                <button className={`icon-button ${messageSearchOpen ? "active" : ""}`} onClick={() => { setMessageSearchOpen((value) => !value); if (messageSearchOpen) setMessageSearch(""); }} aria-label={t("chat.searchMessagesAria")} title={t("chat.searchTitle")}><Search size={18} /></button>
                {selectedRoom.type === "direct" && <>
                  <button className="icon-button" onClick={() => void startCall("audio")} disabled={Boolean(startingCall) || !detailPeer} aria-label={t("chat.audioCallAria")} title={t("chat.audioCallAria")}>{startingCall === "audio" ? <LoaderCircle className="spin" size={18} /> : <Phone size={18} />}</button>
                  <button className="icon-button" onClick={() => void startCall("video")} disabled={Boolean(startingCall) || !detailPeer} aria-label={t("chat.videoCallAria")} title={t("chat.videoCallAria")}>{startingCall === "video" ? <LoaderCircle className="spin" size={18} /> : <Video size={18} />}</button>
                </>}
                {selectedRoom.type !== "direct" && selectedRoom.memberStatus !== "pending" && (!selectedRoom.isSystem || user?.publicId === "777777") && <div className="header-more"><button className={`icon-button ${headerMenuOpen ? "active" : ""}`} onClick={() => setHeaderMenuOpen((value) => !value)} aria-label={t("chat.conversationMenuAria")} aria-expanded={headerMenuOpen}><MoreVertical size={19} /></button>{headerMenuOpen && <div className="header-more-menu">{(selectedRoom.createdById === user?.id || user?.publicId === "777777") && <button onClick={() => { setHeaderMenuOpen(false); openRoomSettings(); }}><Settings size={17} /><span><strong>{selectedRoom.type === "channel" ? t("chat.configureChannel") : t("chat.configureGroup")}</strong><small>{t("chat.photoNameDescHint")}</small></span></button>}{!selectedRoom.isSystem && <button onClick={() => { setHeaderMenuOpen(false); void openRoomInvites(); }}><UserPlus size={17} /><span><strong>{t("chat.inviteToGroup")}</strong><small>{t("chat.createManageLinkHint")}</small></span></button>}{!selectedRoom.isSystem && selectedRoom.createdById === user?.id && <button className="danger" onClick={() => void deleteSelectedRoom()}><Trash2 size={17} /><span><strong>{t("chat.deleteGroup")}</strong><small>{t("chat.deletesAllMessagesHint")}</small></span></button>}</div>}</div>}
              </div>
            </header>
            {messageSearchOpen && <div className="conversation-search"><Search size={17} /><input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder={t("chat.searchMessagePlaceholder")} autoFocus /><span>{messageSearch ? t("chat.resultsCount", { count: visibleMessages.length }) : ""}</span><button onClick={() => { setMessageSearch(""); setMessageSearchOpen(false); }} aria-label={t("chat.closeSearchAria")}><X size={17} /></button></div>}
            {selectedRoom.memberStatus === "pending" ? (
              <div className="invite-state"><UsersRound size={28} /><h3>{t("chat.conversationInviteTitle")}</h3><p>{t("chat.conversationInviteDesc")}</p><Button onClick={() => void acceptInvite()} icon={<Check size={17} />}>{t("chat.acceptButton")}</Button></div>
            ) : (
              <>
                <div ref={messageList} className="message-list" aria-live="polite" onScroll={(event) => { const node = event.currentTarget; setShowScrollButton(node.scrollHeight - node.scrollTop - node.clientHeight > 96); if (node.scrollTop < 90) void loadOlderMessages(); }}>
                  {loadingOlderMessages && <div className="older-messages-loader"><LoaderCircle className="spin" size={18} /> {t("chat.loadingOlderMessages")}</div>}
                  {loadingMessages && <div className="center-loader"><LoaderCircle className="spin" size={24} /></div>}
                  {!loadingMessages && visibleMessages.length === 0 && <div className="message-empty"><span>{messageSearch ? <Search size={24} /> : <MessageCircle size={24} />}</span><h3>{messageSearch ? t("chat.messageNotFound") : t("chat.startConversationTitle")}</h3><p>{messageSearch ? t("chat.tryOtherSearch") : t("chat.sendFirstMessage")}</p></div>}
                  {visibleMessages.map((message, index) => {
                    const mine = message.senderId === user?.id;
                    const sender = message.sender || memberMap.get(message.senderId);
                    const previous = visibleMessages[index - 1];
                    const showDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                    const grouped = previous?.senderId === message.senderId && !showDay;
                    return (
                      <div key={message.id}>
                        {showDay && <div className="day-separator"><span>{formatDay(message.createdAt)}</span></div>}
                        <div
                          id={`message-${message.id}`}
                          className={`message ${mine ? "message-mine" : ""} ${grouped ? "message-grouped" : ""} ${swipingMessage?.id === message.id ? "message-swiping" : ""}`}
                          style={swipingMessage?.id === message.id ? { transform: `translate3d(${swipingMessage.offset}px,0,0)` } : undefined}
                          onTouchStart={(event) => startReplySwipe(event, message)}
                          onTouchMove={(event) => moveReplySwipe(event, message)}
                          onTouchEnd={() => finishReplySwipe(message)}
                          onTouchCancel={() => finishReplySwipe(message)}
                          onPointerDown={(event) => startPointerReply(event, message)}
                          onPointerMove={(event) => movePointerReply(event, message)}
                          onPointerUp={(event) => finishPointerReply(event, message)}
                          onPointerCancel={(event) => finishPointerReply(event, message)}
                          onContextMenu={(event) => { event.preventDefault(); setActiveMenu(message.id); }}
                        >
                          <span className={`swipe-reply-indicator ${swipingMessage?.id === message.id && swipingMessage.armed ? "armed" : ""}`} aria-hidden="true"><Reply size={18} /></span>
                          {!mine && !grouped && <Avatar firstName={sender?.firstName} lastName={sender?.lastName} url={sender?.avatarUrl} size="sm" />}
                          {!mine && grouped && <span className="avatar-spacer" />}
                          <div className="message-bubble">
                            {message.replyToId && <button className="message-reply-quote" onClick={() => document.getElementById(`message-${message.replyToId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><Reply size={13} /><span>{messages.find((item) => item.id === message.replyToId)?.content || t("chat.repliedMessageFallback")}</span></button>}
                            {!mine && !grouped && <strong>{sender ? `${sender.firstName} ${sender.lastName}`.trim() : t("chat.teamMemberFallback")}</strong>}
                            {message.content && <p>{message.content}</p>}
                            {message.attachments?.map((attachment) => attachment.mimeType.startsWith("audio/") ? <AudioMessage key={attachment.id || attachment.url} src={attachment.url} fileName={attachment.fileName} voice={attachment.fileName.startsWith("voice-")} /> : attachment.mimeType.startsWith("image/") ? <button className="message-image" key={attachment.id || attachment.url} onClick={() => setMediaPreview({ url: attachment.url, name: attachment.fileName })}><img src={attachment.url} alt={attachment.fileName} /></button> : attachment.mimeType.startsWith("video/") ? <video className="message-video" key={attachment.id || attachment.url} controls preload="metadata" src={attachment.url} /> : <a className="file-attachment" key={attachment.id || attachment.url} href={attachment.url} download><span><FileText size={20} /></span><span><strong>{attachment.fileName}</strong><small>{t("chat.fileSizeDownload", { size: Math.max(1, Math.round(attachment.fileSize / 1024)) })}</small></span><Download size={17} /></a>)}
                            {message.reactions && message.reactions.length > 0 && <div className="message-reactions">{message.reactions.map((reaction) => <button key={reaction.emoji} onClick={() => void reactToMessage(message, reaction.emoji)}>{reaction.emoji} <span>{reaction.userIds.length}</span></button>)}</div>}
                            <span><time>{formatTime(message.createdAt)}</time>{message.isEdited && <small>{t("chat.editedLabel")}</small>}{mine && <CheckCheck size={14} />}</span>
                            {selectedRoom.slug === "otima-community" && <button className="discuss-button" onClick={() => void openDiscussion(message.id)}><MessageCircle size={15} /> {t("chat.discussLabel")}</button>}
                            <button className="message-menu-trigger" onClick={() => setActiveMenu((value) => value === message.id ? null : message.id)} aria-label={t("chat.messageActionsAria")} aria-expanded={activeMenu === message.id}><MoreVertical size={16} /></button>
                            {activeMenu === message.id && <div className="message-context-menu" role="menu" onMouseLeave={() => setActiveMenu(null)}><div className="reaction-strip">{quickEmojis.slice(0, 5).map((emoji) => <button key={emoji} onClick={() => void reactToMessage(message, emoji)}>{emoji}</button>)}</div><button onClick={() => { setReplyingTo(message); setEditing(null); setActiveMenu(null); }}><Reply size={16} />{t("chat.replyAction")}</button><button onClick={() => { setForwardingMessage(message); setActiveMenu(null); }}><Send size={16} />{t("chat.forwardAction")}</button><button onClick={() => { void navigator.clipboard.writeText(message.content); setActiveMenu(null); }}><Copy size={16} />{t("chat.copyAction")}</button>{mine && <button onClick={() => { setEditing(message); setReplyingTo(null); setDraft(message.content); setActiveMenu(null); }}><Pencil size={16} />{t("chat.editAction")}</button>}<button disabled><Pin size={16} />{t("chat.pinAction")} <small>{t("chat.comingSoon")}</small></button>{mine && <button className="danger" onClick={() => void deleteMessage(message)}><Trash2 size={16} />{t("chat.deleteAction")}</button>}</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {typingUsers.length > 0 && <div className="typing-bubble"><i /><i /><i /></div>}
                  <div ref={messagesEnd} />
                  {showScrollButton && <button className="scroll-bottom" onClick={() => { setShowScrollButton(false); messagesEnd.current?.scrollIntoView({ behavior: "smooth" }); }} aria-label={t("chat.scrollToLatestAria")}><ArrowDown size={19} /></button>}
                </div>
                {selectedRoom.slug === "otima-community" && user?.publicId !== "777777" ? <div className="channel-subscribe-bar"><button onClick={() => void toggleChannelMute()}>{selectedRoom.isMuted ? <Bell size={19} /> : <BellOff size={19} />}{selectedRoom.isMuted ? t("chat.unmute") : t("chat.mute")}</button></div> : <div className={`composer ${recording ? "composer-recording" : ""}`}>
                  {/^\/ai(?:\s|$)/i.test(draft) && <form className="composer-ai-assist" onSubmit={(event) => { event.preventDefault(); void runComposerAi(); }}><header><span><Sparkles size={17} /></span><div><strong>{t("chat.aiAssistTitle")}</strong><small>{t("chat.aiAssistHint")}</small></div><button type="button" onClick={() => { setDraft(""); setAiAssistPrompt(""); }} aria-label={t("chat.closeAiAssistAria")}><X size={17} /></button></header><div className="ai-assist-suggestions"><button type="button" onClick={() => setAiAssistPrompt(t("chat.suggestWriteTextPrompt"))}>{t("chat.suggestWriteText")}</button><button type="button" onClick={() => setAiAssistPrompt(t("chat.suggestFixTextPrompt"))}>{t("chat.suggestFixText")}</button><button type="button" onClick={() => setAiAssistPrompt(t("chat.suggestFillInfoPrompt"))}>{t("chat.suggestFillInfo")}</button></div><div className="ai-assist-input"><textarea value={aiAssistPrompt} onChange={(event) => setAiAssistPrompt(event.target.value)} placeholder={t("chat.aiAssistPlaceholder")} rows={3} autoFocus /><button type="submit" disabled={!aiAssistPrompt.trim() || aiThinking} aria-label={t("chat.runAiAssistAria")}>{aiThinking ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}</button></div></form>}
                  {(replyingTo || editing) && <div className="composer-mode"><span>{editing ? <Pencil size={16} /> : <Reply size={16} />}</span><div><strong>{editing ? t("chat.editingMessageLabel") : t("chat.replyingLabel")}</strong><small>{(editing || replyingTo)?.content || t("chat.mediaMessageFallback")}</small></div><button onClick={() => { setEditing(null); setReplyingTo(null); setDraft(""); }} aria-label={t("chat.cancelAria")}><X size={17} /></button></div>}
                  <span className="emoji-menu-wrap"><button className="icon-button" onClick={() => setEmojiOpen((value) => !value)} aria-label={t("chat.chooseEmojiAria")} aria-expanded={emojiOpen}><Smile size={20} /></button>{emojiOpen && <span className="emoji-menu" role="menu" aria-label={t("chat.quickEmojisAria")}>{quickEmojis.map((emoji) => <button key={emoji} type="button" role="menuitem" onClick={() => { setDraft((current) => `${current}${emoji}`); setEmojiOpen(false); }} aria-label={t("chat.addEmojiAria", { emoji })}>{emoji}</button>)}</span>}</span>
                  <input ref={fileInput} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} />
                  {!recording && <button className="icon-button" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label={t("chat.attachFileAria")}>{uploading ? <LoaderCircle className="spin" size={19} /> : <Paperclip size={20} />}</button>}
                  {recording ? <div className="recording-status"><i /><strong>{t("chat.recordingInProgress")}</strong><time>{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</time><button onClick={() => stopRecording(true)} aria-label={t("chat.cancelRecordingAria")}><Trash2 size={18} /></button></div> : <textarea value={draft} onChange={(event) => announceTyping(event.target.value)} onKeyDown={keyDown} placeholder={t("chat.messagePlaceholder")} rows={1} maxLength={1500} aria-label={t("chat.messageTextAria")} />}
                  {draft.trim() && !recording ? <button className="send-button" onClick={() => void sendMessage()} disabled={sending} aria-label={t("chat.sendMessageAria")}>{sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button> : <button className={`send-button voice-button ${recording ? "recording" : ""}`} onClick={() => recording ? stopRecording() : void startRecording()} disabled={sending} aria-label={recording ? t("chat.sendVoiceAria") : t("chat.recordVoiceAria")}>{sending ? <LoaderCircle className="spin" size={19} /> : recording ? <Square size={17} fill="currentColor" /> : <Mic size={20} />}</button>}
                </div>}
              </>
            )}
          </>
        )}
      </section>

      {directCall && <div className="direct-call-overlay" role="dialog" aria-modal="true" aria-label={t("chat.directCallAria")}>{directCall.phase === "active" ? <MeetingRoomPage meetingId={directCall.meetingId} directMode onDirectClose={closeDirectCall} /> : <section className="direct-call-ringing"><div className="direct-call-glow" /><Avatar firstName={memberMap.get(directCall.peerId)?.firstName || t("chat.userFallback")} lastName={memberMap.get(directCall.peerId)?.lastName} url={memberMap.get(directCall.peerId)?.avatarUrl} size="xl" /><span className="direct-call-type">{directCall.kind === "video" ? <Video size={17} /> : <Phone size={17} />}{directCall.kind === "video" ? t("chat.videoCallAria") : t("chat.audioCallAria")}</span><h2>{memberMap.get(directCall.peerId) ? `${memberMap.get(directCall.peerId)?.firstName} ${memberMap.get(directCall.peerId)?.lastName}`.trim() : t("chat.userFallback")}</h2><p>{directCall.phase === "incoming" ? t("chat.incomingCallText") : t("chat.connectingText")}</p><div className="direct-call-ringing-actions"><button className="decline" onClick={closeDirectCall}><PhoneOff size={23} /><span>{directCall.phase === "incoming" ? t("chat.declineLabel") : t("chat.cancelCallLabel")}</span></button>{directCall.phase === "incoming" && <button className="accept" onClick={acceptDirectCall}>{directCall.kind === "video" ? <Video size={23} /> : <Phone size={23} />}<span>{t("chat.acceptButton")}</span></button>}</div><small><ShieldCheck size={15} /> {t("chat.callSecurityHint")}</small></section>}</div>}

      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} title={selectedRoom?.type === "direct" ? t("chat.profileTitle") : selectedRoom?.type === "channel" ? t("chat.channelInfoTitle") : t("chat.groupInfoTitle")} description={selectedRoom?.type === "direct" ? t("chat.userInfoDesc") : selectedRoom?.type === "channel" ? t("chat.subscribersCountDesc", { count: selectedRoom?.memberCount || 0 }) : t("chat.membersCountDesc", { count: selectedRoom?.memberCount || 0 })} width="lg">
        <div className={`chat-details details-${selectedRoom?.type || "group"}`}>
          <section className="chat-details-hero">
            {detailPeer ? <Avatar firstName={detailPeer.firstName} lastName={detailPeer.lastName} url={detailPeer.avatarUrl} size="lg" /> : selectedRoom?.avatarUrl ? <span className="room-avatar room-avatar-image"><img src={selectedRoom.avatarUrl} alt="" /></span> : <span className="room-avatar room-avatar-letter">{(selectedRoom?.name || (selectedRoom?.type === "channel" ? "K" : "G")).trim().charAt(0).toUpperCase()}</span>}
            <div className="details-identity"><strong>{selectedRoom ? roomTitle(selectedRoom) : ""}</strong><small>{detailPeer?.username ? `@${detailPeer.username}` : selectedRoom?.type === "direct" ? t("chat.usernameNotSet") : selectedRoom?.type === "channel" ? t("chat.subscribersCountDesc", { count: selectedRoom.memberCount }) : t("chat.membersCountDesc", { count: selectedRoom?.memberCount || 0 })}</small>{selectedRoom?.description && <p>{selectedRoom.description}</p>}</div>
            <span className="details-kind">{selectedRoom?.type === "direct" ? t("chat.dmLabel") : selectedRoom?.type === "channel" ? t("chat.channelLabel") : t("chat.groupLabel")}</span>
          </section>
          <div className="chat-details-actions">
            {selectedRoom?.type === "direct" && <><button onClick={() => setDetailsOpen(false)}><MessageCircle size={19} /><span>{t("chat.messageActionLabel")}</span></button><button onClick={() => void startCall("audio")}><Phone size={19} /><span>{t("chat.audioActionLabel")}</span></button><button onClick={() => void startCall("video")}><Video size={19} /><span>{t("chat.videoActionLabel")}</span></button></>}
            {selectedRoom?.type !== "direct" && !selectedRoom?.isSystem && <button onClick={() => { setDetailsOpen(false); void openRoomInvites(); }}><UserPlus size={19} /><span>{t("chat.inviteActionLabel")}</span></button>}
            {selectedRoom?.type !== "direct" && (!selectedRoom?.isSystem || user?.publicId === "777777") && (selectedRoom?.createdById === user?.id || user?.publicId === "777777") && <button onClick={openRoomSettings}><Settings size={19} /><span>{t("chat.configureActionLabel")}</span></button>}
            <button onClick={() => { setDetailsOpen(false); setMessageSearchOpen(true); }}><Search size={19} /><span>{t("chat.searchActionLabel")}</span></button>
            <button onClick={() => void toggleChannelMute()}>{selectedRoom?.isMuted ? <Bell size={19} /> : <BellOff size={19} />}<span>{selectedRoom?.isMuted ? t("chat.unmute") : t("chat.mute")}</span></button>
          </div>
          {selectedRoom?.type === "direct" && <section className="direct-profile-info"><button onClick={() => navigator.clipboard.writeText(detailPeer?.username ? `@${detailPeer.username}` : roomTitle(selectedRoom))}><UserRound size={19} /><span><strong>{detailPeer?.username ? `@${detailPeer.username}` : t("chat.usernameNotSet")}</strong><small>{t("chat.usernameLabel")}</small></span><Copy size={16} /></button><div><RadioTower size={19} /><span><strong>{connected ? t("chat.onlineStatus") : t("chat.offlineStatus")}</strong><small>{t("chat.activityStatusLabel")}</small></span></div></section>}
          <nav className="chat-details-tabs">{((selectedRoom?.type === "direct" ? ["media", "files", "links", "music", "voice"] : ["members", "media", "files", "links", "music", "voice"]) as Array<typeof detailsTab>).map((tab) => <button key={tab} className={detailsTab === tab ? "active" : ""} onClick={() => setDetailsTab(tab)}>{({ members: selectedRoom?.type === "channel" ? t("chat.subscribersTab") : t("chat.membersTab"), media: t("chat.mediaTab"), files: t("chat.filesTab"), links: t("chat.linksTab"), music: t("chat.musicTab"), voice: t("chat.voiceTab") })[tab]}</button>)}</nav>
          <div className="chat-details-content">
            {detailsTab === "members" && <label className="details-member-search"><Search size={17} /><input value={detailMemberSearch} onChange={(event) => setDetailMemberSearch(event.target.value)} placeholder={selectedRoom?.type === "channel" ? t("chat.searchSubscribersPlaceholder") : t("chat.searchMembersPlaceholder")} /><span>{detailMemberTotal}</span></label>}
            {detailsLoading && <div className="center-loader"><LoaderCircle className="spin" size={22} /></div>}
            {!detailsLoading && detailsTab === "members" && detailMembers.map((member) => <div className="detail-member" key={member.publicId}><button className="detail-member-profile" onClick={() => navigate(member.username ? `/u/${member.username}` : `/user/${member.publicId}`)} aria-label={t("chat.openProfileAria", { name: `${member.firstName} ${member.lastName}` })}><Avatar firstName={member.firstName} lastName={member.lastName} url={member.avatarUrl} size="sm" /><span><strong>{member.firstName} {member.lastName}</strong><small>{member.username ? `@${member.username}` : `ID: ${member.publicId}`} · {member.role}</small></span><i className={member.lastSeen && Date.now() - new Date(member.lastSeen).getTime() < 300000 ? "online" : ""} /></button></div>)}
            {!detailsLoading && detailsTab !== "members" && sharedItems.map((item) => { const href = item.storageUrl || (Array.isArray(item.url) ? item.url[0] : item.url); const image = detailsTab === "media" && item.mimeType?.startsWith("image/") && href; return <button className="shared-item" key={item.id || item.messageId} onClick={() => image ? setMediaPreview({ url: href, name: item.fileName || "Media" }) : href ? window.open(href, "_blank", "noopener,noreferrer") : undefined}><span>{image ? <img src={href} alt={item.fileName || "Media"} /> : detailsTab === "links" ? <Link2 size={20} /> : detailsTab === "voice" || detailsTab === "music" ? <Mic size={20} /> : <FileText size={20} />}</span><span><strong>{item.fileName || item.content || href || t("chat.sharedContentFallback")}</strong><small>{item.username ? `@${item.username} · ` : ""}{formatDay(item.createdAt)}</small></span>{href && <Download size={17} />}</button>; })}
            {!detailsLoading && ((detailsTab === "members" && detailMembers.length === 0) || (detailsTab !== "members" && sharedItems.length === 0)) && <div className="compact-empty"><Search size={20} /><span><strong>{t("chat.emptyDetailsTitle")}</strong><small>{t("chat.emptyDetailsDesc")}</small></span></div>}
          </div>
        </div>
      </Modal>

      <Modal open={roomSettingsOpen} onClose={() => !savingRoomSettings && setRoomSettingsOpen(false)} title={selectedRoom?.type === "channel" ? t("chat.configureChannel") : t("chat.configureGroup")} description={t("chat.roomSettingsDesc")} width="md">
        <form className="room-settings-form" onSubmit={saveRoomSettings}>
          <section className="room-avatar-editor">
            <button type="button" className="room-avatar-preview" onClick={() => roomAvatarInput.current?.click()} disabled={uploadingRoomAvatar} aria-label={t("chat.changeChatPhotoAria")}>
              {roomSettingsAvatar ? <img src={roomSettingsAvatar} alt={t("chat.chatPhotoAlt")} /> : <strong>{(roomSettingsName || (selectedRoom?.type === "channel" ? "K" : "G")).trim().charAt(0).toUpperCase()}</strong>}
              <span>{uploadingRoomAvatar ? <LoaderCircle className="spin" size={20} /> : <Camera size={20} />}</span>
            </button>
            <div><strong>{selectedRoom?.type === "channel" ? t("chat.channelPhotoLabel") : t("chat.groupPhotoLabel")}</strong><small>{t("chat.photoFormatHint")}</small><div><button type="button" onClick={() => roomAvatarInput.current?.click()} disabled={uploadingRoomAvatar}><ImagePlus size={16} />{roomSettingsAvatar ? t("chat.replacePhoto") : t("chat.setPhoto")}</button>{roomSettingsAvatar && <button type="button" className="danger" onClick={() => setRoomSettingsAvatar(null)}><Trash2 size={15} />{t("chat.removePhoto")}</button>}</div></div>
            <input ref={roomAvatarInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => void uploadRoomAvatar(event.target.files?.[0])} />
          </section>
          <label>{selectedRoom?.type === "channel" ? t("chat.channelNameLabel") : t("chat.groupNameLabel")}<input value={roomSettingsName} onChange={(event) => setRoomSettingsName(event.target.value)} maxLength={200} required placeholder={t("chat.namePlaceholder")} /></label>
          <label>{t("chat.descriptionLabel")}<textarea value={roomSettingsDescription} onChange={(event) => setRoomSettingsDescription(event.target.value)} maxLength={1000} rows={4} placeholder={selectedRoom?.type === "channel" ? t("chat.channelAboutPlaceholder") : t("chat.groupAboutPlaceholder")} /><small>{roomSettingsDescription.length}/1000</small></label>
          <div className="room-settings-note"><ShieldCheck size={18} /><span><strong>{t("chat.adminsOnlyTitle")}</strong><small>{t("chat.adminsOnlyDesc")}</small></span></div>
          <div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setRoomSettingsOpen(false)}>{t("common.cancel")}</Button><Button type="submit" icon={savingRoomSettings ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />} disabled={savingRoomSettings || !roomSettingsName.trim()}>{t("common.save")}</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(forwardingMessage)} onClose={() => !forwarding && setForwardingMessage(null)} title={t("chat.forwardMessageTitle")} description={t("chat.forwardMessageDesc")} width="md">
        <div className="forward-preview"><Reply size={16} /><span><strong>{forwardingMessage?.content || forwardingMessage?.attachments?.[0]?.fileName || t("chat.mediaMessageFallback")}</strong><small>{forwardingMessage?.attachments?.length ? t("chat.attachmentsCount", { count: forwardingMessage.attachments.length }) : t("chat.textMessageFallback")}</small></span></div>
        <div className="forward-room-list">{rooms.filter((room) => room.memberStatus !== "pending").map((room) => <button key={room.id} disabled={forwarding} onClick={() => void forwardMessage(room.id)}><span className="room-avatar">{room.type === "channel" ? <Megaphone size={17} /> : room.type === "direct" ? <UserRound size={17} /> : <Hash size={17} />}</span><span><strong>{roomTitle(room)}</strong><small>{room.type === "direct" ? t("chat.personalChatLabel") : t("chat.membersCountDesc", { count: room.memberCount })}</small></span>{forwarding ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>)}</div>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("chat.newConversationTitle")} description={t("chat.newConversationModalDesc")}>
        <form className="modal-form" onSubmit={createConversation}>
          <div className="segmented-control"><button type="button" className={createMode === "group" ? "active" : ""} onClick={() => { setCreateMode("group"); setSelectedMembers([]); }}><UsersRound size={17} /> {t("chat.groupWord")}</button><button type="button" className={createMode === "direct" ? "active" : ""} onClick={() => { setCreateMode("direct"); setSelectedMembers([]); }}><UserRound size={17} /> {t("chat.personalWord")}</button></div>
          {createMode === "group" && <label>{t("chat.groupNameLabel")}<input name="name" placeholder={t("chat.groupNamePlaceholder")} required maxLength={200} /></label>}
          <label className="search-field member-search"><Search size={17} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={createMode === "direct" ? t("chat.searchByNamePlaceholder") : t("chat.searchWorkspaceMembersPlaceholder")} aria-label={t("chat.searchUserAria")} />{searchingUsers ? <LoaderCircle className="spin" size={16} /> : memberSearch && <button type="button" onClick={() => setMemberSearch("")} aria-label={t("chat.clearSearchAria")}><X size={15} /></button>}</label>
          <fieldset className="member-picker"><legend>{createMode === "group" ? t("chat.selectMembersLegend") : t("chat.whoToChatLegend")}</legend>{pickerCandidates.length === 0 && <p className="field-hint">{createMode === "direct" && normalizedMemberSearch.length < 2 ? t("chat.minCharsHint") : t("chat.userNotFoundHint")}</p>}{pickerCandidates.map((member) => { const checked = selectedMembers.includes(member.id); return <label key={member.id} className={checked ? "checked" : ""}><input type={createMode === "direct" ? "radio" : "checkbox"} name="members" value={member.id} checked={checked} onChange={() => setSelectedMembers((current) => createMode === "direct" ? [member.id] : current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} /><Avatar firstName={member.firstName} lastName={member.lastName} url={member.avatarUrl} size="sm" /><span><strong>{member.firstName} {member.lastName}</strong><small>@{member.username}</small></span><Check size={16} /></label>; })}</fieldset>
          <button type="button" className="invite-email-prompt" onClick={() => { setCreateOpen(false); setWorkspaceInviteOpen(true); }}><MailPlus size={18} /><span><strong>{t("chat.inviteNewPersonTitle")}</strong><small>{t("chat.inviteNewPersonHint")}</small></span></button>
          <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button><Button type="submit" loading={creating} disabled={createMode === "direct" && selectedMembers.length !== 1}>{createMode === "group" ? t("chat.createGroupButton") : t("chat.openChatButton")}</Button></div>
        </form>
      </Modal>

      <Modal open={workspaceInviteOpen} onClose={() => setWorkspaceInviteOpen(false)} title={t("chat.workspaceInviteTitle")} description={t("chat.workspaceInviteDesc")}>
        <form className="modal-form" onSubmit={inviteToWorkspace}>
          <label>{t("auth.emailLabel")}<input name="email" type="email" autoComplete="email" placeholder="name@company.com" required /></label>
          <label>{t("chat.roleLabel")}<select name="role" defaultValue="junior"><option value="lead">Lead</option><option value="senior">Senior</option><option value="middle">Middle</option><option value="junior">Junior</option><option value="guest">Guest</option></select></label>
          <p className="field-hint">{t("chat.workspaceInviteHint")}</p>
          <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => { setWorkspaceInviteOpen(false); setCreateOpen(true); }}>{t("chat.backButton")}</Button><Button type="submit" loading={invitingWorkspace} icon={<MailPlus size={17} />}>{t("chat.sendInviteButton")}</Button></div>
        </form>
      </Modal>

      <Modal open={roomInfoOpen} onClose={() => setRoomInfoOpen(false)} title={t("chat.inviteToGroup")} description={t("chat.inviteLinkModalDesc")} width="md">
        <form className="modal-form invite-link-form" onSubmit={createRoomInvite}>
          <div className="form-grid-2"><label>{t("chat.maxUsesLabel")}<input name="maxUses" type="number" min="1" max="100000" defaultValue="25" /></label><label>{t("chat.expiresLabel")}<select name="expiresInHours" defaultValue="168"><option value="24">{t("chat.day1")}</option><option value="168">{t("chat.day7")}</option><option value="720">{t("chat.day30")}</option><option value="">{t("chat.unlimited")}</option></select></label></div>
          <Button type="submit" loading={creatingInvite} icon={<Link2 size={17} />}>{t("chat.createNewLinkButton")}</Button>
        </form>
        <div className="invite-link-list" aria-live="polite">
          {loadingInvites && <div className="center-loader"><LoaderCircle className="spin" size={22} /></div>}
          {!loadingInvites && inviteError && <div className="inline-notice" role="alert">{inviteError}</div>}
          {!loadingInvites && !inviteError && roomInvites.length === 0 && <div className="invite-link-empty"><Link2 size={21} /><p>{t("chat.noInviteLinksYet")}</p></div>}
          {roomInvites.map((invite) => {
            const url = new URL(`/join/chat/${invite.code}`, window.location.origin).toString();
            const expiryDate = invite.expiresAt ? new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { day: "numeric", month: "short", year: "numeric" }).format(new Date(invite.expiresAt)) : "";
            return <div className={`invite-link-row ${invite.isActive ? "" : "inactive"}`} key={invite.id}><span className="invite-link-icon"><Link2 size={17} /></span><span className="invite-link-copy"><strong>{invite.isActive ? url : t("chat.revokedLinkLabel")}</strong><small>{invite.maxUses ? t("chat.usesWithMax", { used: invite.usesCount, max: invite.maxUses }) : t("chat.usesOnly", { used: invite.usesCount })} · {invite.expiresAt ? t("chat.untilDate", { date: expiryDate }) : t("chat.noExpiry")}</small></span>{invite.isActive && <><button type="button" className="icon-button" onClick={() => void copyInvite(invite.code)} aria-label={t("chat.copyLinkAria")} title={t("chat.copyTitle")}><Copy size={17} /></button><button type="button" className="icon-button icon-button-danger" onClick={() => void revokeRoomInvite(invite.id)} aria-label={t("chat.revokeLinkAria")} title={t("chat.revokeTitle")}><Trash2 size={17} /></button></>}</div>;
          })}
        </div>
      </Modal>
    </div>
  );
}
