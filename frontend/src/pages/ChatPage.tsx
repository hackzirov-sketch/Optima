import { ArrowDown, ArrowLeft, Bell, BellOff, Bot, Check, CheckCheck, Copy, Download, FileText, Hash, Link2, LoaderCircle, MailPlus, Megaphone, MessageCircle, MessagesSquare, Mic, MoreVertical, Paperclip, Pencil, Phone, Pin, Plus, RadioTower, Reply, Search, Send, Smile, Square, Trash2, User as UserIcon, UserPlus, UserRound, Users, UsersRound, Video, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Avatar, Button, EmptyState, Modal } from "../components/ui";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { getSocket } from "../lib/socket";
import type { ChatMessage, ChatRoom, RoomInvite, User, WorkspaceMember } from "../types";

function memberUser(member: WorkspaceMember): User {
  return (member.user || {
    id: member.userId,
    firstName: member.firstName || "User",
    lastName: member.lastName || "",
    username: member.username || "user",
    email: member.email || "",
    avatarUrl: member.avatarUrl,
  }) as User;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDay(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Bugun";
  return new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "long" }).format(date);
}

const quickEmojis = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "✅", "🙏"];

export function ChatPage() {
  const { user, workspace } = useAuth();
  const { show } = useToast();
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
  const [catalog, setCatalog] = useState<"all" | "direct" | "group" | "channel" | "bot">("all");
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [draft, setDraft] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
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
  const [roomInvites, setRoomInvites] = useState<RoomInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<number | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordingStream = useRef<MediaStream | null>(null);
  const recordingChunks = useRef<Blob[]>([]);
  const cancelRecording = useRef(false);
  const recordingTimer = useRef<number | null>(null);

  const selectedRoom = rooms.find((room) => room.id === selectedId) || null;
  const memberMap = useMemo(() => {
    const result = new Map<string, Pick<User, "id" | "firstName" | "lastName" | "username" | "avatarUrl">>();
    members.forEach((member) => result.set(member.userId, memberUser(member)));
    rooms.flatMap((room) => room.memberProfiles || []).forEach((profile) => result.set(profile.id, profile));
    globalUsers.forEach((profile) => result.set(profile.id, profile));
    return result;
  }, [members, rooms, globalUsers]);

  function roomTitle(room: ChatRoom) {
    if (room.name) return room.name;
    if (room.type === "direct") {
      const other = room.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id);
      return other ? `${other.firstName} ${other.lastName}`.trim() : "Shaxsiy suhbat";
    }
    return "Nomsiz guruh";
  }

  function chooseRoom(id: string) {
    setSelectedId(id);
    window.history.replaceState({}, "", `/chat?room=${id}`);
  }

  async function deleteSelectedRoom() {
    if (!selectedRoom || selectedRoom.isSystem || selectedRoom.type === "direct") return;
    if (!window.confirm(`“${roomTitle(selectedRoom)}” guruhini barcha xabarlari bilan o‘chirasizmi?`)) return;
    try {
      await api.chat.deleteRoom(selectedRoom.id);
      const remaining = rooms.filter((room) => room.id !== selectedRoom.id);
      setRooms(remaining);
      setHeaderMenuOpen(false);
      if (remaining[0]) chooseRoom(remaining[0].id);
      else { setSelectedId(null); navigate("/chat"); }
      show("Guruh o‘chirildi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Guruh o‘chirilmadi", "error");
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
    else if (mergedRooms[0]) chooseRoom(mergedRooms[0].id);
    setLoadingRooms(false);
  }

  useEffect(() => {
    setLoadingRooms(true);
    void loadRooms().catch((error) => {
      setLoadingRooms(false);
      show(error instanceof Error ? error.message : "Chatlar yuklanmadi", "error");
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
      .then((result) => setMessages([...result.data].sort((a, b) => (a.sequence || +new Date(a.createdAt)) - (b.sequence || +new Date(b.createdAt)))))
      .catch((error) => show(error instanceof Error ? error.message : "Xabarlar yuklanmadi", "error"))
      .finally(() => setLoadingMessages(false));
  }, [selectedId, selectedRoom?.memberStatus, show]);

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
        setRooms((current) => current.map((room) => room.id === message.roomId ? { ...room, unreadCount: room.unreadCount + 1, lastMessage: { id: message.id, content: message.content, senderId: message.senderId, createdAt: message.createdAt } } : room));
        return;
      }
      setMessages((current) => {
        if (message.clientMessageId && current.some((item) => item.clientMessageId === message.clientMessageId)) {
          return current.map((item) => item.clientMessageId === message.clientMessageId ? message : item);
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
    messagesEnd.current?.scrollIntoView({ behavior: messages.length > 10 ? "smooth" : "auto" });
  }, [messages, typingUsers]);

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
        .catch((error) => show(error instanceof Error ? error.message : "Foydalanuvchilar topilmadi", "error"))
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

  async function sendMessage() {
    const content = draft.trim();
    if (!content || !selectedRoom) return;
    if (editing) {
      try {
        const updated = await api.chat.editMessage(editing.id, content);
        setMessages((current) => current.map((item) => item.id === editing.id ? updated : item));
        setDraft("");
        setEditing(null);
      } catch (error) {
        show(error instanceof Error ? error.message : "Xabar tahrirlanmadi", "error");
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
        show(error instanceof Error ? error.message : "Xabar yuborilmadi", "error");
      }
    }
    setReplyingTo(null);
  }

  async function deleteMessage(message: ChatMessage) {
    setActiveMenu(null);
    try {
      await api.chat.deleteMessage(message.id);
      setMessages((current) => current.filter((item) => item.id !== message.id));
      show("Xabar o‘chirildi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Xabar o‘chirilmadi", "error");
    }
  }

  async function reactToMessage(message: ChatMessage, emoji: string) {
    setActiveMenu(null);
    try {
      const socket = getSocket();
      if (!socket.connected) throw new Error("Real-time aloqa mavjud emas");
      socket.emit("add_reaction", { roomId: message.roomId, messageId: message.id, emoji });
    } catch (error) {
      show(error instanceof Error ? error.message : "Reaction qo‘shilmadi", "error");
    }
  }

  async function uploadAttachment(file: File) {
    if (!selectedRoom || uploading) return;
    setUploading(true);
    try {
      const signed = await api.chat.presignAttachment(selectedRoom.id, file);
      const upload = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
      if (!upload.ok) throw new Error("Fayl yuklanmadi");
      const attachment = { storageKey: signed.storageKey, storageUrl: signed.storageUrl, fileName: file.name, fileSize: file.size, mimeType: file.type || "application/octet-stream" };
      const socket = getSocket();
      await new Promise<void>((resolve, reject) => socket.timeout(12000).emit("send_message", { roomId: selectedRoom.id, text: draft.trim(), clientMessageId: crypto.randomUUID(), attachments: [attachment], replyToId: replyingTo?.id }, (error: Error | null) => error ? reject(error) : resolve()));
      setDraft("");
      setReplyingTo(null);
    } catch (error) {
      show(error instanceof Error ? error.message : "Fayl yuborilmadi", "error");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function startCall(kind: "audio" | "video") {
    if (!workspace || !selectedRoom || startingCall) return;
    setStartingCall(kind);
    try {
      const meeting = await api.meetings.create(workspace.id, {
        title: roomTitle(selectedRoom),
        description: `${roomTitle(selectedRoom)} suhbati`,
        startTime: new Date().toISOString(),
        maxParticipants: Math.max(2, selectedRoom.memberCount + 2),
      });
      sessionStorage.setItem(`optima:meeting-camera:${meeting.id}`, kind === "video" ? "on" : "off");
      navigate(`/meetings/${meeting.id}`);
    } catch (error) {
      show(error instanceof Error ? error.message : "Qo‘ng‘iroq boshlanmadi", "error");
      setStartingCall(null);
    }
  }

  async function sendVoice(blob: Blob) {
    if (!selectedRoom || sending) return;
    setSending(true);
    try {
      const attachment = await api.chat.uploadAudio(selectedRoom.id, blob);
      const socket = getSocket();
      if (!socket.connected) throw new Error("Real-time aloqa mavjud emas");
      await new Promise<void>((resolve, reject) => {
        socket.timeout(12000).emit("send_message", { roomId: selectedRoom.id, text: "", clientMessageId: crypto.randomUUID(), attachments: [attachment] }, (error: Error | null) => error ? reject(error) : resolve());
      });
    } catch (error) {
      show(error instanceof Error ? error.message : "Audio xabar yuborilmadi", "error");
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
      show("Mikrofonga ruxsat berilmadi", "error");
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
      show(createMode === "direct" ? "Shaxsiy suhbat ochildi" : "Guruh yaratildi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Suhbat yaratilmadi", "error");
    } finally {
      setCreating(false);
    }
  }

  async function acceptInvite() {
    if (!selectedRoom) return;
    try {
      await api.chat.acceptInvite(selectedRoom.id);
      await loadRooms(selectedRoom.id);
      show("Taklif qabul qilindi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Taklif qabul qilinmadi", "error");
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
      show("Workspace taklifi emailga yuborildi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Taklif yuborilmadi", "error");
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
      setInviteError(error instanceof Error ? error.message : "Taklif havolalari yuklanmadi");
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
      show("Taklif havolasi yaratildi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Havola yaratilmadi", "error");
    } finally {
      setCreatingInvite(false);
    }
  }

  async function copyInvite(code: string) {
    const url = new URL(`/join/chat/${code}`, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      show("Taklif havolasi nusxalandi");
    } catch {
      show("Havolani nusxalab bo‘lmadi", "error");
    }
  }

  async function revokeRoomInvite(inviteId: string) {
    if (!selectedRoom) return;
    try {
      await api.chat.revokeInvite(selectedRoom.id, inviteId);
      setRoomInvites((current) => current.map((entry) => entry.id === inviteId ? { ...entry, isActive: false, revokedAt: new Date().toISOString() } : entry));
      show("Taklif havolasi bekor qilindi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Havola bekor qilinmadi", "error");
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
      show(error instanceof Error ? error.message : "Muhokama ochilmadi", "error");
    }
  }
  async function toggleChannelMute() {
    if (!selectedRoom) return;
    try {
      const result = await api.chat.mute(selectedRoom.id, !selectedRoom.isMuted);
      setRooms((current) => current.map((room) => room.id === selectedRoom.id ? { ...room, isMuted: result.isMuted } : room));
      show(result.isMuted ? "Kanal ovozsiz qilindi" : "Kanal ovozi yoqildi");
    } catch (error) {
      show(error instanceof Error ? error.message : "Sozlama saqlanmadi", "error");
    }
  }
  const catalogItems = [
    { id: "all" as const, label: "Barchasi", icon: MessagesSquare, count: rooms.reduce((sum, room) => sum + room.unreadCount, 0) },
    { id: "direct" as const, label: "Shaxsiy", icon: UserIcon, count: rooms.filter((room) => roomCatalog(room) === "direct").reduce((sum, room) => sum + room.unreadCount, 0) },
    { id: "group" as const, label: "Guruhlar", icon: Users, count: rooms.filter((room) => roomCatalog(room) === "group").reduce((sum, room) => sum + room.unreadCount, 0) },
    { id: "channel" as const, label: "Kanallar", icon: RadioTower, count: rooms.filter((room) => roomCatalog(room) === "channel").reduce((sum, room) => sum + room.unreadCount, 0) },
    { id: "bot" as const, label: "Botlar", icon: Bot, count: 0 },
  ];
  const filteredRooms = rooms.filter((room) => (catalog === "all" || roomCatalog(room) === catalog) && roomTitle(room).toLowerCase().includes(search.toLowerCase()));
  const visibleMessages = messageSearch.trim()
    ? messages.filter((message) => `${message.content} ${message.attachments?.map((attachment) => attachment.fileName).join(" ") || ""}`.toLowerCase().includes(messageSearch.trim().toLowerCase()))
    : messages;
  const availableMembers = members.map(memberUser).filter((member) => member.id !== user?.id);
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const localCandidates = availableMembers.filter((member) => `${member.firstName} ${member.lastName} ${member.username} ${member.email}`.toLowerCase().includes(normalizedMemberSearch));
  const pickerCandidates = createMode === "direct" && normalizedMemberSearch.length >= 2 ? globalUsers : localCandidates;

  return (
    <div className={`chat-page ${selectedRoom ? "chat-room-open" : ""}`}>
      <aside className="chat-sidebar">
        <header className="chat-sidebar-header"><div><p className="eyebrow">Workspace</p><h1>Xabarlar</h1></div><button className="icon-button icon-button-dark" onClick={() => setCreateOpen(true)} aria-label="Yangi suhbat" title="Yangi suhbat"><Plus size={19} /></button></header>
        <label className="search-field"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Chat qidirish" aria-label="Chat qidirish" />{search && <button onClick={() => setSearch("")} aria-label="Qidiruvni tozalash"><X size={15} /></button>}</label>
        <nav className="chat-catalog" aria-label="Chat kataloglari">
          <span className={`catalog-indicator catalog-${catalog}`} aria-hidden="true" />
          {catalogItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={catalog === item.id ? "active" : ""} onClick={() => setCatalog(item.id)} aria-current={catalog === item.id ? "page" : undefined}><Icon size={16} /><span>{item.label}</span>{item.count > 0 && <b>{item.count}</b>}</button>; })}
        </nav>
        <div className="room-list room-list-transition" key={catalog}>
          {loadingRooms && <div className="center-loader"><LoaderCircle className="spin" size={22} /></div>}
          {!loadingRooms && filteredRooms.length === 0 && <div className="sidebar-empty">{catalog === "bot" ? <Bot size={22} /> : catalog === "channel" ? <Megaphone size={22} /> : <MessageCircle size={22} />}<p>{catalog === "bot" ? "Botlar hali ulanmagan" : catalog === "channel" ? "Kanal topilmadi" : "Suhbat topilmadi"}</p>{catalog !== "bot" && <button onClick={() => setCreateOpen(true)}>Yangi chat ochish</button>}</div>}
          {filteredRooms.map((room) => {
            const other = room.type === "direct" ? room.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id) : null;
            return (
              <button key={room.id} className={`room-item ${room.id === selectedId ? "active" : ""}`} onClick={() => chooseRoom(room.id)}>
                {room.type === "direct" ? <Avatar firstName={other?.firstName} lastName={other?.lastName} url={other?.avatarUrl} /> : <span className="room-avatar">{room.type === "channel" ? <Megaphone size={17} /> : <Hash size={17} />}</span>}
                <span className="room-copy"><span><strong>{roomTitle(room)}</strong><time>{room.lastMessage ? formatTime(room.lastMessage.createdAt) : ""}</time></span><span><small>{room.lastMessage?.content || (room.memberStatus === "pending" ? "Taklif kutilmoqda" : "Hali xabar yo‘q")}</small>{room.unreadCount > 0 && <b>{room.unreadCount}</b>}</span></span>
              </button>
            );
          })}
        </div>
        <footer className="chat-connection"><span className={connected ? "online" : ""} /><small>{connected ? "Real-time ulangan" : "Qayta ulanmoqda..."}</small></footer>
      </aside>

      <section className="conversation">
        {!selectedRoom && !loadingRooms && <EmptyState icon={<MessageCircle size={27} />} title="Suhbatni tanlang" description="Guruh yoki jamoa a’zosi bilan yozishishni boshlang." action={<Button onClick={() => setCreateOpen(true)} icon={<Plus size={17} />}>Yangi suhbat</Button>} />}
        {selectedRoom && (
          <>
            <header className="conversation-header">
              <button className="icon-button chat-back" onClick={() => { setSelectedId(null); window.history.replaceState({}, "", "/chat"); }} aria-label="Chatlar ro‘yxatiga qaytish"><ArrowLeft size={20} /></button>
              <span className="room-avatar room-avatar-sm">{selectedRoom.type === "direct" ? <UserRound size={16} /> : selectedRoom.type === "channel" ? <Megaphone size={16} /> : <Hash size={16} />}</span>
              <div className="conversation-title"><h2>{roomTitle(selectedRoom)}</h2><p>{typingUsers.length ? "yozmoqda..." : selectedRoom.type === "direct" ? (connected ? "online" : "offline") : `${selectedRoom.memberCount} a’zo`}</p></div>
              <div className="conversation-tools">
                <button className={`icon-button ${messageSearchOpen ? "active" : ""}`} onClick={() => { setMessageSearchOpen((value) => !value); if (messageSearchOpen) setMessageSearch(""); }} aria-label="Xabarlardan qidirish" title="Qidirish"><Search size={18} /></button>
                <button className="icon-button" onClick={() => void startCall("audio")} disabled={Boolean(startingCall)} aria-label="Audio qo‘ng‘iroq" title="Audio qo‘ng‘iroq">{startingCall === "audio" ? <LoaderCircle className="spin" size={18} /> : <Phone size={18} />}</button>
                <button className="icon-button" onClick={() => void startCall("video")} disabled={Boolean(startingCall)} aria-label="Video qo‘ng‘iroq" title="Video qo‘ng‘iroq">{startingCall === "video" ? <LoaderCircle className="spin" size={18} /> : <Video size={18} />}</button>
                {selectedRoom.type !== "direct" && selectedRoom.memberStatus !== "pending" && !selectedRoom.isSystem && <div className="header-more"><button className={`icon-button ${headerMenuOpen ? "active" : ""}`} onClick={() => setHeaderMenuOpen((value) => !value)} aria-label="Suhbat menyusi" aria-expanded={headerMenuOpen}><MoreVertical size={19} /></button>{headerMenuOpen && <div className="header-more-menu"><button onClick={() => { setHeaderMenuOpen(false); void openRoomInvites(); }}><UserPlus size={17} /><span><strong>Guruhga taklif</strong><small>Havola yaratish va boshqarish</small></span></button>{selectedRoom.createdById === user?.id && <button className="danger" onClick={() => void deleteSelectedRoom()}><Trash2 size={17} /><span><strong>Guruhni o‘chirish</strong><small>Barcha xabarlar bilan o‘chadi</small></span></button>}</div>}</div>}
              </div>
            </header>
            {messageSearchOpen && <div className="conversation-search"><Search size={17} /><input value={messageSearch} onChange={(event) => setMessageSearch(event.target.value)} placeholder="Xabar yoki fayl nomini qidiring" autoFocus /><span>{messageSearch ? `${visibleMessages.length} natija` : ""}</span><button onClick={() => { setMessageSearch(""); setMessageSearchOpen(false); }} aria-label="Qidiruvni yopish"><X size={17} /></button></div>}
            {selectedRoom.memberStatus === "pending" ? (
              <div className="invite-state"><UsersRound size={28} /><h3>Suhbatga taklif</h3><p>Yozishishni boshlash uchun taklifni qabul qiling.</p><Button onClick={() => void acceptInvite()} icon={<Check size={17} />}>Qabul qilish</Button></div>
            ) : (
              <>
                <div ref={messageList} className="message-list" aria-live="polite" onScroll={(event) => { const node = event.currentTarget; setShowScrollButton(node.scrollHeight - node.scrollTop - node.clientHeight > 220); }}>
                  {loadingMessages && <div className="center-loader"><LoaderCircle className="spin" size={24} /></div>}
                  {!loadingMessages && visibleMessages.length === 0 && <div className="message-empty"><span>{messageSearch ? <Search size={24} /> : <MessageCircle size={24} />}</span><h3>{messageSearch ? "Xabar topilmadi" : "Suhbatni boshlang"}</h3><p>{messageSearch ? "Boshqa so‘z bilan qidirib ko‘ring." : "Birinchi xabarni yuboring."}</p></div>}
                  {visibleMessages.map((message, index) => {
                    const mine = message.senderId === user?.id;
                    const sender = message.sender || memberMap.get(message.senderId);
                    const previous = visibleMessages[index - 1];
                    const showDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                    const grouped = previous?.senderId === message.senderId && !showDay;
                    return (
                      <div key={message.id}>
                        {showDay && <div className="day-separator"><span>{formatDay(message.createdAt)}</span></div>}
                        <div id={`message-${message.id}`} className={`message ${mine ? "message-mine" : ""} ${grouped ? "message-grouped" : ""}`}>
                          {!mine && !grouped && <Avatar firstName={sender?.firstName} lastName={sender?.lastName} url={sender?.avatarUrl} size="sm" />}
                          {!mine && grouped && <span className="avatar-spacer" />}
                          <div className="message-bubble">
                            {message.replyToId && <button className="message-reply-quote" onClick={() => document.getElementById(`message-${message.replyToId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><Reply size={13} /><span>{messages.find((item) => item.id === message.replyToId)?.content || "Javob berilgan xabar"}</span></button>}
                            {!mine && !grouped && <strong>{sender ? `${sender.firstName} ${sender.lastName}`.trim() : "Jamoa a’zosi"}</strong>}
                            {message.content && <p>{message.content}</p>}
                            {message.attachments?.map((attachment) => attachment.mimeType.startsWith("audio/") ? <audio key={attachment.id || attachment.url} className="voice-message" controls preload="metadata" src={attachment.url} aria-label="Audio xabar" /> : attachment.mimeType.startsWith("image/") ? <a className="message-image" key={attachment.id || attachment.url} href={attachment.url} target="_blank" rel="noreferrer"><img src={attachment.url} alt={attachment.fileName} /></a> : attachment.mimeType.startsWith("video/") ? <video className="message-video" key={attachment.id || attachment.url} controls preload="metadata" src={attachment.url} /> : <a className="file-attachment" key={attachment.id || attachment.url} href={attachment.url} download><span><FileText size={20} /></span><span><strong>{attachment.fileName}</strong><small>{Math.max(1, Math.round(attachment.fileSize / 1024))} KB</small></span><Download size={17} /></a>)}
                            {message.reactions && message.reactions.length > 0 && <div className="message-reactions">{message.reactions.map((reaction) => <button key={reaction.emoji} onClick={() => void reactToMessage(message, reaction.emoji)}>{reaction.emoji} <span>{reaction.userIds.length}</span></button>)}</div>}
                            <span><time>{formatTime(message.createdAt)}</time>{message.isEdited && <small>tahrirlangan</small>}{mine && <CheckCheck size={14} />}</span>
                            {selectedRoom.slug === "otima-community" && <button className="discuss-button" onClick={() => void openDiscussion(message.id)}><MessageCircle size={15} /> Muhokama</button>}
                            <button className="message-menu-trigger" onClick={() => setActiveMenu((value) => value === message.id ? null : message.id)} aria-label="Xabar amallari" aria-expanded={activeMenu === message.id}><MoreVertical size={16} /></button>
                            {activeMenu === message.id && <div className="message-context-menu" role="menu"><div className="reaction-strip">{quickEmojis.slice(0, 5).map((emoji) => <button key={emoji} onClick={() => void reactToMessage(message, emoji)}>{emoji}</button>)}</div><button onClick={() => { setReplyingTo(message); setEditing(null); setActiveMenu(null); }}><Reply size={16} />Javob berish</button><button onClick={() => { void navigator.clipboard.writeText(message.content); setActiveMenu(null); }}><Copy size={16} />Nusxalash</button>{mine && <button onClick={() => { setEditing(message); setReplyingTo(null); setDraft(message.content); setActiveMenu(null); }}><Pencil size={16} />Tahrirlash</button>}<button disabled><Pin size={16} />Mahkamlash <small>tez orada</small></button>{mine && <button className="danger" onClick={() => void deleteMessage(message)}><Trash2 size={16} />O‘chirish</button>}</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {typingUsers.length > 0 && <div className="typing-bubble"><i /><i /><i /></div>}
                  <div ref={messagesEnd} />
                  {showScrollButton && <button className="scroll-bottom" onClick={() => messagesEnd.current?.scrollIntoView({ behavior: "smooth" })} aria-label="Eng yangi xabarga o‘tish"><ArrowDown size={19} /></button>}
                </div>
                {selectedRoom.slug === "otima-community" && user?.publicId !== "777777" ? <div className="channel-subscribe-bar"><button onClick={() => void toggleChannelMute()}>{selectedRoom.isMuted ? <Bell size={19} /> : <BellOff size={19} />}{selectedRoom.isMuted ? "Unmute" : "Mute"}</button></div> : <div className={`composer ${recording ? "composer-recording" : ""}`}>
                  {(replyingTo || editing) && <div className="composer-mode"><span>{editing ? <Pencil size={16} /> : <Reply size={16} />}</span><div><strong>{editing ? "Xabarni tahrirlash" : "Javob berish"}</strong><small>{(editing || replyingTo)?.content || "Media xabar"}</small></div><button onClick={() => { setEditing(null); setReplyingTo(null); setDraft(""); }} aria-label="Bekor qilish"><X size={17} /></button></div>}
                  <span className="emoji-menu-wrap"><button className="icon-button" onClick={() => setEmojiOpen((value) => !value)} aria-label="Emoji tanlash" aria-expanded={emojiOpen}><Smile size={20} /></button>{emojiOpen && <span className="emoji-menu" role="menu" aria-label="Tezkor emojilar">{quickEmojis.map((emoji) => <button key={emoji} type="button" role="menuitem" onClick={() => { setDraft((current) => `${current}${emoji}`); setEmojiOpen(false); }} aria-label={`${emoji} emojisini qo‘shish`}>{emoji}</button>)}</span>}</span>
                  <input ref={fileInput} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAttachment(file); }} />
                  {!recording && <button className="icon-button" onClick={() => fileInput.current?.click()} disabled={uploading} aria-label="Fayl biriktirish">{uploading ? <LoaderCircle className="spin" size={19} /> : <Paperclip size={20} />}</button>}
                  {recording ? <div className="recording-status"><i /><strong>Audio yozilmoqda</strong><time>{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</time><button onClick={() => stopRecording(true)} aria-label="Yozuvni bekor qilish"><Trash2 size={18} /></button></div> : <textarea value={draft} onChange={(event) => announceTyping(event.target.value)} onKeyDown={keyDown} placeholder="Xabar yozing" rows={1} maxLength={1500} aria-label="Xabar matni" />}
                  {draft.trim() && !recording ? <button className="send-button" onClick={() => void sendMessage()} disabled={sending} aria-label="Xabarni yuborish">{sending ? <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button> : <button className={`send-button voice-button ${recording ? "recording" : ""}`} onClick={() => recording ? stopRecording() : void startRecording()} disabled={sending} aria-label={recording ? "Audio xabarni yuborish" : "Audio xabar yozish"}>{sending ? <LoaderCircle className="spin" size={19} /> : recording ? <Square size={17} fill="currentColor" /> : <Mic size={20} />}</button>}
                </div>}
              </>
            )}
          </>
        )}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Yangi suhbat" description="Guruh oching yoki jamoa a’zosi bilan shaxsiy yozishing.">
        <form className="modal-form" onSubmit={createConversation}>
          <div className="segmented-control"><button type="button" className={createMode === "group" ? "active" : ""} onClick={() => { setCreateMode("group"); setSelectedMembers([]); }}><UsersRound size={17} /> Guruh</button><button type="button" className={createMode === "direct" ? "active" : ""} onClick={() => { setCreateMode("direct"); setSelectedMembers([]); }}><UserRound size={17} /> Shaxsiy</button></div>
          {createMode === "group" && <label>Guruh nomi<input name="name" placeholder="Masalan: Product team" required maxLength={200} /></label>}
          <label className="search-field member-search"><Search size={17} /><input value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder={createMode === "direct" ? "Ism yoki username bo‘yicha qidiring" : "Workspace a’zolarini qidiring"} aria-label="Foydalanuvchi qidirish" />{searchingUsers ? <LoaderCircle className="spin" size={16} /> : memberSearch && <button type="button" onClick={() => setMemberSearch("")} aria-label="Qidiruvni tozalash"><X size={15} /></button>}</label>
          <fieldset className="member-picker"><legend>{createMode === "group" ? "A’zolarni tanlang" : "Kim bilan yozishasiz?"}</legend>{pickerCandidates.length === 0 && <p className="field-hint">{createMode === "direct" && normalizedMemberSearch.length < 2 ? "Global qidiruv uchun kamida 2 harf yozing." : "Foydalanuvchi topilmadi."}</p>}{pickerCandidates.map((member) => { const checked = selectedMembers.includes(member.id); return <label key={member.id} className={checked ? "checked" : ""}><input type={createMode === "direct" ? "radio" : "checkbox"} name="members" value={member.id} checked={checked} onChange={() => setSelectedMembers((current) => createMode === "direct" ? [member.id] : current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} /><Avatar firstName={member.firstName} lastName={member.lastName} url={member.avatarUrl} size="sm" /><span><strong>{member.firstName} {member.lastName}</strong><small>@{member.username}</small></span><Check size={16} /></label>; })}</fieldset>
          <button type="button" className="invite-email-prompt" onClick={() => { setCreateOpen(false); setWorkspaceInviteOpen(true); }}><MailPlus size={18} /><span><strong>Yangi odamni taklif qilish</strong><small>Email orqali workspace’ga qo‘shing</small></span></button>
          <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Bekor qilish</Button><Button type="submit" loading={creating} disabled={createMode === "direct" && selectedMembers.length !== 1}>{createMode === "group" ? "Guruh yaratish" : "Chat ochish"}</Button></div>
        </form>
      </Modal>

      <Modal open={workspaceInviteOpen} onClose={() => setWorkspaceInviteOpen(false)} title="Workspace’ga taklif" description="Yangi foydalanuvchi email orqali jamoaga qo‘shiladi.">
        <form className="modal-form" onSubmit={inviteToWorkspace}>
          <label>Email<input name="email" type="email" autoComplete="email" placeholder="name@company.com" required /></label>
          <label>Rol<select name="role" defaultValue="junior"><option value="lead">Lead</option><option value="senior">Senior</option><option value="middle">Middle</option><option value="junior">Junior</option><option value="guest">Guest</option></select></label>
          <p className="field-hint">Taklif qabul qilingach, foydalanuvchini guruhga qo‘shishingiz yoki guruh havolasini yuborishingiz mumkin.</p>
          <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => { setWorkspaceInviteOpen(false); setCreateOpen(true); }}>Orqaga</Button><Button type="submit" loading={invitingWorkspace} icon={<MailPlus size={17} />}>Taklif yuborish</Button></div>
        </form>
      </Modal>

      <Modal open={roomInfoOpen} onClose={() => setRoomInfoOpen(false)} title="Guruhga taklif" description="Havolaga muddat va foydalanish chegarasini belgilang." width="md">
        <form className="modal-form invite-link-form" onSubmit={createRoomInvite}>
          <div className="form-grid-2"><label>Foydalanish soni<input name="maxUses" type="number" min="1" max="100000" defaultValue="25" /></label><label>Amal qilish muddati<select name="expiresInHours" defaultValue="168"><option value="24">1 kun</option><option value="168">7 kun</option><option value="720">30 kun</option><option value="">Cheklanmagan</option></select></label></div>
          <Button type="submit" loading={creatingInvite} icon={<Link2 size={17} />}>Yangi havola yaratish</Button>
        </form>
        <div className="invite-link-list" aria-live="polite">
          {loadingInvites && <div className="center-loader"><LoaderCircle className="spin" size={22} /></div>}
          {!loadingInvites && inviteError && <div className="inline-notice" role="alert">{inviteError}</div>}
          {!loadingInvites && !inviteError && roomInvites.length === 0 && <div className="invite-link-empty"><Link2 size={21} /><p>Hali taklif havolasi yaratilmagan.</p></div>}
          {roomInvites.map((invite) => {
            const url = new URL(`/join/chat/${invite.code}`, window.location.origin).toString();
            return <div className={`invite-link-row ${invite.isActive ? "" : "inactive"}`} key={invite.id}><span className="invite-link-icon"><Link2 size={17} /></span><span className="invite-link-copy"><strong>{invite.isActive ? url : "Bekor qilingan havola"}</strong><small>{invite.maxUses ? `${invite.usesCount}/${invite.maxUses} marta` : `${invite.usesCount} marta`} · {invite.expiresAt ? new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "short", year: "numeric" }).format(new Date(invite.expiresAt)) + " gacha" : "muddatsiz"}</small></span>{invite.isActive && <><button type="button" className="icon-button" onClick={() => void copyInvite(invite.code)} aria-label="Havolani nusxalash" title="Nusxalash"><Copy size={17} /></button><button type="button" className="icon-button icon-button-danger" onClick={() => void revokeRoomInvite(invite.id)} aria-label="Havolani bekor qilish" title="Bekor qilish"><Trash2 size={17} /></button></>}</div>;
          })}
        </div>
      </Modal>
    </div>
  );
}
