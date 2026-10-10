import {
  ArrowDown,
  ArrowLeft,
  AtSign,
  ChevronRight,
  Image as ImageIcon,
  Info,
  Music,
  Bell,
  BellOff,
  Bot,
  Camera,
  Check,
  CheckCheck,
  Copy,
  Download,
  Eye,
  FileText,
  Globe,
  Hash,
  ImagePlus,
  Link2,
  LoaderCircle,
  Lock,
  LogOut,
  Clock3,
  MailPlus,
  Maximize2,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Mic,
  Minus,
  MoreVertical,
  Paperclip,
  Pencil,
  Phone,
  PhoneOff,
  Pin,
  PinOff,
  Plus,
  RadioTower,
  Reply,
  Save,
  Search,
  Send,
  Settings,
  Sliders,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  User as UserIcon,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  Video,
  X
}                                                                           from "lucide-react";
import {
  type CSSProperties,
  FormEvent,
  type MouseEvent,
  type PointerEvent,
  type TouchEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
}                                                                           from "react";
import { useLocation }                                                      from "wouter";
import { useOutsideClose }                                                  from "../lib/useOutsideClose";
import { Avatar, Button, EmptyState, Modal }                                from "../components/ui";
import { StarfieldBackground }                                              from "../components/StarfieldBackground";
import { AudioMessage }                                                     from "../components/AudioMessage";
import { ChannelSettingsPanel }                                             from "../components/ChannelSettingsPanel";
import { EmojiPickerButton }                                                from "../components/EmojiPicker";
import { AnimatedEmoji }                                                    from "../components/AnimatedEmoji";
import { RichMessageInput, type RichMessageInputHandle }                   from "../components/RichMessageInput";
import { MeetingRoomPage }                                                  from "./MeetingRoomPage";
import { useToast }                                                         from "../components/Toast";
import { useConfirm }                                                       from "../components/ConfirmDialog";
import { api }                                                              from "../lib/api";
import { useAuth }                                                          from "../lib/auth";
import { emitWithAck, getSocket, isServerRejection }                        from "../lib/socket";
import { decryptEnvelope, decryptMessage, decryptMessages, invalidateAllRooms, invalidateRoom, sendWithE2ee, serveRoomKeys, UNDECRYPTABLE_TEXT, type E2eeEnvelope, type OutgoingAttachment } from "../lib/e2ee";
import { formatPresenceLabel, initPresence, isPresenceActive, usePresence } from "../lib/presence";
import { setUnreadTotal }                                                   from "../lib/chatUnread";
import { type TranslateFn, useI18n }                                        from "../lib/i18n/i18n";
import type { ChatMessage, ChatRoom, GroupMember, RoomInvite, User } from "../types";
import { clampParticipants } from "../lib/meeting-limits";
import { CUSTOM_EMOJI_ID_PATTERN, CUSTOM_EMOJI_TOKEN_PATTERN } from "../lib/emojiAssets";

/**
 * Telegram's album size, and the same limit the server enforces in
 * message.service.ts — kept identical on purpose so the composer never lets
 * you build a message the send endpoint will reject.
 */
const MAX_ATTACHMENTS = 10;

/** A file waiting in the composer: uploaded (or failing) but not yet sent. */
interface StagedAttachment {
  id: string;
  file: File;
  previewUrl: string | null;
  /** In E2EE chats this carries the file's `secret` (key + real metadata), sent only inside the encrypted message. */
  attachment: OutgoingAttachment | null;
  error: boolean;
}

const localeTag: Record<string, string> = { uz: "uz-UZ", ru: "ru-RU", en: "en-US", tr: "tr-TR" };
const TELEGRAM_EMOJI_PATTERN = new RegExp(`^${CUSTOM_EMOJI_TOKEN_PATTERN.source}$`);
const TELEGRAM_EMOJI_GLOBAL_PATTERN = new RegExp(CUSTOM_EMOJI_TOKEN_PATTERN.source, "g");

function telegramEmojiId(content: string) {
  return content.match(TELEGRAM_EMOJI_PATTERN)?.[1] || "";
}

function isTelegramEmoji(content: string) {
  return TELEGRAM_EMOJI_PATTERN.test(content);
}

function renderMessageContent(content: string) {
  const parts: Array<{ text?: string; emojiId?: string }> = [];
  let cursor = 0;
  for (const match of content.matchAll(TELEGRAM_EMOJI_GLOBAL_PATTERN)) {
    if (match.index > cursor) parts.push({ text: content.slice(cursor, match.index) });
    parts.push({ emojiId: match[1] });
    cursor = match.index + match[0].length;
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor) });
  if (!parts.length) return content;
  return parts.map((part, index) => part.emojiId ?
    <AnimatedEmoji key={`${part.emojiId}-${index}`} className="message-inline-custom-emoji"
                   id={part.emojiId} /> :
    <span key={`text-${index}`}>{part.text}</span>);
}

function MemberPresenceText({ userId }: { userId: string }) {
  const presence = usePresence(userId);
  const { t } = useI18n();
  return <span className={isPresenceActive(presence) ? "online" : ""}>{formatPresenceLabel(presence, t)}</span>;
}

function MemberPresenceDot({ userId }: { userId: string }) {
  const presence = usePresence(userId);
  return <i className={isPresenceActive(presence) ? `online presence-${presence?.status}` : ""} />;
}

/** Telegram-style presence dot pinned to the corner of a DM's avatar in the room list. */
function DirectRoomAvatar({ peer, size = "md" }: {
  peer?: Pick<User, "id" | "firstName" | "lastName" | "avatarUrl"> | null;
  size?: "sm" | "md"
}) {
  const presence = usePresence(peer?.id);
  return (
    <span className={`room-avatar-presence-wrap ${size === "sm" ? "room-avatar-presence-wrap-sm" : ""}`}>
      <Avatar firstName={peer?.firstName} lastName={peer?.lastName} url={peer?.avatarUrl} size={size} />
      {isPresenceActive(presence) && <i className={`room-avatar-presence-dot presence-${presence?.status}`} />}
    </span>
  );
}

/**
 * The avatar for a non-DM room. Telegram-style: an uploaded photo when there
 * is one, otherwise a glyph that says what *kind* of room this is — a
 * broadcast tower for channels, people for groups — rather than the first
 * letter of the name, which told the user nothing (a channel called "Elbek
 * Rustamjanov" was indistinguishable from a personal chat).
 */
function RoomAvatar({ room, size = "md" }: { room: ChatRoom; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "room-avatar-sm" : "";
  if (room.avatarUrl) {
    return <span className={`room-avatar ${sizeClass} room-avatar-image`}><img src={room.avatarUrl} alt="" /></span>;
  }
  const isChannel = room.type === "channel";
  const iconSize = size === "sm" ? 16 : 19;
  return (
    <span className={`room-avatar ${sizeClass} room-avatar-kind ${isChannel ? "room-avatar-channel" : "room-avatar-group"}`}
          aria-hidden="true">
      {isChannel ? <RadioTower size={iconSize} /> : <Users size={iconSize} />}
    </span>
  );
}

function memberUser(member: GroupMember, t: TranslateFn): User {
  return (member.user || {
    id: member.userId,
    firstName: member.firstName || t("chat.userFallback"),
    lastName: member.lastName || "",
    username: member.username || "user",
    email: member.email || "",
    avatarUrl: member.avatarUrl
  }) as User;
}

const quickEmojis = ["p1-0001", "p1-0005", "p1-0006", "p1-0008", "p1-0007"];
function renderReaction(emoji: string) {
  return CUSTOM_EMOJI_ID_PATTERN.test(emoji)
    ? <AnimatedEmoji className="reaction-custom-emoji" id={emoji} />
    : <span className="reaction-unicode-emoji">{emoji}</span>;
}

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

type ChatRouteTarget = { type: "direct" | "group" | "channel"; identifier: string } | null;

export function ChatPage({ routeTarget = null }: { routeTarget?: ChatRouteTarget }) {
  // Workspaces were renamed to groups; the page still calls the current one `workspace`.
  const { user, group: workspace } = useAuth();
  const { show } = useToast();
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const [location, navigate] = useLocation();
  const [minimized, setMinimized] = useState(false);
  const [miniUnreadOnly, setMiniUnreadOnly] = useState(false);
  const [miniWidth, setMiniWidth] = useState(320);
  const [miniHeight, setMiniHeight] = useState(480);
  const [miniPos, setMiniPos] = useState(() => ({ x: window.innerWidth - 340, y: window.innerHeight - 570 }));
  const [miniResizing, setMiniResizing] = useState(false);
  const miniResizeStart = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    posX: number;
    posY: number;
    dir: string
  }>({ x: 0, y: 0, width: 320, height: 480, posX: 0, posY: 0, dir: "nw" });
  const [miniDragging, setMiniDragging] = useState(false);
  const miniDragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const roomsRef = useRef<ChatRoom[]>([]);
  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);
  const [messageToasts, setMessageToasts] = useState<Array<{
    id: string;
    roomId: string;
    title: string;
    preview: string;
    avatarUrl?: string | null;
    senderFirstName?: string;
    senderLastName?: string
  }>>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("room"));
  const [search, setSearch] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [startingCall, setStartingCall] = useState<"audio" | "video" | null>(null);
  const [directCall, setDirectCall] = useState<{
    meetingId: string;
    roomId: string;
    peerId: string;
    kind: "audio" | "video";
    phase: "incoming" | "outgoing" | "active"
  } | null>(null);
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
  const [readReceipts, setReadReceipts] = useState<Map<string, number>>(new Map());
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  /** Where the open message menu sits, relative to the conversation pane. */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const [pinned, setPinned] = useState<ChatMessage[]>([]);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [roomContext, setRoomContext] = useState<{ roomId: string; x: number; y: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [staged, setStaged] = useState<StagedAttachment[]>([]);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [connected, setConnected] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"group" | "channel" | "direct">("group");
  const [createScope, setCreateScope] = useState<"public" | "private">("public");
  const [creating, setCreating] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [globalUsers, setGlobalUsers] = useState<Array<Pick<User, "id" | "firstName" | "lastName" | "username" | "avatarUrl">>>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  // Telegram-style: the sidebar search box looks past the joined rooms and
  // finds people you have never written to yet.
  const [sidebarUsers, setSidebarUsers] = useState<Array<Pick<User, "id" | "firstName" | "lastName" | "username" | "avatarUrl">>>([]);
  const [sidebarSearching, setSidebarSearching] = useState(false);
  // ...and past your own rooms: public channels and groups anyone can join.
  const [sidebarPublicRooms, setSidebarPublicRooms] = useState<Array<{
    id: string;
    type: ChatRoom["type"];
    name: string | null;
    description: string | null;
    avatarUrl: string | null;
    slug: string | null;
    publicId: number;
    memberCount: number;
  }>>([]);
  const [joiningRoom, setJoiningRoom] = useState<string | null>(null);
  // A public channel opens read-only first, with a Join button — clicking a
  // search result used to enrol you on the spot, with nothing to confirm and
  // no way to look before committing.
  const [previewRoom, setPreviewRoom] = useState<{
    id: string; type: ChatRoom["type"]; name: string | null; description: string | null;
    avatarUrl: string | null; slug: string | null; publicId: number; memberCount: number;
  } | null>(null);
  const [openingDirect, setOpeningDirect] = useState<string | null>(null);
  const [workspaceInviteOpen, setWorkspaceInviteOpen] = useState(false);
  const [invitingWorkspace, setInvitingWorkspace] = useState(false);
  const [roomInfoOpen, setRoomInfoOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [roomSettingsName, setRoomSettingsName] = useState("");
  const [roomSettingsDescription, setRoomSettingsDescription] = useState("");
  const [roomSettingsSlug, setRoomSettingsSlug] = useState("");
  const [roomSettingsScope, setRoomSettingsScope] = useState<"public" | "private">("private");
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [viewersOpen, setViewersOpen] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Array<{ id: string; firstName: string; lastName: string; username: string | null; avatarUrl: string | null; viewedAt: string }> | null>(null);
  const [roomSettingsAvatar, setRoomSettingsAvatar] = useState<string | null>(null);
  const [roomSettingsBackground, setRoomSettingsBackground] = useState<string | null>(null);
  const [savingRoomSettings, setSavingRoomSettings] = useState(false);
  const [uploadingRoomAvatar, setUploadingRoomAvatar] = useState(false);
  const [uploadingRoomBackground, setUploadingRoomBackground] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"members" | "media" | "files" | "links" | "music" | "voice">("members");
  /** A shared-content list opened from the info panel (Telegram's "44 photos" row), or the overview. */
  const [detailsSection, setDetailsSection] = useState<"media" | "files" | "links" | "music" | "voice" | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailMemberSearch, setDetailMemberSearch] = useState("");
  const [detailMemberTotal, setDetailMemberTotal] = useState(0);
  const [detailMembers, setDetailMembers] = useState<Array<{
    id: string;
    publicId: string;
    firstName: string;
    lastName: string;
    username?: string | null;
    avatarUrl?: string | null;
    lastSeen?: string | null;
    role: string
  }>>([]);
  const [sharedItems, setSharedItems] = useState<Array<{
    id?: string;
    messageId: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    storageUrl?: string;
    content?: string;
    url?: string[] | string;
    username?: string;
    createdAt: string
  }>>([]);
  const [mediaPreview, setMediaPreview] = useState<{ url: string; name: string } | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<ChatMessage | null>(null);
  const [forwarding, setForwarding] = useState(false);
  const [roomInvites, setRoomInvites] = useState<RoomInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const catalogNav = useRef<HTMLElement>(null);
  const [catalogIndicator, setCatalogIndicator] = useState({ left: 0, width: 0 });
  const messagesEnd = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const shouldStickToMessageBottom = useRef(true);
  /** Set while the socket is down, so the next connect knows it is a reconnect. */
  const socketWasDown = useRef(false);
  const aiMessageList = useRef<HTMLDivElement>(null);
  const aiShouldScroll = useRef(false);
  const preserveMessageScroll = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const richMessageInput = useRef<RichMessageInputHandle>(null);
  const roomAvatarInput = useRef<HTMLInputElement>(null);
  const roomBackgroundInput = useRef<HTMLInputElement>(null);
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

  // ── Message menu (Telegram-style: opens where you clicked, stays inside the
  // conversation pane, closes on any outside click, Escape or scroll) ──
  const menuMessage = activeMenu ? messages.find((message) => message.id === activeMenu) ?? null : null;
  function openMessageMenu(messageId: string, clientX: number, clientY: number) {
    const pane = conversationRef.current?.getBoundingClientRect();
    setMenuAt({ x: clientX - (pane?.left ?? 0), y: clientY - (pane?.top ?? 0) });
    setActiveMenu(messageId);
  }
  const closeMessageMenu = useCallback(() => setActiveMenu(null), []);
  useOutsideClose(menuRef, Boolean(menuMessage), closeMessageMenu);
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const pane = conversationRef.current;
    if (!menu || !pane || !menuAt) return;
    const margin = 8;
    const maxX = pane.clientWidth - menu.offsetWidth - margin;
    const maxY = pane.clientHeight - menu.offsetHeight - margin;
    // Open downward and to the right of the point, flipping when it would
    // leave the pane — the menu never crosses the header or the composer.
    let x = menuAt.x;
    let y = menuAt.y;
    if (x > maxX) x = Math.max(margin, menuAt.x - menu.offsetWidth);
    if (y > maxY) y = Math.max(margin, menuAt.y - menu.offsetHeight);
    x = Math.min(Math.max(margin, x), Math.max(margin, maxX));
    y = Math.min(Math.max(margin, y), Math.max(margin, maxY));
    if (x !== menuAt.x || y !== menuAt.y) setMenuAt({ x, y });
  }, [menuAt, menuMessage]);

  // ── Pinned messages ──
  const canPin = (room: ChatRoom | null) =>
    Boolean(room) && (room!.type === "direct" || room!.createdById === user?.id || ["owner", "admin", "moderator"].includes(room!.myRole ?? ""));
  const pinnedMessage = pinned[Math.min(pinnedIndex, pinned.length - 1)] ?? null;
  const loadPins = useCallback((roomId: string) => {
    api.chat.pins(roomId)
      .then((items) => { setPinned(items); setPinnedIndex(0); })
      .catch(() => setPinned([]));
  }, []);
  useEffect(() => {
    setPinned([]);
    setPinnedIndex(0);
    if (selectedId && selectedRoom?.memberStatus !== "pending") loadPins(selectedId);
  }, [selectedId, selectedRoom?.memberStatus, loadPins]);
  async function togglePin(message: ChatMessage) {
    setActiveMenu(null);
    try {
      if (message.isPinned) await api.chat.unpin(message.id);
      else await api.chat.pin(message.id);
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.pinFailed"), "error");
    }
  }
  /** Telegram's pinned bar: tap scrolls to the pin shown, then moves on to the next older one. */
  function jumpToPinned() {
    if (!pinnedMessage) return;
    document.getElementById(`message-${pinnedMessage.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setPinnedIndex((index) => (index + 1) % Math.max(1, pinned.length));
  }
  function previewOf(message: ChatMessage) {
    if (message.content) return message.content;
    const file = message.attachments?.[0];
    return file ? file.fileName : t("chat.repliedMessageFallback");
  }
  const contextRoom = rooms.find((room) => room.id === roomContext?.roomId) || null;

  function formatTime(value: string) {
    return new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function formatDay(value: string) {
    const date = new Date(value);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return t("chat.today");
    return new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", { day: "numeric", month: "long" }).format(date);
  }

  function formatCallDuration(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const memberMap = useMemo(() => {
    const result = new Map<string, Pick<User, "id" | "firstName" | "lastName" | "username" | "avatarUrl" | "publicId">>();
    members.forEach((member) => result.set(member.userId, memberUser(member, t)));
    rooms.flatMap((room) => room.memberProfiles || []).forEach((profile) => result.set(profile.id, profile));
    globalUsers.forEach((profile) => result.set(profile.id, profile));
    sidebarUsers.forEach((profile) => result.set(profile.id, profile));
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, rooms, globalUsers, sidebarUsers]);
  const memberMapRef = useRef(memberMap);
  useEffect(() => {
    memberMapRef.current = memberMap;
  }, [memberMap]);
  const detailPeer = selectedRoom?.type === "direct"
    ? selectedRoom.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id) || null
    : null;
  const peerPresence = usePresence(detailPeer?.id);
  const sectionLabel = (kind: "media" | "files" | "links" | "music" | "voice") => ({
    media: t("chat.mediaTab"), files: t("chat.filesTab"), links: t("chat.linksTab"), music: t("chat.musicTab"), voice: t("chat.voiceTab"),
  })[kind];
  const roomLink = (room: ChatRoom) =>
    `${window.location.origin}/${room.type === "channel" ? "ch" : "g"}/${encodeURIComponent(room.slug || String(room.publicId))}`;
  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      show(t("chat.copied"));
    } catch {
      show(text);
    }
  }

  useEffect(() => {
    setUnreadTotal(rooms.reduce((sum, room) => sum + room.unreadCount, 0));
  }, [rooms]);

  useEffect(() => {
    const socket = getSocket();
    const incoming = (data: {
      meetingId: string;
      roomId: string;
      fromUserId: string;
      kind: "audio" | "video"
    }) => setDirectCall({
      meetingId: data.meetingId,
      roomId: data.roomId,
      peerId: data.fromUserId,
      kind: data.kind,
      phase: "incoming"
    });
    const accepted = (data: {
      meetingId: string
    }) => setDirectCall((current) => current?.meetingId === data.meetingId ? { ...current, phase: "active" } : current);
    const closed = (data: {
      meetingId: string
    }) => setDirectCall((current) => current?.meetingId === data.meetingId ? null : current);
    socket.on("call:incoming", incoming);
    socket.on("call:accepted", accepted);
    socket.on("call:declined", closed);
    socket.on("call:ended", closed);
    return () => {
      socket.off("call:incoming", incoming);
      socket.off("call:accepted", accepted);
      socket.off("call:declined", closed);
      socket.off("call:ended", closed);
    };
  }, []);

  useEffect(() => {
    if (location !== "/chat" || (!selectedRoom && !aiOpen)) return;
    const anyModalOpen = detailsOpen || roomSettingsOpen || createOpen || workspaceInviteOpen || roomInfoOpen || Boolean(forwardingMessage) || Boolean(mediaPreview);
    if (anyModalOpen) return;

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Escape backs out of the open conversation (personal or group) to
      // the room list, like Telegram - it never leaves the /chat route or
      // minimizes the widget on its own.
      if (aiOpen) {
        setAiOpen(false);
        window.history.replaceState({}, "", "/chat");
      } else setSelectedId(null);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [location, selectedRoom, aiOpen, detailsOpen, roomSettingsOpen, createOpen, workspaceInviteOpen, roomInfoOpen, forwardingMessage, mediaPreview]);

  useEffect(() => {
    if (!miniResizing) return;

    function onMove(event: globalThis.PointerEvent) {
      const s = miniResizeStart.current;
      const dx = event.clientX - s.x;
      const dy = event.clientY - s.y;
      const maxWidth = window.innerWidth - 20;
      const maxHeight = window.innerHeight - 20;
      if (s.dir.includes("w")) {
        const newWidth = Math.min(maxWidth, Math.max(280, s.width - dx));
        setMiniWidth(newWidth);
        setMiniPos((current) => ({ ...current, x: s.posX + s.width - newWidth }));
      } else if (s.dir.includes("e")) {
        setMiniWidth(Math.min(maxWidth, Math.max(280, s.width + dx)));
      }
      if (s.dir.includes("n")) {
        const newHeight = Math.min(maxHeight, Math.max(260, s.height - dy));
        setMiniHeight(newHeight);
        setMiniPos((current) => ({ ...current, y: s.posY + s.height - newHeight }));
      } else if (s.dir.includes("s")) {
        setMiniHeight(Math.min(maxHeight, Math.max(260, s.height + dy)));
      }
    }

    function onUp() {
      setMiniResizing(false);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [miniResizing]);

  useEffect(() => {
    if (!miniDragging) return;

    function onMove(event: globalThis.PointerEvent) {
      const s = miniDragStart.current;
      const x = Math.min(window.innerWidth - 80, Math.max(-miniWidth + 80, s.posX + (event.clientX - s.x)));
      const y = Math.min(window.innerHeight - 60, Math.max(0, s.posY + (event.clientY - s.y)));
      setMiniPos({ x, y });
    }

    function onUp() {
      setMiniDragging(false);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [miniDragging, miniWidth]);

  function startMiniDrag(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    miniDragStart.current = { x: event.clientX, y: event.clientY, posX: miniPos.x, posY: miniPos.y };
    setMiniDragging(true);
  }

  function startMiniResize(dir: string) {
    return (event: MouseEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      miniResizeStart.current = {
        x: event.clientX,
        y: event.clientY,
        width: miniWidth,
        height: miniHeight,
        posX: miniPos.x,
        posY: miniPos.y,
        dir
      };
      setMiniResizing(true);
    };
  }

  function roomTitle(room: ChatRoom) {
    if (room.name) return room.name;
    if (room.type === "direct") {
      const other = room.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id);
      return other ? `${other.firstName} ${other.lastName}`.trim() : t("chat.personalChatLabel");
    }
    return t("chat.unnamedGroup");
  }

  /** The public route for a room — /u/<username-or-publicId>, /g/<slug-or-publicId>,
   *  /ch/<slug-or-publicId>. Never the internal UUID (see chat route redesign). */
  function canonicalRoute(room: ChatRoom): string {
    if (room.type === "direct") {
      const other = room.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id);
      const identifier = other?.username || (other?.publicId != null ? String(other.publicId) : null);
      return identifier ? `/u/${identifier}` : `/chat?room=${room.id}`;
    }
    const identifier = room.slug || (room.publicId != null ? String(room.publicId) : null);
    if (!identifier) return `/chat?room=${room.id}`;
    return room.type === "channel" ? `/ch/${identifier}` : `/g/${identifier}`;
  }

  function chooseRoom(id: string, options?: { silent?: boolean }) {
    setAiOpen(false);
    setSelectedId(id);
    setRooms((current) => current.map((room) => room.id === id ? { ...room, unreadCount: 0 } : room));
    if (options?.silent) return;
    // A real navigate() (not replaceState) so the browser Back/Forward
    // buttons move between rooms too - the old query-param scheme only ever
    // wrote history, it never let the browser walk it.
    const room = rooms.find((entry) => entry.id === id);
    navigate(room ? canonicalRoute(room) : `/chat?room=${id}`);
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
    const userMessage: AiConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: prompt,
      createdAt: new Date().toISOString()
    };
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
      const completed = [...next, {
        id: crypto.randomUUID(),
        role: "model" as const,
        text: result.reply,
        createdAt: new Date().toISOString(),
        sources: result.sources
      }].slice(-40);
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
    setRoomContext({
      roomId: room.id,
      x: Math.min(event.clientX, window.innerWidth - 250),
      y: Math.min(event.clientY, window.innerHeight - 280)
    });
  }

  async function deleteSelectedRoom() {
    if (!selectedRoom || selectedRoom.isSystem || selectedRoom.type === "direct") return;
    if (!(await confirm({
      title: t("chat.deleteGroup"),
      description: t("chat.deleteGroupConfirm", { title: roomTitle(selectedRoom) }),
      confirmLabel: t("common.delete")
    }))) return;
    try {
      await api.chat.deleteRoom(selectedRoom.id);
      const remaining = rooms.filter((room) => room.id !== selectedRoom.id);
      setRooms(remaining);
      setHeaderMenuOpen(false);
      if (remaining[0]) chooseRoom(remaining[0].id);
      else {
        setSelectedId(null);
        navigate("/chat");
      }
      show(t("chat.groupDeleted"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.groupDeleteFailed"), "error");
    }
  }

  /** Drops a room from the sidebar after a delete/leave, moving off it if it was open. */
  function forgetRoom(roomId: string) {
    const remaining = rooms.filter((item) => item.id !== roomId);
    setRooms(remaining);
    setRoomContext(null);
    if (selectedId !== roomId) return;
    if (remaining[0]) chooseRoom(remaining[0].id);
    else {
      setSelectedId(null);
      navigate("/chat");
    }
  }

  async function deleteRoomFromContext(room: ChatRoom) {
    // A DM is deleted (there's no one to leave it to); a group is left.
    const isDirect = room.type === "direct";
    if (!(await confirm({
      title: t(isDirect ? "chat.deleteChat" : "chat.deleteGroup"),
      description: t(isDirect ? "chat.deleteChatConfirm" : "chat.deleteGroupConfirm", { title: roomTitle(room) }),
      confirmLabel: t("common.delete")
    }))) return;
    try {
      await api.chat.deleteRoom(room.id);
      forgetRoom(room.id);
      show(t(isDirect ? "chat.chatDeleted" : "chat.groupDeleted"));
    } catch (error) {
      show(error instanceof Error ? error.message : t(isDirect ? "chat.chatDeleteFailed" : "chat.groupDeleteFailed"), "error");
    }
  }

  async function leaveRoomFromContext(room: ChatRoom) {
    const leaveLabel = t(room.type === "channel" ? "chat.leaveChannel" : "chat.leaveGroup");
    if (!(await confirm({
      title: leaveLabel,
      description: t("chat.leaveGroupConfirm", { title: roomTitle(room) }),
      confirmLabel: leaveLabel
    }))) return;
    try {
      await api.chat.leaveRoom(room.id);
      forgetRoom(room.id);
      show(t("chat.groupLeft"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.groupLeaveFailed"), "error");
    }
  }

  async function loadRooms(preferredId?: string, options?: { keepSelection?: boolean }) {
    if (!workspace) return;
    const [nextRooms, nextMembers, community] = await Promise.all([api.chat.rooms(), api.groups.members(workspace.id), api.chat.community()]);
    const systemRooms = [community.channel, community.group].filter(Boolean).map((room) => ({
      ...room!, memberIds: room!.memberIds || [], memberProfiles: room!.memberProfiles || [],
      unreadCount: room!.unreadCount || 0, memberCount: room!.memberCount || 0,
      isReadOnly: room!.isReadOnly || false, memberStatus: "active" as const
    }));
    const mergedRooms = [...systemRooms, ...nextRooms.filter((room) => !systemRooms.some((system) => system.id === room.id))];
    setRooms(mergedRooms);
    setMembers(nextMembers);
    const target = preferredId || selectedId;
    if (target && mergedRooms.some((room) => room.id === target)) setSelectedId(target);
    // A background refresh (e.g. a DM that just arrived) must never yank the
    // user into another conversation.
    else if (options?.keepSelection) setSelectedId(null);
      // A pending routeTarget (deep link, e.g. /g/backend-team) resolves and picks its own
    // room shortly after - don't let the "open the first room" fallback race ahead of it.
    //
    // `location === "/chat"` is what keeps this from hijacking the app. This
    // component is mounted everywhere (App.tsx keeps one instance alive so a
    // call or a conversation survives navigation), so loadRooms runs on every
    // page load — and chooseRoom() navigates. The effect was that refreshing
    // the dashboard, a meeting, or anything else bounced the user into
    // whichever conversation happened to be first. `silent` for the same
    // reason in the other direction: someone who reloads /chat should land
    // back on /chat, not be redirected to /g/<slug> by a background fetch.
    else if (!routeTarget && location === "/chat" && mergedRooms[0] && window.innerWidth > 820)
      chooseRoom(mergedRooms[0].id, { silent: true });
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

  // Resolves a deep-link route (/u/:id, /g/:slug-or-publicId, /ch/:slug-or-publicId) to
  // its internal room id - the one place a public route ever turns into a UUID.
  useEffect(() => {
    if (!routeTarget || !workspace) return;
    const matchesCurrent = selectedRoom && (routeTarget.type === "direct"
      ? selectedRoom.type === "direct" && (() => {
      const other = selectedRoom.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id);
      return other?.username === routeTarget.identifier || (other?.publicId != null && String(other.publicId) === routeTarget.identifier);
    })()
      : selectedRoom.slug === routeTarget.identifier || (selectedRoom.publicId != null && String(selectedRoom.publicId) === routeTarget.identifier));
    if (matchesCurrent) return;

    let cancelled = false;
    (async () => {
      try {
        const result = await api.chat.resolveRoute(workspace.id, routeTarget.type, routeTarget.identifier);
        if (cancelled) return;
        if ("redirectSlug" in result) {
          navigate(`${routeTarget.type === "channel" ? "/ch" : "/g"}/${result.redirectSlug}`, { replace: true });
          return;
        }
        setSelectedId(result.roomId);
        if (!rooms.some((room) => room.id === result.roomId)) await loadRooms(result.roomId);
      } catch (error) {
        if (cancelled) return;
        show(error instanceof Error ? error.message : t("chat.roomNotFound"), "error");
        navigate("/chat", { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeTarget?.type, routeTarget?.identifier, workspace?.id]);

  useEffect(() => {
    shouldStickToMessageBottom.current = true;
    if (!selectedId) {
      setMessages([]);
      setReadReceipts(new Map());
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
    // Other members' read positions - fetched fresh on open (not just live socket
    // events) so "read" checkmarks survive a reload instead of resetting to unread.
    api.chat.readReceipts(selectedId)
      .then((rows) => setReadReceipts(new Map(rows.map((row) => [row.userId, row.lastReadSeq]))))
      .catch(() => setReadReceipts(new Map()));
  }, [selectedId, selectedRoom?.memberStatus, show]);

  async function loadOlderMessages() {
    if (!selectedId || loadingMessages || loadingOlderMessages || !hasOlderMessages) return;
    const oldestSequence = messages.find((message) => typeof message.sequence === "number")?.sequence;
    if (!oldestSequence) {
      setHasOlderMessages(false);
      return;
    }
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
    initPresence();
    const onConnect = () => {
      setConnected(true);
      if (socketWasDown.current) {
        // Back from an outage: key requests and room changes may have been
        // missed. Refetching the list re-opens previews against fresh key
        // state, which also serves keys owed to members' new devices.
        socketWasDown.current = false;
        invalidateAllRooms();
        void loadRooms(undefined, { keepSelection: true }).catch(() => undefined);
        // Messages broadcast while this socket was down never arrive over it:
        // fetch the open room's latest page and merge it in, or they'd stay
        // missing from the conversation until a reload.
        if (selectedId && selectedRoom?.memberStatus !== "pending") {
          const roomId = selectedId;
          void api.chat.messages(roomId).then((result) => {
            setMessages((current) => {
              if (current.length && current[0].roomId !== roomId) return current;
              const known = new Set(current.map((message) => message.id));
              const missed = result.data.filter((message) => !known.has(message.id));
              if (!missed.length) return current;
              // A send still showing as optimistic may be among them: the copy
              // from the server replaces it.
              const echoed = new Set(missed.map((message) => message.clientMessageId).filter(Boolean));
              const withoutEchoed = current.filter((item) => !(item.id.startsWith("optimistic:") && echoed.has(item.clientMessageId)));
              return [...withoutEchoed, ...missed].sort((a, b) => (a.sequence || +new Date(a.createdAt)) - (b.sequence || +new Date(b.createdAt)));
            });
          }).catch(() => undefined);
        }
      }
      socket.emit("join_group", { groupId: workspace.id });
      if (selectedId && selectedRoom?.memberStatus !== "pending") socket.emit("join_room", { roomId: selectedId });
    };
    const onDisconnect = () => {
      setConnected(false);
      socketWasDown.current = true;
    };
    // E2EE messages arrive as ciphertext; open them before they reach state.
    const onMessage = (incoming: ChatMessage) => {
      void decryptMessage(incoming).then(handleMessage);
    };
    const handleMessage = (message: ChatMessage) => {
      if (message.roomId !== selectedId) {
        // First message of a DM somebody just opened with us: the room isn't in
        // our list yet, so patching `rooms` would silently drop it. Pull the
        // list instead so the conversation appears without a reload.
        if (!roomsRef.current.some((room) => room.id === message.roomId)) {
          void loadRooms(undefined, { keepSelection: true }).catch(() => undefined);
          return;
        }
        setRooms((current) => current.map((room) => room.id === message.roomId ? {
          ...room,
          unreadCount: message.senderId === user?.id ? room.unreadCount : room.unreadCount + 1,
          lastMessage: {
            id: message.id,
            content: message.content,
            senderId: message.senderId,
            createdAt: message.createdAt
          }
        } : room));
        if (message.senderId !== user?.id) {
          const room = roomsRef.current.find((entry) => entry.id === message.roomId);
          if (room && !room.isMuted) {
            const sender = message.sender || memberMapRef.current.get(message.senderId);
            const senderName = sender ? `${sender.firstName} ${sender.lastName}`.trim() : t("chat.userFallback");
            const title = room.type === "direct" ? senderName : `${senderName} · ${room.name || t("chat.unnamedGroup")}`;
            const preview = message.content || (message.attachments?.length ? t("chat.mediaMessageFallback") : "");
            setMessageToasts((current) => [...current.filter((item) => item.id !== message.id), {
              id: message.id,
              roomId: message.roomId,
              title,
              preview,
              avatarUrl: sender?.avatarUrl,
              senderFirstName: sender?.firstName,
              senderLastName: sender?.lastName
            }].slice(-4));
            window.setTimeout(() => setMessageToasts((current) => current.filter((item) => item.id !== message.id)), 6000);
          }
        }
        return;
      }
      setMessages((current) => {
        if (message.clientMessageId && current.some((item) => item.clientMessageId === message.clientMessageId)) {
          return current.map((item) => item.clientMessageId === message.clientMessageId ? {
            ...message,
            content: message.content || item.content,
            attachments: message.attachments?.length ? message.attachments : item.attachments
          } : item);
        }
        return current.some((item) => item.id === message.id) ? current : [...current, message];
      });
    };
    const onTyping = (data: { roomId: string; userId: string; typing: boolean }) => {
      if (data.roomId !== selectedId || data.userId === user?.id) return;
      setTypingUsers((current) => data.typing ? [...new Set([...current, data.userId])] : current.filter((id) => id !== data.userId));
    };
    const onReaction = (data: {
      roomId: string;
      messageId: string;
      emoji: string;
      userId: string;
      action: "added" | "removed"
    }) => {
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
      // Stale-room-key rejections are retried silently by sendWithE2ee, and so
      // is a send over the rate limit (it waits and goes out a moment later).
      if (data?.code?.startsWith("E2EE_") || data?.code === "RATE_LIMIT_EXCEEDED") return;
      if (data?.code) show(data.message || "Real-time xatolik", "error");
    };
    const onMessageRead = (data: { roomId: string; userId: string; lastReadSeq?: number }) => {
      if (data.roomId !== selectedId || data.userId === user?.id || typeof data.lastReadSeq !== "number") return;
      setReadReceipts((current) => {
        if ((current.get(data.userId) ?? 0) >= data.lastReadSeq!) return current;
        return new Map(current).set(data.userId, data.lastReadSeq!);
      });
    };
    /**
     * The REST paths below used to change state without telling anyone: an
     * edit, a delete or an un-react was visible only to whoever did it until
     * the other side reloaded. The server now emits for all of them.
     */
    const onMessageUpdated = async (data: { roomId: string; messageId: string; senderId: string; content: string | null; e2ee?: E2eeEnvelope | null; editedAt: string }) => {
      if (data.roomId !== selectedId) return;
      const content = data.e2ee
        ? (await decryptEnvelope(data.roomId, data.senderId, data.e2ee)) ?? UNDECRYPTABLE_TEXT
        : data.content ?? "";
      setMessages((current) => current.map((item) => item.id === data.messageId
        ? { ...item, content, isEdited: true, editedAt: data.editedAt }
        : item));
    };
    // Another member device published a new room key.
    const onRoomKeyRotated = (data: { roomId: string }) => invalidateRoom(data.roomId);
    const onMessagePinned = (data: { roomId: string; messageId: string; pinned: boolean }) => {
      if (data.roomId !== selectedId) return;
      setMessages((current) => current.map((message) => message.id === data.messageId ? { ...message, isPinned: data.pinned } : message));
      loadPins(data.roomId);
    };
    const onRoomKeysRequested = (data: { roomId: string }) => serveRoomKeys(data.roomId);
    // Keys for messages this device couldn't open were just shared with it.
    const onRoomKeysShared = (data: { roomId: string }) => {
      invalidateRoom(data.roomId);
      void loadRooms(undefined, { keepSelection: true });
      if (data.roomId !== selectedId) return;
      setMessages((current) => {
        const locked = current.filter((message) => message.e2eeFailed);
        if (locked.length) {
          void decryptMessages(locked).then((opened) => {
            const byId = new Map(opened.filter((message) => !message.e2eeFailed).map((message) => [message.id, message]));
            if (byId.size) setMessages((latest) => latest.map((message) => byId.get(message.id) ?? message));
          });
        }
        return current;
      });
    };
    const onMessageDeleted = (data: { roomId: string; messageId: string }) => {
      if (data.roomId !== selectedId) return;
      setMessages((current) => current.filter((item) => item.id !== data.messageId));
    };
    // Membership, roles and room rules can all change under an open client —
    // reload the room list so myRole, the composer and the settings menu match
    // what the server now believes.
    const onRoomChanged = (data: { roomId: string }) => {
      // Members (and so the devices a room key must reach) may have changed.
      if (data.roomId) invalidateRoom(data.roomId);
      if (data.roomId && data.roomId !== selectedId && !rooms.some((room) => room.id === data.roomId)) {
        void loadRooms();
        return;
      }
      void loadRooms();
    };
    const onRoomCreated = () => void loadRooms();
    const onViewsUpdated = (data: { messageIds: string[] }) => {
      if (!selectedId) return;
      const affected = new Set(data.messageIds);
      setMessages((current) => current.some((item) => affected.has(item.id))
        ? current.map((item) => affected.has(item.id) ? { ...item, viewCount: (item.viewCount ?? 0) + 1 } : item)
        : current);
    };
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("new_message", onMessage);
    socket.on("typing", onTyping);
    socket.on("reaction_updated", onReaction);
    socket.on("message_read", onMessageRead);
    socket.on("error", onError);
    socket.on("message_updated", onMessageUpdated);
    socket.on("message_deleted", onMessageDeleted);
    socket.on("room_member_changed", onRoomChanged);
    socket.on("room_settings_updated", onRoomChanged);
    socket.on("room_created", onRoomCreated);
    socket.on("message_views_updated", onViewsUpdated);
    socket.on("room_key_rotated", onRoomKeyRotated);
    socket.on("room_keys_requested", onRoomKeysRequested);
    socket.on("message_pinned", onMessagePinned);
    socket.on("room_keys_shared", onRoomKeysShared);
    if (socket.connected) onConnect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("new_message", onMessage);
      socket.off("typing", onTyping);
      socket.off("reaction_updated", onReaction);
      socket.off("message_read", onMessageRead);
      socket.off("error", onError);
      socket.off("message_updated", onMessageUpdated);
      socket.off("message_deleted", onMessageDeleted);
      socket.off("room_member_changed", onRoomChanged);
      socket.off("room_settings_updated", onRoomChanged);
      socket.off("room_created", onRoomCreated);
      socket.off("message_views_updated", onViewsUpdated);
      socket.off("room_key_rotated", onRoomKeyRotated);
      socket.off("room_keys_requested", onRoomKeysRequested);
      socket.off("message_pinned", onMessagePinned);
      socket.off("room_keys_shared", onRoomKeysShared);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!shouldStickToMessageBottom.current) return;
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
      ? api.chat.roomMembers(selectedId, detailMemberSearch.trim()).then((result) => {
        setDetailMembers(result.items);
        setDetailMemberTotal(result.total);
        setSharedItems([]);
      })
      : api.chat.shared(selectedId, detailsTab).then((items) => {
        setSharedItems(items);
        setDetailMembers([]);
      });
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
      api.users.search(query)
        .then((result) => setGlobalUsers(result.data.filter((entry) => entry.id !== user?.id)))
        .catch((error) => show(error instanceof Error ? error.message : t("chat.usersNotFound"), "error"))
        .finally(() => setSearchingUsers(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [createMode, createOpen, memberSearch, show, user?.id]);

  // The sidebar box searches people as well as rooms (Telegram behaviour) —
  // typing a name that has no conversation yet still surfaces the user, and
  // picking them opens/creates the DM.
  useEffect(() => {
    const query = search.trim();
    if (query.length < 2 || catalog === "bot") {
      setSidebarUsers([]);
      setSidebarPublicRooms([]);
      setSidebarSearching(false);
      return;
    }
    setSidebarSearching(true);
    const timer = window.setTimeout(() => {
      // People and joinable channels/groups are two independent lookups —
      // neither should be able to blank out the other by failing.
      void Promise.allSettled([
        api.users.search(query).then((result) => setSidebarUsers(result.data.filter((entry) => entry.id !== user?.id)), () => setSidebarUsers([])),
        api.chat.discover(query).then(setSidebarPublicRooms, () => setSidebarPublicRooms([])),
      ]).finally(() => setSidebarSearching(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [search, catalog, user?.id]);

  /**
   * Join a public channel/group straight from search and open it. Membership
   * is the permission everywhere else in chat, so joining is the whole step —
   * there is nothing to approve.
   */
  async function joinPublicRoom(roomId: string) {
    if (joiningRoom) return;
    setJoiningRoom(roomId);
    try {
      const room = await api.chat.joinRoom(roomId);
      await loadRooms(room.id);
      setPreviewRoom(null);
      setSearch("");
      setAiOpen(false);
      setSelectedId(room.id);
      navigate(canonicalRoute(room));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.joinRoomFailed"), "error");
    } finally {
      setJoiningRoom(null);
    }
  }

  async function openDirectWith(targetUserId: string) {
    if (!workspace || openingDirect) return;
    const existing = rooms.find((room) => room.type === "direct" && room.memberIds.includes(targetUserId));
    if (existing) {
      setSearch("");
      chooseRoom(existing.id);
      return;
    }
    setOpeningDirect(targetUserId);
    try {
      const room = await api.chat.createRoom({ type: "direct", targetUserId });
      await loadRooms(room.id);
      setSearch("");
      setAiOpen(false);
      setSelectedId(room.id);
      // `rooms` is still the pre-load snapshot in this closure, so the route is
      // built from the freshly returned room rather than via chooseRoom().
      navigate(canonicalRoute(room));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.conversationCreateFailed"), "error");
    } finally {
      setOpeningDirect(null);
    }
  }

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
    const stagedReady = staged.filter((item) => item.attachment);
    const attachments = stagedReady.map((item) => item.attachment!);
    // A message needs either words or files. Staging means "send" is now the
    // only thing that publishes, so an empty draft with pending files must
    // still go through rather than being treated as an empty message.
    if ((!content && attachments.length === 0) || !selectedRoom) return;
    if (staged.some((item) => !item.attachment && !item.error)) return; // still uploading
    if (/^\/ai(?:\s|$)/i.test(content)) {
      await runComposerAi();
      return;
    }
    if (editing) {
      try {
        // An E2EE message's file keys live in its envelope, so they go back in.
        const keptFiles: OutgoingAttachment[] = (editing.attachments ?? [])
          .filter((item) => item.secret)
          .map((item) => ({ storageKey: "", storageUrl: item.sourceUrl ?? "", fileName: item.fileName, fileSize: item.fileSize, mimeType: item.mimeType, secret: item.secret }));
        const updated = await api.chat.editMessage(editing.id, content, editing.roomId, keptFiles);
        setMessages((current) => current.map((item) => item.id === editing.id ? updated : item));
        setDraft("");
        setEditing(null);
      } catch (error) {
        show(error instanceof Error ? error.message : t("chat.editMessageFailed"), "error");
      }
      return;
    }
    setDraft("");
    setStaged([]);
    shouldStickToMessageBottom.current = true;
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
      // Encrypted uploads are opaque blobs, so the bubble shows the real name
      // and the local preview until the server echo is decrypted.
      attachments: attachments.map((attachment, index) => ({
        id: `optimistic-attachment:${index}`,
        fileName: attachment.secret?.n ?? attachment.fileName,
        fileSize: attachment.secret?.s ?? attachment.fileSize,
        mimeType: attachment.secret?.m ?? attachment.mimeType,
        url: attachment.secret ? stagedReady[index].previewUrl ?? "" : attachment.storageUrl
      }))
    };
    setMessages((current) => [...current, optimistic]);
    const socket = getSocket();
    socket.emit("typing", { roomId: selectedRoom.id, typing: false });
    try {
      if (socket.connected) {
        // DMs and private rooms: encrypted on this device (lib/e2ee.ts), and
        // re-keyed + re-encrypted if the server says the room key is stale.
        await sendWithE2ee(selectedRoom.id, content, (body) => emitWithAck("send_message", {
          roomId: selectedRoom.id,
          text: body.content,
          e2ee: body.e2ee,
          mentions: body.mentions,
          clientMessageId,
          attachments: body.attachments,
          replyToId: replyingTo?.id
        }), attachments);
      } else {
        const saved = await api.chat.send(selectedRoom.id, content, clientMessageId, replyingTo?.id, attachments);
        setMessages((current) => current.map((item) => item.clientMessageId === clientMessageId ? saved : item));
      }
    } catch (socketError) {
      try {
        // A refusal (ban, slow mode, …) would be refused over REST too.
        if (isServerRejection(socketError)) throw socketError;
        const saved = await api.chat.send(selectedRoom.id, content, clientMessageId, replyingTo?.id, attachments);
        setMessages((current) => current.map((item) => item.clientMessageId === clientMessageId ? saved : item));
      } catch (error) {
        setMessages((current) => current.filter((item) => item.clientMessageId !== clientMessageId));
        setDraft(content);
        // Put the files back in the composer rather than making the user pick
        // and re-upload them all after a failed send.
        setStaged(staged);
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

  /**
   * Uploads files and parks them in the composer instead of sending them.
   *
   * Picking a file used to *be* the send: the message left before the user had
   * written a caption, and there was no way to attach a second file to the
   * same message or to change your mind. Now the upload runs immediately (so
   * the wait happens while you're still typing) but publishing waits for the
   * send button, exactly like Telegram.
   */
  async function stageFiles(files: File[]) {
    if (!selectedRoom || files.length === 0) return;

    const room = selectedRoom;
    const free = MAX_ATTACHMENTS - staged.length;
    if (free <= 0) {
      show(t("chat.attachmentLimit", { count: MAX_ATTACHMENTS }), "error");
      return;
    }
    if (files.length > free) show(t("chat.attachmentLimit", { count: MAX_ATTACHMENTS }), "error");

    const accepted = files.slice(0, free).map((file) => ({
      id: crypto.randomUUID(),
      file,
      // Local preview so the thumbnail appears instantly rather than after the
      // round-trip; revoked in the cleanup effect so these don't leak.
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      attachment: null,
      error: false
    } satisfies StagedAttachment));

    setStaged((current) => [...current, ...accepted]);

    await Promise.all(accepted.map(async (item) => {
      try {
        const attachment = await api.chat.uploadChatFile(room.id, item.file);
        setStaged((current) => current.map((entry) => entry.id === item.id ? { ...entry, attachment } : entry));
      } catch (error) {
        setStaged((current) => current.map((entry) => entry.id === item.id ? { ...entry, error: true } : entry));
        show(error instanceof Error ? error.message : t("chat.fileSendFailed"), "error");
      }
    }));
  }

  /**
   * Reports which messages actually reached the screen.
   *
   * IntersectionObserver rather than "everything the timeline rendered": a
   * message scrolled past in a jump was never really seen, and counting it
   * makes the view number meaningless. Ids are batched and flushed on a timer
   * so a fast scroll produces one request rather than one per bubble — the
   * server buffers them again in Redis on the other side.
   */
  useEffect(() => {
    const node = messageList.current;
    if (!node || !selectedId || selectedRoom?.memberStatus === "pending") return;

    const room = selectedId;
    const pending = new Set<string>();
    let timer: number | null = null;

    const flush = () => {
      timer = null;
      if (pending.size === 0) return;
      const batch = [...pending];
      pending.clear();
      // Views are advisory — a failed report costs a count, never the session.
      void api.chat.recordViews(room, batch).catch(() => undefined);
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.messageId;
        // Optimistic rows have no server id yet, and your own message is not
        // something you "view" — the server rejects both anyway.
        if (!id || id.startsWith("optimistic:")) continue;
        pending.add(id);
        observer.unobserve(entry.target);
      }
      if (pending.size > 0 && timer === null) timer = window.setTimeout(flush, 1200);
    }, { root: node, threshold: 0.6 });

    node.querySelectorAll<HTMLElement>("[data-message-id]").forEach((element) => observer.observe(element));

    return () => {
      observer.disconnect();
      if (timer !== null) window.clearTimeout(timer);
      flush();
    };
  }, [selectedId, selectedRoom?.memberStatus, messages.length]);

  // Staged files belong to the room they were picked in. Switching rooms drops
  // them (and their preview URLs) rather than silently carrying a picture into
  // a different conversation on the next send.
  useEffect(() => {
    return () => {
      setStaged((current) => {
        current.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
        return [];
      });
    };
  }, [selectedId]);

  /** The read list for one of your own group messages. */
  async function openViewers(messageId: string) {
    setViewersOpen(messageId);
    setViewers(null);
    try {
      const result = await api.chat.messageViewers(messageId);
      setViewers(result.viewers ?? []);
    } catch (error) {
      setViewersOpen(null);
      show(error instanceof Error ? error.message : t("chat.loadDetailsFailed"), "error");
    }
  }

  function removeStaged(id: string) {
    setStaged((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
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
        maxParticipants: clampParticipants(selectedRoom.memberCount + 2)
      });
      sessionStorage.setItem(`optima:meeting-camera:${meeting.id}`, kind === "video" ? "on" : "off");
      const call = {
        meetingId: meeting.id,
        roomId: selectedRoom.id,
        peerId: detailPeer.id,
        kind,
        phase: "outgoing" as const
      };
      setDirectCall(call);
      getSocket().emit("call:invite", {
        meetingId: call.meetingId,
        roomId: call.roomId,
        targetUserId: call.peerId,
        kind: call.kind
      });
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.callStartFailed"), "error");
      setStartingCall(null);
    }
  }

  function acceptDirectCall() {
    if (!directCall) return;
    sessionStorage.setItem(`optima:meeting-camera:${directCall.meetingId}`, directCall.kind === "video" ? "on" : "off");
    getSocket().emit("call:accept", {
      meetingId: directCall.meetingId,
      roomId: directCall.roomId,
      targetUserId: directCall.peerId,
      kind: directCall.kind
    });
    setDirectCall({ ...directCall, phase: "active" });
  }

  function closeDirectCall() {
    if (!directCall) return;
    getSocket().emit(directCall.phase === "incoming" ? "call:decline" : "call:end", {
      meetingId: directCall.meetingId,
      roomId: directCall.roomId,
      targetUserId: directCall.peerId,
      kind: directCall.kind
    });
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
          await sendWithE2ee(selectedRoom.id, "", (body) => emitWithAck("send_message", {
            roomId: selectedRoom.id,
            e2ee: body.e2ee,
            clientMessageId,
            attachments: body.attachments
          }, 12000), [attachment]);
        } catch (error) {
          if (isServerRejection(error)) throw error;
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
      nextRecorder.ondataavailable = (event) => {
        if (event.data.size) recordingChunks.current.push(event.data);
      };
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
        if (value >= 299) {
          nextRecorder.stop();
          setRecording(false);
          return 300;
        }
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

  async function createConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace) return;
    setCreating(true);
    const data = new FormData(event.currentTarget);
    try {
      // The field is `scope`, not `visibility`: CreateChatRoomDto declares
      // `scope` and the global ValidationPipe runs with forbidNonWhitelisted,
      // so any other name fails the whole request with a 400.
      const room = createMode === "direct"
        ? await api.chat.createRoom({ type: "direct", targetUserId: selectedMembers[0] })
        : await api.chat.createRoom({
          type: createMode,
          scope: createScope,
          name: String(data.get("name") || "").trim(),
          description: String(data.get("description") || "").trim() || undefined,
          memberIds: selectedMembers
        });
      await loadRooms(room.id);
      setCreateOpen(false);
      setSelectedMembers([]);
      setMemberSearch("");
      show(createMode === "direct" ? t("chat.directChatOpened") : createMode === "channel" ? t("chat.channelCreated") : t("chat.groupCreated"));
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
      await api.groups.invite(workspace.id, String(data.get("email") || "").trim(), String(data.get("role") || "junior"));
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
        ...(expiresInHours > 0 ? { expiresInHours } : {})
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
      setRoomInvites((current) => current.map((entry) => entry.id === inviteId ? {
        ...entry,
        isActive: false,
        revokedAt: new Date().toISOString()
      } : entry));
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

  /**
   * Mirrors the server's posting rule (sendMessage in message.service.ts) so
   * the composer is only offered when the send would actually succeed. It used
   * to key off a hardcoded public_id of "777777", which meant every ordinary
   * member of an admins-only channel got a text box, typed a post and was
   * answered with "Only channel admins can publish posts". A channel they
   * can't post in shows Telegram's mute/unmute bar instead.
   */
  /**
   * Whether the caller may change a room's settings — the same rule the server
   * enforces in updateRoomSettings. Also replaces the "publicId === 777777"
   * escape hatch that used to stand in for platform admin: a magic account
   * number nobody can grant or revoke, which handed the rights to whoever
   * happened to land on that sequence value.
   */
  const canAdminister = (room?: ChatRoom | null) =>
    Boolean(room) && (room!.createdById === user?.id || room!.myRole === "owner" || room!.myRole === "admin");

  const canPostIn = (room: ChatRoom) => {
    if (room.isReadOnly) return false;
    if (room.postingMode !== "admins_only") return true;
    return room.myRole === "owner" || room.myRole === "admin";
  };

  async function openDiscussion(messageId: string) {
    try {
      const discussion = await api.chat.discussion(messageId);
      chooseRoom(discussion.roomId);
      window.setTimeout(() => document.getElementById(`message-${discussion.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      }), 400);
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.discussionOpenFailed"), "error");
    }
  }

  async function toggleChannelMute() {
    if (!selectedRoom) return;
    try {
      const result = await api.chat.mute(selectedRoom.id, !selectedRoom.isMuted);
      setRooms((current) => current.map((room) => room.id === selectedRoom.id ? {
        ...room,
        isMuted: result.isMuted
      } : room));
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
    setRoomSettingsBackground(selectedRoom.backgroundUrl || null);
    setRoomSettingsSlug(selectedRoom.slug || "");
    setRoomSettingsScope(selectedRoom.scope === "public" ? "public" : "private");
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

  async function uploadRoomBackground(file?: File) {
    if (!selectedRoom || !file) return;
    if (!file.type.startsWith("image/")) return show(t("chat.imageOnlyError"), "error");
    if (file.size > 8 * 1024 * 1024) return show(t("chat.imageSizeError"), "error");
    setUploadingRoomBackground(true);
    try {
      const uploaded = await api.chat.uploadFile(selectedRoom.id, file);
      const updated = await api.chat.updateRoomBackground(selectedRoom.id, {
        backgroundUrl: uploaded.storageUrl,
        backgroundType: "IMAGE"
      });
      setRoomSettingsBackground(updated.backgroundUrl || uploaded.storageUrl);
      setRooms((current) => current.map((room) => room.id === updated.id ? { ...room, ...updated } : room));
      show(t("chat.chatBackgroundUpdated"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.backgroundUploadFailed"), "error");
    } finally {
      setUploadingRoomBackground(false);
      if (roomBackgroundInput.current) roomBackgroundInput.current.value = "";
    }
  }

  async function removeRoomBackground() {
    if (!selectedRoom) return;
    setUploadingRoomBackground(true);
    try {
      const updated = await api.chat.updateRoomBackground(selectedRoom.id, {
        backgroundUrl: null,
        backgroundType: "DEFAULT"
      });
      setRoomSettingsBackground(null);
      setRooms((current) => current.map((room) => room.id === updated.id ? { ...room, ...updated } : room));
      show(t("chat.chatBackgroundRemoved"));
    } catch (error) {
      show(error instanceof Error ? error.message : t("chat.backgroundUploadFailed"), "error");
    } finally {
      setUploadingRoomBackground(false);
    }
  }

  async function saveRoomSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedRoom || !roomSettingsName.trim()) return;
    setSavingRoomSettings(true);
    try {
      const trimmedSlug = roomSettingsSlug.trim().toLowerCase();
      const updated = await api.chat.updateRoomSettings(selectedRoom.id, {
        name: roomSettingsName.trim(),
        description: roomSettingsDescription.trim(),
        avatarUrl: roomSettingsAvatar,
        // Only send scope for rooms that own their visibility. A
        // workspace_only room's scope is the workspace's business, not this
        // dialog's, so leaving it out keeps that setting untouched.
        ...(selectedRoom.scope !== "workspace_only" ? { scope: roomSettingsScope } : {}),
        ...(trimmedSlug !== (selectedRoom.slug || "") ? { slug: trimmedSlug || null } : {})
      });
      setRooms((current) => current.map((room) => room.id === updated.id ? { ...room, ...updated } : room));
      setRoomSettingsOpen(false);
      show(selectedRoom.type === "channel" ? t("chat.channelSettingsSaved") : t("chat.groupSettingsSaved"));
      if (updated.slug && updated.slug !== selectedRoom.slug) {
        navigate(`${selectedRoom.type === "channel" ? "/ch" : "/g"}/${updated.slug}`, { replace: true });
      }
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
      // Files from an E2EE chat exist here only as decrypted blob: URLs, so
      // they are uploaded again for the target chat — encrypted afresh if that
      // chat is E2EE too, plain if it is public.
      const attachments = await Promise.all((forwardingMessage.attachments ?? []).map(async (attachment): Promise<OutgoingAttachment> => {
        if (attachment.secret) {
          const blob = await (await fetch(attachment.url)).blob();
          return api.chat.uploadChatFile(targetRoomId, new File([blob], attachment.fileName, { type: attachment.mimeType }));
        }
        return {
          storageKey: `forwarded/${attachment.id}`,
          storageUrl: attachment.url,
          fileName: attachment.fileName,
          fileSize: attachment.fileSize,
          mimeType: attachment.mimeType
        };
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
    {
      id: "all" as const,
      label: t("chat.catalogAll"),
      icon: MessagesSquare,
      count: rooms.reduce((sum, room) => sum + room.unreadCount, 0)
    },
    {
      id: "direct" as const,
      label: t("chat.catalogDirect"),
      icon: UserIcon,
      count: rooms.filter((room) => roomCatalog(room) === "direct").reduce((sum, room) => sum + room.unreadCount, 0)
    },
    {
      id: "group" as const,
      label: t("chat.catalogGroups"),
      icon: Users,
      count: rooms.filter((room) => roomCatalog(room) === "group").reduce((sum, room) => sum + room.unreadCount, 0)
    },
    {
      id: "channel" as const,
      label: t("chat.catalogChannels"),
      icon: RadioTower,
      count: rooms.filter((room) => roomCatalog(room) === "channel").reduce((sum, room) => sum + room.unreadCount, 0)
    },
    { id: "bot" as const, label: t("chat.catalogBots"), icon: Bot, count: 0 }
  ];
  useEffect(() => {
    function measure() {
      const nav = catalogNav.current;
      if (!nav) return;
      const index = catalogItems.findIndex((item) => item.id === catalog);
      const button = nav.querySelectorAll("button")[index] as HTMLElement | undefined;
      if (button) setCatalogIndicator({ left: button.offsetLeft, width: button.offsetWidth });
    }

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);
  const filteredRooms = rooms.filter((room) => (catalog === "all" || roomCatalog(room) === catalog) && roomTitle(room).toLowerCase().includes(search.toLowerCase()));
  // Only people you don't already have a visible conversation with — an
  // existing DM is already listed above as a room.
  const sidebarPeople = sidebarUsers.filter((person) => !filteredRooms.some((room) => room.type === "direct" && room.memberIds.includes(person.id)));
  // The server already excludes rooms you belong to; this only honours the
  // catalog tab, so the Channels tab doesn't offer groups and vice versa.
  const sidebarDiscovered = sidebarPublicRooms.filter((room) => catalog === "all" || catalog === room.type);
  const visibleMessages = messageSearch.trim()
    ? messages.filter((message) => `${message.content} ${message.attachments?.map((attachment) => attachment.fileName).join(" ") || ""}`.toLowerCase().includes(messageSearch.trim().toLowerCase()))
    : messages;
  const availableMembers = members.map((member) => memberUser(member, t)).filter((member) => member.id !== user?.id);
  const normalizedMemberSearch = memberSearch.trim().toLowerCase();
  const localCandidates = availableMembers.filter((member) => `${member.firstName} ${member.lastName} ${member.username} ${member.email}`.toLowerCase().includes(normalizedMemberSearch));
  const pickerCandidates = createMode === "direct" && normalizedMemberSearch.length >= 2 ? globalUsers : localCandidates;

  function openMessageToast(toast: { id: string; roomId: string }) {
    setMessageToasts((current) => current.filter((item) => item.id !== toast.id));
    setMinimized(false);
    chooseRoom(toast.roomId);
  }

  const messageToastStack = messageToasts.length > 0 ? (
    <div className="message-toast-stack" aria-live="polite">
      {messageToasts.map((toast) => (
        <button key={toast.id} className="message-toast" onClick={() => openMessageToast(toast)}>
          <Avatar firstName={toast.senderFirstName} lastName={toast.senderLastName} url={toast.avatarUrl} size="sm" />
          <span><strong>{toast.title}</strong><small>{toast.preview}</small></span>
          <span className="icon-button icon-button-sm" onClick={(event) => {
            event.stopPropagation();
            setMessageToasts((current) => current.filter((item) => item.id !== toast.id));
          }} aria-label={t("chat.dismissAria")}><X size={14} /></span>
        </button>
      ))}
    </div>
  ) : null;

  const isChatRoute = location === "/chat" || Boolean(routeTarget);
  if (!isChatRoute) {
    // Mounted at the app root (see App.tsx) so navigating away never tears
    // down the socket/message state. Off the /chat route we render nothing
    // unless the user explicitly minimized instead of closing it - in that
    // case a small floating widget lists every conversation, like the full
    // sidebar, so nothing is hidden away in the collapsed state.
    if (!minimized) return messageToastStack;
    const expand = (roomId?: string) => {
      setMinimized(false);
      if (roomId) chooseRoom(roomId);
      navigate(roomId ? `/chat?room=${roomId}` : "/chat");
    };
    const resizeHandles = <>
      <span className="chat-mini-resize chat-mini-resize-w" onMouseDown={startMiniResize("w")} aria-hidden="true" />
      <span className="chat-mini-resize chat-mini-resize-e" onMouseDown={startMiniResize("e")} aria-hidden="true" />
      <span className="chat-mini-resize chat-mini-resize-n" onMouseDown={startMiniResize("n")} aria-hidden="true" />
      <span className="chat-mini-resize chat-mini-resize-s" onMouseDown={startMiniResize("s")} aria-hidden="true" />
      <span className="chat-mini-resize chat-mini-resize-nw" onMouseDown={startMiniResize("nw")} aria-hidden="true" />
      <span className="chat-mini-resize chat-mini-resize-se" onMouseDown={startMiniResize("se")} aria-hidden="true" />
    </>;
    if (selectedRoom) {
      // Opening a chat from the mini widget stays inline instead of jumping
      // to /chat - only the explicit expand button leaves the widget.
      const other = selectedRoom.type === "direct" ? selectedRoom.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id) : null;
      return (
        <>
          {messageToastStack}
          <div className="chat-mini-widget chat-mini-conversation"
               style={{ left: miniPos.x, top: miniPos.y, width: miniWidth, height: miniHeight }}>
            {resizeHandles}
            <header onMouseDown={startMiniDrag}>
              <button className="icon-button" onClick={() => setSelectedId(null)} aria-label={t("chat.backToChatsAria")}
                      title={t("chat.chatsTitle")}><ArrowLeft size={16} /></button>
              {selectedRoom.type === "direct" && other ?
                <Avatar firstName={other.firstName} lastName={other.lastName} url={other.avatarUrl}
                        size="sm" /> : <RoomAvatar room={selectedRoom} size="sm" />}
              <strong>{roomTitle(selectedRoom)}</strong>
              <button className="icon-button" onClick={() => expand(selectedRoom.id)}
                      aria-label={t("chat.expandChatAria")} title={t("chat.expandChatAria")}><Maximize2 size={15} />
              </button>
              <button className="icon-button" onClick={() => setMinimized(false)}
                      aria-label={t("chat.closeMiniChatAria")} title={t("chat.closeMiniChatAria")}><X size={16} />
              </button>
            </header>
            <div className="chat-mini-messages">
              {messages.map((message) => (
                <div key={message.id} className={`chat-mini-message ${message.senderId === user?.id ? "mine" : ""}`}>
                  <p>{message.content || (message.attachments?.length ? `📎 ${message.attachments[0].fileName}` : "")}</p>
                </div>
              ))}
            </div>
            {canPostIn(selectedRoom) ? <form className="chat-mini-composer" onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}>
              <input value={draft} onChange={(event) => announceTyping(event.target.value)}
                     placeholder={t("chat.messagePlaceholder")} aria-label={t("chat.messageTextAria")} />
              <button type="submit" disabled={!draft.trim()} aria-label={t("chat.sendMessageAria")}><Send size={16} />
              </button>
            </form> : <p className="chat-mini-readonly">{t("chat.channelReadOnlyHint")}</p>}
          </div>
        </>
      );
    }
    const miniRooms = miniUnreadOnly ? rooms.filter((room) => room.unreadCount > 0) : rooms;
    return (
      <>
        {messageToastStack}
        <div className="chat-mini-widget"
             style={{ left: miniPos.x, top: miniPos.y, width: miniWidth, height: miniHeight }}>
          {resizeHandles}
          <header onMouseDown={startMiniDrag}>
            <strong>{t("chat.messagesTitle")}</strong>
            <button className="icon-button" onClick={() => expand()} aria-label={t("chat.expandChatAria")}
                    title={t("chat.expandChatAria")}><Maximize2 size={15} /></button>
            <button className="icon-button" onClick={() => setMinimized(false)} aria-label={t("chat.closeMiniChatAria")}
                    title={t("chat.closeMiniChatAria")}><X size={16} /></button>
          </header>
          <label className="chat-mini-filter"><input type="checkbox" checked={miniUnreadOnly}
                                                     onChange={(event) => setMiniUnreadOnly(event.target.checked)} />{t("chat.unreadOnlyFilter")}
          </label>
          <div className="chat-mini-list">
            {miniRooms.length === 0 && <p className="chat-mini-empty">{t("chat.conversationNotFound")}</p>}
            {miniRooms.map((room) => {
              const other = room.type === "direct" ? room.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id) : null;
              return (
                <button key={room.id} className="chat-mini-row" onClick={() => chooseRoom(room.id, { silent: true })}>
                  {room.type === "direct" ? <DirectRoomAvatar peer={other} size="sm" /> :
                    <RoomAvatar room={room} size="sm" />}
                  <span className="chat-mini-copy">
                  <span><strong>{roomTitle(room)}</strong><time>{room.lastMessage ? formatTime(room.lastMessage.createdAt) : ""}</time></span>
                  <span><small>{room.lastMessage?.content ? renderMessageContent(room.lastMessage.content) : (room.memberStatus === "pending" ? t("chat.invitePending") : t("chat.noMessagesYet"))}</small>{room.unreadCount > 0 &&
                    <b>{room.unreadCount}</b>}</span>
                </span>
                </button>
              );
            })}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className={`chat-page ${selectedRoom || aiOpen ? "chat-room-open" : ""}`}>
      {messageToastStack}
      <StarfieldBackground />
      {mediaPreview && <div className="media-viewer" role="dialog" aria-modal="true" aria-label={mediaPreview.name}
                            onClick={() => setMediaPreview(null)}>
        <header><strong>{mediaPreview.name}</strong><a href={mediaPreview.url} download
                                                       onClick={(event) => event.stopPropagation()}
                                                       aria-label={t("chat.downloadImageAria")}><Download
          size={19} /></a>
          <button onClick={() => setMediaPreview(null)} aria-label={t("chat.closeAria")}><X size={22} /></button>
        </header>
        <img src={mediaPreview.url} alt={mediaPreview.name} onClick={(event) => event.stopPropagation()} /></div>}
      {roomContext && contextRoom &&
        <div className="room-context-menu" style={{ left: roomContext.x, top: roomContext.y }} role="menu"
             onMouseLeave={() => setRoomContext(null)}>
          <button onClick={() => {
            chooseRoom(contextRoom.id);
            setRoomContext(null);
          }}><MessageCircle size={17} />{t("chat.openConversation")}</button>
          <button onClick={() => {
            setCatalog(roomCatalog(contextRoom));
            chooseRoom(contextRoom.id);
            setRoomContext(null);
          }}><Hash size={17} />{t("chat.showInCategory")}</button>
          {contextRoom.type !== "direct" && !contextRoom.isSystem && <button onClick={() => {
            chooseRoom(contextRoom.id);
            setRoomContext(null);
            window.setTimeout(() => void openRoomInvites(), 0);
          }}><UserPlus size={17} />{t("chat.inviteToGroup")}</button>}
          {/* A group/channel you're in offers "leave"; a DM offers "delete" —
              only the creator of a group can destroy it for everyone. */}
          {contextRoom.type !== "direct" && !contextRoom.isSystem && !contextRoom.membershipLocked &&
            <button className="danger" onClick={() => void leaveRoomFromContext(contextRoom)}><LogOut
              size={17} />{t(contextRoom.type === "channel" ? "chat.leaveChannel" : "chat.leaveGroup")}</button>}
          {contextRoom.type === "direct" &&
            <button className="danger" onClick={() => void deleteRoomFromContext(contextRoom)}><Trash2
              size={17} />{t("chat.deleteChat")}</button>}
          {contextRoom.type !== "direct" && !contextRoom.isSystem && contextRoom.createdById === user?.id &&
            <button className="danger" onClick={() => void deleteRoomFromContext(contextRoom)}><Trash2
              size={17} />{t("chat.deleteGroup")}</button>}
        </div>}
      <aside className="chat-sidebar">
        <header className="chat-sidebar-header">
          <button className="icon-button chat-home-back" onClick={() => navigate("/")}
                  aria-label={t("chat.backToHomeAria")} title={t("chat.homeTitle")}><ArrowLeft size={20} /></button>
          <div><p className="eyebrow">Workspace</p><h1>{t("chat.messagesTitle")}</h1></div>
          <button className="icon-button icon-button-dark" onClick={() => setCreateOpen(true)}
                  aria-label={t("chat.newConversationAria")} title={t("chat.newConversationAria")}><Plus size={19} />
          </button>
        </header>
        <label className="search-field"><Search size={17} /><input value={search}
                                                                   onChange={(event) => setSearch(event.target.value)}
                                                                   placeholder={t("chat.searchChatPlaceholder")}
                                                                   aria-label={t("chat.searchChatPlaceholder")} />{search &&
          <button onClick={() => setSearch("")} aria-label={t("chat.clearSearchAria")}><X size={15} /></button>}</label>
        <nav className="chat-catalog" ref={catalogNav} aria-label={t("chat.catalogAria")}>
          <span className="catalog-indicator" aria-hidden="true"
                style={{ transform: `translateX(${catalogIndicator.left}px)`, width: `${catalogIndicator.width}px` }} />
          {catalogItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={catalog === item.id ? "active" : ""}
                           onClick={() => setCatalog(item.id)} aria-current={catalog === item.id ? "page" : undefined}
                           aria-label={item.label} title={item.label}><Icon
              size={18} /><span>{item.label}</span>{item.count > 0 && <b>{item.count}</b>}</button>;
          })}
        </nav>
        <div className="room-list room-list-transition" key={catalog}>
          {loadingRooms && <div className="center-loader"><LoaderCircle className="spin" size={22} /></div>}
          {!loadingRooms && catalog === "bot" &&
            <button className={`room-item ai-room-item ${aiOpen ? "active" : ""}`} onClick={chooseAi}><span
              className="room-avatar"><Bot size={18} /></span><span
              className="room-copy"><span><strong>OPTIMA AI</strong></span><span><small>{t("chat.aiRoomSubtitle")}</small></span></span>
            </button>}
          {!loadingRooms && filteredRooms.length === 0 && catalog !== "bot" && !sidebarSearching && sidebarPeople.length === 0 && sidebarDiscovered.length === 0 &&
            <div className="sidebar-empty">{catalog === "channel" ? <Megaphone size={22} /> :
              <MessageCircle size={22} />}
              <p>{catalog === "channel" ? t("chat.channelNotFound") : t("chat.conversationNotFound")}</p>
              <button onClick={() => setCreateOpen(true)}>{t("chat.newChatButton")}</button>
            </div>}
          {filteredRooms.map((room) => {
            const other = room.type === "direct" ? room.memberIds.map((id) => memberMap.get(id)).find((entry) => entry?.id !== user?.id) : null;
            return (
              <button key={room.id}
                      className={`room-item ${room.id === selectedId ? "active" : ""} ${room.unreadCount > 0 ? "unread" : ""}`}
                      onClick={() => chooseRoom(room.id)} onContextMenu={(event) => showRoomContext(event, room)}>
                {room.type === "direct" ? <DirectRoomAvatar peer={other} /> : <RoomAvatar room={room} />}
                <span className="room-copy"><span><strong>{roomTitle(room)}</strong><time>{room.lastMessage ? formatTime(room.lastMessage.createdAt) : ""}</time></span><span><small>{room.lastMessage?.content ? renderMessageContent(room.lastMessage.content) : (room.memberStatus === "pending" ? t("chat.invitePending") : t("chat.noMessagesYet"))}</small>{room.unreadCount > 0 &&
                  <b>{room.unreadCount}</b>}</span></span>
              </button>
            );
          })}
          {catalog !== "bot" && sidebarDiscovered.length > 0 && <>
            <p className="room-list-section">{t("chat.publicRoomsSection")}</p>
            {sidebarDiscovered.map((room) => (
              <button key={room.id} className="room-item" disabled={joiningRoom === room.id}
                      onClick={() => setPreviewRoom(room)}>
                <span className="room-avatar">
                  {room.avatarUrl ? <img src={room.avatarUrl} alt="" /> : room.type === "channel" ? <RadioTower size={18} /> : <Users size={18} />}
                </span>
                <span className="room-copy">
                  <span><strong>{room.name || (room.slug ? `@${room.slug}` : t("chat.untitledRoom"))}</strong></span>
                  <span><small>{room.description || t("chat.memberCount", { count: room.memberCount })}</small></span>
                </span>
                {joiningRoom === room.id && <LoaderCircle className="spin" size={16} />}
              </button>
            ))}
          </>}
          {catalog !== "bot" && (sidebarSearching || sidebarPeople.length > 0) && <>
            <p className="room-list-section">{t("chat.globalPeopleSection")}</p>
            {sidebarSearching && sidebarPeople.length === 0 &&
              <div className="center-loader"><LoaderCircle className="spin" size={18} /></div>}
            {sidebarPeople.map((person) => (
              <button key={person.id} className="room-item" disabled={openingDirect === person.id}
                      onClick={() => void openDirectWith(person.id)}>
                <DirectRoomAvatar peer={person} />
                <span className="room-copy">
                  <span><strong>{`${person.firstName} ${person.lastName}`.trim()}</strong></span>
                  <span><small>{person.username ? `@${person.username}` : t("chat.usernameNotSet")}</small></span>
                </span>
                {openingDirect === person.id && <LoaderCircle className="spin" size={16} />}
              </button>
            ))}
          </>}
        </div>
        <footer className="chat-connection"><span
          className={connected ? "online" : ""} /><small>{connected ? t("shell.realtime") : t("chat.reconnecting")}</small>
        </footer>
      </aside>

      <section
        ref={conversationRef}
        className={`conversation ${(() => {
          const roomBg = selectedRoom && selectedRoom.type !== "direct" ? selectedRoom.backgroundUrl : null;
          return selectedRoom && (roomBg || user?.backgroundUrl) ? "conversation-has-bg" : "";
        })()}`}
        style={(() => {
          const roomBg = selectedRoom && selectedRoom.type !== "direct" ? selectedRoom.backgroundUrl : null;
          const bg = roomBg || user?.backgroundUrl;
          return selectedRoom && bg ? ({ "--conversation-bg": `url("${bg}")` } as CSSProperties) : undefined;
        })()}
      >
        {!selectedRoom && !aiOpen && <header className="conversation-header conversation-header-empty">
          <button className="icon-button" onClick={() => {
            setMinimized(true);
            navigate("/");
          }} aria-label={t("chat.minimizeChatAria")} title={t("chat.minimizeChatAria")}><Minus size={18} /></button>
        </header>}
        {!selectedRoom && !aiOpen && !loadingRooms &&
          <EmptyState icon={<MessageCircle size={27} />} title={t("chat.selectConversationTitle")}
                      description={t("chat.selectConversationDesc")} action={<Button onClick={() => setCreateOpen(true)}
                                                                                     icon={<Plus
                                                                                       size={17} />}>{t("chat.newConversationButton")}</Button>} />}
        {aiOpen && <div className="ai-conversation">
          <header className="conversation-header">
            <button className="icon-button chat-back" onClick={() => {
              setAiOpen(false);
              window.history.replaceState({}, "", "/chat");
            }} aria-label={t("chat.backToBotsAria")}><ArrowLeft size={20} /></button>
            <span className="room-avatar room-avatar-sm"><Bot size={17} /></span>
            <div className="conversation-title"><h2>OPTIMA AI</h2>
              <p>{aiThinking ? t("chat.aiThinkingStatus") : t("chat.aiOnlineAssistant")}</p></div>
            <span className="ai-provider-badge"><ShieldCheck size={14} /> {t("chat.secureBadge")}</span>
            <button className="icon-button" onClick={() => {
              setMinimized(true);
              navigate("/");
            }} aria-label={t("chat.minimizeChatAria")} title={t("chat.minimizeChatAria")}><Minus size={18} /></button>
          </header>
          <div ref={aiMessageList} className="message-list ai-message-list" aria-live="polite">
            {aiMessages.length === 0 && <div className="message-empty"><span><Bot size={25} /></span><h3>OPTIMA AI</h3>
              <p>{t("chat.aiEmptyDesc")}</p></div>}
            {aiMessages.map((message) => <div key={message.id}
                                              className={`message ${message.role === "user" ? "message-mine" : ""}`}>
              <div className="message-bubble">{message.role === "model" && <strong>OPTIMA AI</strong>}
                <p>{message.text}</p>{message.sources && message.sources.length > 0 &&
                  <div className="ai-sources"><small>{t("chat.sourcesLabel")}</small>{message.sources.map((source) => <a
                    key={source.url} href={source.url} target="_blank" rel="noreferrer"><Link2
                    size={13} />{source.title}</a>)}</div>}<span><time>{formatTime(message.createdAt)}</time></span>
              </div>
            </div>)}
            {aiThinking && <div className="typing-bubble ai-typing"><Bot size={16} /><i /><i /><i /></div>}
          </div>
          <div className="composer ai-composer"><textarea value={aiDraft}
                                                          onChange={(event) => setAiDraft(event.target.value)}
                                                          onKeyDown={(event) => {
                                                            if (event.key === "Enter" && !event.shiftKey) {
                                                              event.preventDefault();
                                                              void sendAiMessage();
                                                            }
                                                          }} placeholder={t("chat.aiComposerPlaceholder")} rows={1}
                                                          maxLength={6000} aria-label={t("chat.aiQuestionAria")} />
            <button className="send-button" onClick={() => void sendAiMessage()}
                    disabled={!aiDraft.trim() || aiThinking} aria-label={t("chat.sendQuestionAria")}>{aiThinking ?
              <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button>
          </div>
        </div>}
        {selectedRoom && (
          <>
            <header className="conversation-header">
              <button className="icon-button chat-back" onClick={() => {
                setSelectedId(null);
                window.history.replaceState({}, "", "/chat");
              }} aria-label={t("chat.backToChatsAria")} title={t("chat.chatsTitle")}><ArrowLeft size={20} /></button>
              {selectedRoom.type === "direct" && detailPeer ?
                <DirectRoomAvatar peer={detailPeer} /> : <RoomAvatar room={selectedRoom} size="sm" />}
              <button className="conversation-title" onClick={() => {
                setDetailsTab("members");
                setDetailsSection(null);
                setDetailMemberSearch("");
                setDetailsOpen(true);
              }} aria-label={t("chat.openInfoAria")}><h2>{roomTitle(selectedRoom)}{selectedRoom.e2ee &&
                <Lock className="e2ee-badge" size={13} aria-label={t("chat.e2eeBadge")}><title>{t("chat.e2eeBadge")}</title></Lock>}</h2>
                <p>{typingUsers.length ? t("chat.typingStatus") : selectedRoom.type === "direct" ? formatPresenceLabel(peerPresence, t) : t("chat.membersCountLabel", { count: selectedRoom.memberCount })}</p>
              </button>
              <div className="conversation-tools">
                <button className={`icon-button ${messageSearchOpen ? "active" : ""}`} onClick={() => {
                  setMessageSearchOpen((value) => !value);
                  if (messageSearchOpen) setMessageSearch("");
                }} aria-label={t("chat.searchMessagesAria")} title={t("chat.searchTitle")}><Search size={18} /></button>
                <button className="icon-button" onClick={() => {
                  setMinimized(true);
                  navigate("/");
                }} aria-label={t("chat.minimizeChatAria")} title={t("chat.minimizeChatAria")}><Minus size={18} />
                </button>
                {selectedRoom.type === "direct" && <>
                  <button className="icon-button" onClick={() => void startCall("audio")}
                          disabled={Boolean(startingCall) || !detailPeer} aria-label={t("chat.audioCallAria")}
                          title={t("chat.audioCallAria")}>{startingCall === "audio" ?
                    <LoaderCircle className="spin" size={18} /> : <Phone size={18} />}</button>
                  <button className="icon-button" onClick={() => void startCall("video")}
                          disabled={Boolean(startingCall) || !detailPeer} aria-label={t("chat.videoCallAria")}
                          title={t("chat.videoCallAria")}>{startingCall === "video" ?
                    <LoaderCircle className="spin" size={18} /> : <Video size={18} />}</button>
                </>}
                {selectedRoom.type !== "direct" && selectedRoom.memberStatus !== "pending" && (!selectedRoom.isSystem || canAdminister(selectedRoom)) &&
                  <div className="header-more">
                    <button className={`icon-button ${headerMenuOpen ? "active" : ""}`}
                            onClick={() => setHeaderMenuOpen((value) => !value)}
                            aria-label={t("chat.conversationMenuAria")} aria-expanded={headerMenuOpen}><MoreVertical
                      size={19} /></button>
                    {headerMenuOpen && <div
                      className="header-more-menu">{canAdminister(selectedRoom) &&
                      <><button onClick={() => {
                        setHeaderMenuOpen(false);
                        openRoomSettings();
                      }}><Settings
                        size={17} /><span><strong>{selectedRoom.type === "channel" ? t("chat.configureChannel") : t("chat.configureGroup")}</strong><small>{t("chat.photoNameDescHint")}</small></span>
                      </button>
                      <button onClick={() => {
                        setHeaderMenuOpen(false);
                        setChannelSettingsOpen(true);
                      }}><Sliders
                        size={17} /><span><strong>{t("channelSettings.title")}</strong><small>{t("channelSettings.entryHint")}</small></span>
                      </button></>}{!selectedRoom.isSystem && <button onClick={() => {
                      setHeaderMenuOpen(false);
                      void openRoomInvites();
                    }}><UserPlus
                      size={17} /><span><strong>{t("chat.inviteToGroup")}</strong><small>{t("chat.createManageLinkHint")}</small></span>
                    </button>}{!selectedRoom.isSystem && !selectedRoom.membershipLocked && <button className="danger"
                                                                                                 onClick={() => {
                                                                                                   setHeaderMenuOpen(false);
                                                                                                   void leaveRoomFromContext(selectedRoom);
                                                                                                 }}><LogOut
                      size={17} /><span><strong>{t(selectedRoom.type === "channel" ? "chat.leaveChannel" : "chat.leaveGroup")}</strong><small>{t("chat.membersCountLabel", { count: selectedRoom.memberCount })}</small></span>
                    </button>}{!selectedRoom.isSystem && selectedRoom.createdById === user?.id &&
                      <button className="danger" onClick={() => void deleteSelectedRoom()}><Trash2
                        size={17} /><span><strong>{t("chat.deleteGroup")}</strong><small>{t("chat.deletesAllMessagesHint")}</small></span>
                      </button>}</div>}</div>}
              </div>
            </header>
            {messageSearchOpen && <div className="conversation-search"><Search size={17} /><input value={messageSearch}
                                                                                                  onChange={(event) => setMessageSearch(event.target.value)}
                                                                                                  placeholder={t("chat.searchMessagePlaceholder")}
                                                                                                  autoFocus /><span>{messageSearch ? t("chat.resultsCount", { count: visibleMessages.length }) : ""}</span>
              <button onClick={() => {
                setMessageSearch("");
                setMessageSearchOpen(false);
              }} aria-label={t("chat.closeSearchAria")}><X size={17} /></button>
            </div>}
            {pinnedMessage && <div className="pinned-bar" role="region" aria-label={t("chat.pinnedAria")}>
              <button type="button" className="pinned-bar-main" onClick={() => jumpToPinned()}>
                <span className="pinned-bar-ticks" aria-hidden="true">{pinned.slice(0, 4).map((item, index) => <i key={item.id} className={index === Math.min(pinnedIndex, 3) ? "active" : ""} />)}</span>
                <span className="pinned-bar-copy"><strong>{pinned.length > 1 ? t("chat.pinnedNumbered", { n: pinned.length - pinnedIndex }) : t("chat.pinnedSingle")}</strong><small>{previewOf(pinnedMessage)}</small></span>
              </button>
              {canPin(selectedRoom) && <button type="button" className="pinned-bar-close" onClick={() => void togglePin(pinnedMessage)} aria-label={t("chat.unpinAction")} title={t("chat.unpinAction")}><X size={17} /></button>}
            </div>}
            {selectedRoom.memberStatus === "pending" ? (
              <div className="invite-state"><UsersRound size={28} /><h3>{t("chat.conversationInviteTitle")}</h3>
                <p>{t("chat.conversationInviteDesc")}</p><Button onClick={() => void acceptInvite()} icon={<Check
                  size={17} />}>{t("chat.acceptButton")}</Button></div>
            ) : (
              <>
                <div ref={messageList} className="message-list" aria-live="polite" onScroll={(event) => {
                  const node = event.currentTarget;
                  if (activeMenu) setActiveMenu(null);
                  const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
                  shouldStickToMessageBottom.current = distanceFromBottom < 96;
                  setShowScrollButton(distanceFromBottom > 96);
                  if (node.scrollTop < 90) void loadOlderMessages();
                }}>
                  {loadingOlderMessages && <div className="older-messages-loader"><LoaderCircle className="spin"
                                                                                                size={18} /> {t("chat.loadingOlderMessages")}
                  </div>}
                  {loadingMessages && <div className="center-loader"><LoaderCircle className="spin" size={24} /></div>}
                  {!loadingMessages && visibleMessages.length === 0 &&
                    <div className="message-empty"><span>{messageSearch ? <Search size={24} /> :
                      <MessageCircle size={24} />}</span>
                      <h3>{messageSearch ? t("chat.messageNotFound") : t("chat.startConversationTitle")}</h3>
                      <p>{messageSearch ? t("chat.tryOtherSearch") : t("chat.sendFirstMessage")}</p></div>}
                  {visibleMessages.map((message, index) => {
                    const mine = message.senderId === user?.id;
                    const sender = message.sender || memberMap.get(message.senderId);
                    const readByCount = mine && !message.id.startsWith("optimistic:") && message.sequence
                      ? [...readReceipts.values()].filter((seq) => seq >= message.sequence!).length
                      : 0;
                    const previous = visibleMessages[index - 1];
                    const showDay = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString();
                    const grouped = previous?.senderId === message.senderId && !showDay;
                    if (message.isSystem && message.systemMetadata) {
                      const meta = message.systemMetadata;
                      const missed = meta.kind !== "call_ended";
                      const CallIcon = meta.callType === "video" ? Video : Phone;
                      const label = meta.kind === "missed_call" ? t("chat.callMissed")
                        : meta.kind === "declined_call" ? t("chat.callDeclined")
                          : t("chat.callEnded", { duration: formatCallDuration(meta.durationSeconds || 0) });
                      return (
                        <div key={message.id}>
                          {showDay && <div className="day-separator"><span>{formatDay(message.createdAt)}</span></div>}
                          <div className="system-call-row">
                            <span className={`system-call-icon ${missed ? "missed" : ""}`}>{missed ?
                              <PhoneOff size={14} /> : <CallIcon size={14} />}</span>
                            <span className="system-call-label">{label}</span>
                            <time>{formatTime(message.createdAt)}</time>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={message.id}>
                        {showDay && <div className="day-separator"><span>{formatDay(message.createdAt)}</span></div>}
                        <div
                          id={`message-${message.id}`} data-message-id={message.id}
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
                          onContextMenu={(event) => {
                            event.preventDefault();
                            openMessageMenu(message.id, event.clientX, event.clientY);
                          }}
                        >
                          <span
                            className={`swipe-reply-indicator ${swipingMessage?.id === message.id && swipingMessage.armed ? "armed" : ""}`}
                            aria-hidden="true"><Reply size={18} /></span>
                          {!mine && !grouped &&
                            <Avatar firstName={sender?.firstName} lastName={sender?.lastName} url={sender?.avatarUrl}
                                    size="sm" />}
                          {!mine && grouped && <span className="avatar-spacer" />}
                          <div className="message-bubble">
                            {message.replyToId && <button className="message-reply-quote"
                                                          onClick={() => document.getElementById(`message-${message.replyToId}`)?.scrollIntoView({
                                                            behavior: "smooth",
                                                            block: "center"
                                                          })}><Reply
                              size={13} /><span>{messages.find((item) => item.id === message.replyToId)?.content || t("chat.repliedMessageFallback")}</span>
                            </button>}
                            {!mine && !grouped &&
                              <strong>{sender ? `${sender.firstName} ${sender.lastName}`.trim() : t("chat.teamMemberFallback")}</strong>}
                            {message.content && (isTelegramEmoji(message.content) ?
                              <AnimatedEmoji className="message-custom-emoji" id={telegramEmojiId(message.content)} /> :
                              <p>{renderMessageContent(message.content)}</p>)}
                            {message.attachments?.map((attachment) => attachment.mimeType.startsWith("audio/") ?
                              <AudioMessage key={attachment.id || attachment.url} src={attachment.url}
                                            fileName={attachment.fileName}
                                            voice={attachment.fileName.startsWith("voice-")} /> : attachment.mimeType.startsWith("image/") ?
                                <button className="message-image" key={attachment.id || attachment.url}
                                        onClick={() => setMediaPreview({
                                          url: attachment.url,
                                          name: attachment.fileName
                                        })}><img src={attachment.url} alt={attachment.fileName} />
                                </button> : attachment.mimeType.startsWith("video/") ?
                                  <video className="message-video" key={attachment.id || attachment.url} controls
                                         preload="metadata" src={attachment.url} /> :
                                  <a className="file-attachment" key={attachment.id || attachment.url}
                                     href={attachment.url} download><span><FileText
                                    size={20} /></span><span><strong>{attachment.fileName}</strong><small>{t("chat.fileSizeDownload", { size: Math.max(1, Math.round(attachment.fileSize / 1024)) })}</small></span><Download
                                    size={17} /></a>)}
                            {message.reactions && message.reactions.length > 0 &&
                              <div className="message-reactions">{message.reactions.map((reaction) => <button
                                key={reaction.emoji}
                                onClick={() => void reactToMessage(message, reaction.emoji)}>{renderReaction(reaction.emoji)}
                                <span>{reaction.userIds.length}</span></button>)}</div>}
                            <span><time>{formatTime(message.createdAt)}</time>
                              {/* Channels report a bare count to everyone; in a group
                                  the author alone can open the list of who read it. */}
                              {selectedRoom.type === "channel" && (message.viewCount ?? 0) > 0 &&
                                <small className="message-views"><Eye size={12} />{message.viewCount}</small>}
                              {selectedRoom.type !== "channel" && selectedRoom.type !== "direct" && mine &&
                                <button type="button" className="message-views-link"
                                        onClick={() => void openViewers(message.id)}
                                        aria-label={t("chat.viewersTitle")}><Eye size={12} />{message.viewCount ?? 0}</button>}
                              {message.isEdited && <small>{t("chat.editedLabel")}</small>}{mine && (
                                // Not on the server yet: a tick here claimed a
                                // message was sent before it had been.
                                message.id.startsWith("optimistic:")
                                  ? <Clock3 size={13} className="message-sending" aria-label={t("chat.readStatusSending")} />
                                  : selectedRoom.type === "direct"
                                  ? (readByCount > 0 ? <CheckCheck size={14} className="message-read"
                                                                   aria-label={t("chat.readStatusRead")} /> :
                                    <Check size={14} className="message-sent-check"
                                           aria-label={t("chat.readStatusSent")} />)
                                  : (readByCount > 0 ? <span className="message-seen-count"
                                                             aria-label={t("chat.readStatusSeenBy", { count: readByCount })}><Eye
                                    size={13} />{readByCount}</span> : <Check size={14} className="message-sent-check"
                                                                              aria-label={t("chat.readStatusSent")} />)
                              )}</span>
                            {selectedRoom.slug === "otima-community" &&
                              <button className="discuss-button" onClick={() => void openDiscussion(message.id)}>
                                <MessageCircle size={15} /> {t("chat.discussLabel")}</button>}
                            <button className="message-menu-trigger"
                                    onClick={(event) => {
                                      if (activeMenu === message.id) { setActiveMenu(null); return; }
                                      const rect = event.currentTarget.getBoundingClientRect();
                                      openMessageMenu(message.id, rect.left, rect.bottom);
                                    }}
                                    aria-label={t("chat.messageActionsAria")} aria-expanded={activeMenu === message.id}>
                              <MoreVertical size={16} /></button>

                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {typingUsers.length > 0 && <div className="typing-bubble"><i /><i /><i /></div>}
                  <div ref={messagesEnd} />
                  {showScrollButton && <button className="scroll-bottom" onClick={() => {
                    shouldStickToMessageBottom.current = true;
                    setShowScrollButton(false);
                    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
                  }} aria-label={t("chat.scrollToLatestAria")}><ArrowDown size={19} /></button>}
                </div>
                {!canPostIn(selectedRoom) ?
                  <div className="channel-subscribe-bar">
                    <button onClick={() => void toggleChannelMute()}>{selectedRoom.isMuted ? <Bell size={19} /> :
                      <BellOff size={19} />}{selectedRoom.isMuted ? t("chat.unmute") : t("chat.mute")}</button>
                  </div> : <div className={`composer ${recording ? "composer-recording" : ""}`}>
                    {staged.length > 0 && <div className="composer-staged">
                      <header>
                        <span>{t("chat.stagedCount", { count: staged.length, max: MAX_ATTACHMENTS })}</span>
                        <button type="button" onClick={() => {
                          staged.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
                          setStaged([]);
                        }}>{t("chat.clearAttachments")}</button>
                      </header>
                      <ul>
                        {staged.map((item) => (
                          <li key={item.id} className={item.error ? "staged-error" : item.attachment ? "" : "staged-loading"}>
                            {item.previewUrl
                              ? <img src={item.previewUrl} alt={item.file.name} />
                              : <span className="staged-file"><Paperclip size={16} /></span>}
                            {!item.attachment && !item.error && <span className="staged-spinner"><LoaderCircle className="spin" size={16} /></span>}
                            {item.error && <span className="staged-badge">!</span>}
                            <button type="button" onClick={() => removeStaged(item.id)}
                                    aria-label={t("chat.removeAttachmentAria", { name: item.file.name })}><X size={13} /></button>
                            <small title={item.file.name}>{item.file.name}</small>
                          </li>
                        ))}
                      </ul>
                    </div>}
                    {/^\/ai(?:\s|$)/i.test(draft) && <form className="composer-ai-assist" onSubmit={(event) => {
                      event.preventDefault();
                      void runComposerAi();
                    }}>
                      <header><span><Sparkles size={17} /></span>
                        <div><strong>{t("chat.aiAssistTitle")}</strong><small>{t("chat.aiAssistHint")}</small></div>
                        <button type="button" onClick={() => {
                          setDraft("");
                          setAiAssistPrompt("");
                        }} aria-label={t("chat.closeAiAssistAria")}><X size={17} /></button>
                      </header>
                      <div className="ai-assist-suggestions">
                        <button type="button"
                                onClick={() => setAiAssistPrompt(t("chat.suggestWriteTextPrompt"))}>{t("chat.suggestWriteText")}</button>
                        <button type="button"
                                onClick={() => setAiAssistPrompt(t("chat.suggestFixTextPrompt"))}>{t("chat.suggestFixText")}</button>
                        <button type="button"
                                onClick={() => setAiAssistPrompt(t("chat.suggestFillInfoPrompt"))}>{t("chat.suggestFillInfo")}</button>
                      </div>
                      <div className="ai-assist-input"><textarea value={aiAssistPrompt}
                                                                 onChange={(event) => setAiAssistPrompt(event.target.value)}
                                                                 placeholder={t("chat.aiAssistPlaceholder")} rows={3}
                                                                 autoFocus />
                        <button type="submit" disabled={!aiAssistPrompt.trim() || aiThinking}
                                aria-label={t("chat.runAiAssistAria")}>{aiThinking ?
                          <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}</button>
                      </div>
                    </form>}
                    {(replyingTo || editing) &&
                      <div className="composer-mode"><span>{editing ? <Pencil size={16} /> : <Reply size={16} />}</span>
                        <div>
                          <strong>{editing ? t("chat.editingMessageLabel") : t("chat.replyingLabel")}</strong><small>{(editing || replyingTo)?.content || t("chat.mediaMessageFallback")}</small>
                        </div>
                        <button onClick={() => {
                          setEditing(null);
                          setReplyingTo(null);
                          setDraft("");
                        }} aria-label={t("chat.cancelAria")}><X size={17} /></button>
                      </div>}
                    <button type="button"
                            className={`icon-button composer-ai-trigger ${/^\/ai(?:\s|$)/i.test(draft) ? "active" : ""}`}
                            onClick={() => {
                              const opening = !/^\/ai(?:\s|$)/i.test(draft);
                              setDraft(opening ? "/ai " : "");
                              if (!opening) setAiAssistPrompt("");
                              window.requestAnimationFrame(() => richMessageInput.current?.focus());
                            }}
                            aria-label={t("chat.aiAssistTitle")}
                            title={t("chat.aiAssistTitle")}
                            aria-pressed={/^\/ai(?:\s|$)/i.test(draft)}><Sparkles size={19} /></button>
                    <EmojiPickerButton onSelect={(emojiId) => {
                      richMessageInput.current?.insertEmoji(emojiId);
                    }} />
                    <input ref={fileInput} type="file" hidden multiple onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length) void stageFiles(files);
                      // Reset so picking the same file twice still fires onChange.
                      if (fileInput.current) fileInput.current.value = "";
                    }} />
                    {!recording &&
                      <button className="icon-button" onClick={() => fileInput.current?.click()}
                              disabled={staged.length >= MAX_ATTACHMENTS}
                              aria-label={t("chat.attachFileAria")}><Paperclip size={20} /></button>}
                    {recording ? <div className="recording-status"><i /><strong>{t("chat.recordingInProgress")}</strong>
                      <time>{Math.floor(recordingSeconds / 60)}:{String(recordingSeconds % 60).padStart(2, "0")}</time>
                      <button onClick={() => stopRecording(true)} aria-label={t("chat.cancelRecordingAria")}><Trash2
                        size={18} /></button>
                    </div> : <RichMessageInput ref={richMessageInput} value={draft}
                                               onChange={announceTyping}
                                               onSubmit={() => void sendMessage()}
                                               placeholder={t("chat.messagePlaceholder")}
                                               maxLength={1500} ariaLabel={t("chat.messageTextAria")} />}
                    {(draft.trim() || staged.length > 0) && !recording ?
                      <button className="send-button" onClick={() => void sendMessage()}
                              disabled={sending || staged.some((item) => !item.attachment && !item.error)}
                              aria-label={t("chat.sendMessageAria")}>{sending ?
                        <LoaderCircle className="spin" size={19} /> : <Send size={19} />}</button> :
                      <button className={`send-button voice-button ${recording ? "recording" : ""}`}
                              onClick={() => recording ? stopRecording() : void startRecording()} disabled={sending}
                              aria-label={recording ? t("chat.sendVoiceAria") : t("chat.recordVoiceAria")}>{sending ?
                        <LoaderCircle className="spin" size={19} /> : recording ?
                          <Square size={17} fill="currentColor" /> : <Mic size={20} />}</button>}
                  </div>}
              </>
            )}
          </>
        )}
                  {menuMessage && menuAt && <div ref={menuRef} className="message-context-menu message-menu-floating" role="menu" style={{ "--menu-x": `${menuAt.x}px`, "--menu-y": `${menuAt.y}px` } as CSSProperties}>
                    <div className="reaction-strip">{quickEmojis.map((emoji) => <button
                      key={emoji} aria-label={t("chat.reactAria")} onClick={() => {
                        void reactToMessage(menuMessage, emoji);
                        setActiveMenu(null);
                      }}>{renderReaction(emoji)}</button>)}</div>
                    <button role="menuitem" onClick={() => {
                      setReplyingTo(menuMessage);
                      setEditing(null);
                      setActiveMenu(null);
                    }}><Reply size={16} />{t("chat.replyAction")}</button>
                    {canPin(selectedRoom) && <button role="menuitem" onClick={() => void togglePin(menuMessage)}>{menuMessage.isPinned ? <PinOff size={16} /> : <Pin size={16} />}{menuMessage.isPinned ? t("chat.unpinAction") : t("chat.pinAction")}</button>}
                    <button role="menuitem" onClick={() => {
                      void navigator.clipboard.writeText(menuMessage.content).catch(() => undefined);
                      setActiveMenu(null);
                    }}><Copy size={16} />{t("chat.copyAction")}</button>
                    <button role="menuitem" onClick={() => {
                      setForwardingMessage(menuMessage);
                      setActiveMenu(null);
                    }}><Send size={16} />{t("chat.forwardAction")}</button>
                    {menuMessage.senderId === user?.id && <button role="menuitem" onClick={() => {
                      setEditing(menuMessage);
                      setReplyingTo(null);
                      setDraft(menuMessage.content);
                      setActiveMenu(null);
                    }}><Pencil size={16} />{t("chat.editAction")}</button>}
                    {menuMessage.senderId === user?.id && <button role="menuitem" className="danger" onClick={() => void deleteMessage(menuMessage)}><Trash2
                      size={16} />{t("chat.deleteAction")}</button>}
                  </div>}
      </section>

      {directCall && <div className="direct-call-overlay" role="dialog" aria-modal="true"
                          aria-label={t("chat.directCallAria")}>{directCall.phase === "active" ?
        <MeetingRoomPage meetingId={directCall.meetingId} directMode onDirectClose={closeDirectCall} /> :
        <section className="direct-call-ringing">
          <div className="direct-call-backdrop" aria-hidden="true" />
          <span className="direct-call-type">
            {directCall.kind === "video" ? <Video size={16} /> : <Phone size={16} />}
            {directCall.kind === "video" ? t("chat.videoCallAria") : t("chat.audioCallAria")}
          </span>
          <div className={`direct-call-avatar-wrap ${directCall.phase}`}>
            <i aria-hidden="true" /><i aria-hidden="true" />
            <Avatar firstName={memberMap.get(directCall.peerId)?.firstName || t("chat.userFallback")}
                    lastName={memberMap.get(directCall.peerId)?.lastName}
                    url={memberMap.get(directCall.peerId)?.avatarUrl} size="xl" />
          </div><span
          className="direct-call-status-dot" aria-hidden="true" />
          <h2>{memberMap.get(directCall.peerId) ? `${memberMap.get(directCall.peerId)?.firstName} ${memberMap.get(directCall.peerId)?.lastName}`.trim() : t("chat.userFallback")}</h2>
          <p>{directCall.phase === "incoming" ? t("chat.incomingCallText") : t("chat.connectingText")}</p>
          <div className="direct-call-ringing-actions">
            <button className="decline" onClick={closeDirectCall}><PhoneOff
              size={23} /><span>{directCall.phase === "incoming" ? t("chat.declineLabel") : t("chat.cancelCallLabel")}</span>
            </button>
            {directCall.phase === "incoming" &&
              <button className="accept" onClick={acceptDirectCall}>{directCall.kind === "video" ? <Video size={23} /> :
                <Phone size={23} />}<span>{t("chat.acceptButton")}</span></button>}</div>
          <small><ShieldCheck size={15} /> {t("chat.callSecurityHint")}</small></section>}</div>}

      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)} className="tg-info-modal"
             title={detailsSection ? sectionLabel(detailsSection) : selectedRoom?.type === "direct" ? t("chat.profileTitle") : selectedRoom?.type === "channel" ? t("chat.channelInfoTitle") : t("chat.groupInfoTitle")}
             width="sm">
        {selectedRoom && <div className={`tg-info details-${selectedRoom.type}`}>
          {detailsSection ? <>
            <button type="button" className="tg-info-back" onClick={() => { setDetailsSection(null); setDetailsTab("members"); }}><ArrowLeft size={18} />{t("chat.backToInfo")}</button>
            <div className="tg-info-list">
              {detailsLoading && <div className="center-loader"><LoaderCircle className="spin" size={22} /></div>}
              {!detailsLoading && sharedItems.map((item) => {
                const href = item.storageUrl || (Array.isArray(item.url) ? item.url[0] : item.url);
                const image = detailsSection === "media" && item.mimeType?.startsWith("image/") && href;
                return <button className="tg-info-row shared-item" key={item.id || item.messageId}
                               onClick={() => image ? setMediaPreview({ url: href, name: item.fileName || "Media" }) : href ? window.open(href, "_blank", "noopener,noreferrer") : undefined}>
                  <span className="tg-info-thumb">{image ? <img src={href} alt={item.fileName || "Media"} /> : detailsSection === "links" ? <Link2 size={20} /> : detailsSection === "voice" || detailsSection === "music" ? <Mic size={20} /> : <FileText size={20} />}</span>
                  <span className="tg-info-text"><strong>{item.fileName || item.content || href || t("chat.sharedContentFallback")}</strong><small>{item.username ? `@${item.username} · ` : ""}{formatDay(item.createdAt)}</small></span>
                  {href && <Download size={17} />}
                </button>;
              })}
              {!detailsLoading && sharedItems.length === 0 && <div className="compact-empty"><Search size={20} /><span><strong>{t("chat.emptyDetailsTitle")}</strong><small>{t("chat.emptyDetailsDesc")}</small></span></div>}
            </div>
          </> : <>
            <section className="tg-info-hero">
              {detailPeer
                ? <span className="tg-info-avatar"><Avatar firstName={detailPeer.firstName} lastName={detailPeer.lastName} url={detailPeer.avatarUrl} size="xl" /></span>
                : <span className="tg-info-avatar"><RoomAvatar room={selectedRoom} /></span>}
              <strong>{roomTitle(selectedRoom)}</strong>
              <small className={selectedRoom.type === "direct" && isPresenceActive(peerPresence) ? "online" : ""}>
                {selectedRoom.type === "direct" ? formatPresenceLabel(peerPresence, t) : selectedRoom.type === "channel" ? t("chat.subscribersCountDesc", { count: selectedRoom.memberCount }) : t("chat.membersCountDesc", { count: selectedRoom.memberCount || 0 })}
              </small>
            </section>
            <div className="tg-info-actions">
              {selectedRoom.type === "direct" ? <>
                <button onClick={() => setDetailsOpen(false)}><MessageCircle size={20} /><span>{t("chat.messageActionLabel")}</span></button>
                <button onClick={() => void startCall("audio")}><Phone size={20} /><span>{t("chat.audioActionLabel")}</span></button>
                <button onClick={() => void startCall("video")}><Video size={20} /><span>{t("chat.videoActionLabel")}</span></button>
              </> : <>
                {!selectedRoom.isSystem && <button onClick={() => { setDetailsOpen(false); void openRoomInvites(); }}><UserPlus size={20} /><span>{t("chat.inviteActionLabel")}</span></button>}
                {!selectedRoom.isSystem && canAdminister(selectedRoom) && <button onClick={openRoomSettings}><Settings size={20} /><span>{t("chat.manageActionLabel")}</span></button>}
              </>}
              <button onClick={() => void toggleChannelMute()}>{selectedRoom.isMuted ? <Bell size={20} /> : <BellOff size={20} />}<span>{selectedRoom.isMuted ? t("chat.unmute") : t("chat.mute")}</span></button>
              <button onClick={() => { setDetailsOpen(false); setMessageSearchOpen(true); }}><Search size={20} /><span>{t("chat.searchActionLabel")}</span></button>
            </div>
            <section className="tg-info-section">
              {selectedRoom.type === "direct" ? <>
                {detailPeer?.username && <button className="tg-info-row" onClick={() => void copyText(`@${detailPeer.username}`)}><AtSign size={20} /><span className="tg-info-text"><strong>@{detailPeer.username}</strong><small>{t("chat.usernameLabel")}</small></span><Copy size={16} /></button>}
              </> : <>
                {selectedRoom.description && <div className="tg-info-row"><Info size={20} /><span className="tg-info-text"><strong className="multiline">{selectedRoom.description}</strong><small>{t("chat.descriptionLabel")}</small></span></div>}
                <button className="tg-info-row" onClick={() => void copyText(roomLink(selectedRoom))}><Link2 size={20} /><span className="tg-info-text"><strong className="link">{roomLink(selectedRoom).replace(/^https?:\/\//, "")}</strong><small>{t("chat.linkLabel")}</small></span><Copy size={16} /></button>
              </>}
            </section>
            <section className="tg-info-section">
              {(["media", "files", "links", "voice", "music"] as const).map((kind) => (
                <button key={kind} className="tg-info-row" onClick={() => { setDetailsSection(kind); setDetailsTab(kind); }}>
                  {kind === "media" ? <ImageIcon size={20} /> : kind === "files" ? <FileText size={20} /> : kind === "links" ? <Link2 size={20} /> : kind === "voice" ? <Mic size={20} /> : <Music size={20} />}
                  <span className="tg-info-text"><strong>{sectionLabel(kind)}</strong></span><ChevronRight size={18} />
                </button>
              ))}
            </section>
            {selectedRoom.type !== "direct" && <section className="tg-info-section tg-info-members">
              <header><strong>{selectedRoom.type === "channel" ? t("chat.subscribersTab") : t("chat.membersTab")}</strong><span>{detailMemberTotal}</span></header>
              <label className="details-member-search"><Search size={17} /><input value={detailMemberSearch} onChange={(event) => setDetailMemberSearch(event.target.value)} placeholder={selectedRoom.type === "channel" ? t("chat.searchSubscribersPlaceholder") : t("chat.searchMembersPlaceholder")} /></label>
              {detailsLoading && <div className="center-loader"><LoaderCircle className="spin" size={22} /></div>}
              {!detailsLoading && detailMembers.map((member) => (
                <button key={member.publicId} className="tg-info-row tg-info-member" onClick={() => navigate(`/profile/${member.username || member.publicId}`)} aria-label={t("chat.openProfileAria", { name: `${member.firstName} ${member.lastName}` })}>
                  <span className="tg-info-member-avatar"><Avatar firstName={member.firstName} lastName={member.lastName} url={member.avatarUrl} size="sm" /><MemberPresenceDot userId={member.id} /></span>
                  <span className="tg-info-text"><strong>{member.firstName} {member.lastName}</strong><small><MemberPresenceText userId={member.id} /></small></span>
                  {member.role !== "member" && <em className="tg-info-role">{t(`chat.role_${member.role}`)}</em>}
                </button>
              ))}
            </section>}
          </>}
        </div>}
      </Modal>

      {/* The full per-room configuration. Kept separate from the small
          name/photo dialog above: that one is a quick edit anybody who
          administers the room reaches in two clicks, this is the fourteen
          sections behind it. */}
      {/* Read-only look at a public channel before committing. Telegram does the
          same: you see the name, description and size, and the only action is
          an explicit Join at the bottom. */}
      <Modal open={Boolean(previewRoom)} onClose={() => setPreviewRoom(null)}
             title={previewRoom?.name || t("chat.untitledRoom")} width="sm">
        {previewRoom && <div className="room-preview">
          <span className="room-preview-avatar">
            {previewRoom.avatarUrl
              ? <img src={previewRoom.avatarUrl} alt="" />
              : previewRoom.type === "channel" ? <RadioTower size={26} /> : <Users size={26} />}
          </span>
          <strong>{previewRoom.name || t("chat.untitledRoom")}</strong>
          <small>{t(previewRoom.type === "channel" ? "chat.channelWord" : "chat.groupWord")}
            {" · "}{t("chat.memberCount", { count: previewRoom.memberCount })}</small>
          {previewRoom.description && <p>{previewRoom.description}</p>}
          {previewRoom.slug && <code>{window.location.origin}/{previewRoom.type === "channel" ? "ch" : "g"}/{previewRoom.slug}</code>}
          <Button type="button" onClick={() => void joinPublicRoom(previewRoom.id)}
                  disabled={joiningRoom === previewRoom.id}
                  icon={joiningRoom === previewRoom.id ? <LoaderCircle className="spin" size={17} /> : <UserPlus size={17} />}>
            {t("chat.joinRoomButton")}
          </Button>
        </div>}
      </Modal>

      <Modal open={Boolean(viewersOpen)} onClose={() => setViewersOpen(null)}
             title={t("chat.viewersTitle")} width="sm">
        {viewers === null
          ? <div className="center-loader"><LoaderCircle className="spin" size={20} /></div>
          : viewers.length === 0
            ? <p className="field-hint">{t("chat.noViewsYet")}</p>
            : <ul className="viewers-list">{viewers.map((viewer) => (
                <li key={viewer.id}>
                  <Avatar firstName={viewer.firstName} lastName={viewer.lastName} url={viewer.avatarUrl} size="sm" />
                  <span><strong>{`${viewer.firstName} ${viewer.lastName}`.trim()}</strong>
                    <small>{formatTime(viewer.viewedAt)}</small></span>
                </li>
              ))}</ul>}
      </Modal>

      <Modal open={channelSettingsOpen} onClose={() => setChannelSettingsOpen(false)}
             title={t("channelSettings.title")}
             description={selectedRoom?.name ?? ""} width="lg">
        {selectedRoom && channelSettingsOpen && <ChannelSettingsPanel
          room={selectedRoom}
          onClose={() => setChannelSettingsOpen(false)}
          onSaved={() => void loadRooms()} />}
      </Modal>

      <Modal open={roomSettingsOpen} onClose={() => !savingRoomSettings && setRoomSettingsOpen(false)}
             title={selectedRoom?.type === "channel" ? t("chat.configureChannel") : t("chat.configureGroup")}
             width="sm" className="tg-edit-modal">
        <form className="tg-edit" onSubmit={saveRoomSettings}>
          <div className="tg-edit-scroll">
            <section className="tg-edit-top">
              <div className="tg-edit-avatar">
                <button type="button" className="tg-edit-avatar-pic" onClick={() => roomAvatarInput.current?.click()} disabled={uploadingRoomAvatar} aria-label={t("chat.changeChatPhotoAria")}>
                  {roomSettingsAvatar ? <img src={roomSettingsAvatar} alt={t("chat.chatPhotoAlt")} /> :
                    <strong>{(roomSettingsName || (selectedRoom?.type === "channel" ? "K" : "G")).trim().charAt(0).toUpperCase()}</strong>}
                </button>
                <button type="button" className="tg-edit-avatar-cam" onClick={() => roomAvatarInput.current?.click()} disabled={uploadingRoomAvatar} aria-label={t("chat.changeChatPhotoAria")}>
                  {uploadingRoomAvatar ? <LoaderCircle className="spin" size={16} /> : <Camera size={16} />}
                </button>
                <input ref={roomAvatarInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => void uploadRoomAvatar(event.target.files?.[0])} />
              </div>
              <label className="tg-edit-name">
                <span>{selectedRoom?.type === "channel" ? t("chat.channelNameLabel") : t("chat.groupNameLabel")}</span>
                <input value={roomSettingsName} onChange={(event) => setRoomSettingsName(event.target.value)} maxLength={200} required placeholder={t("chat.namePlaceholder")} />
              </label>
            </section>
            <label className="tg-edit-desc">
              <textarea value={roomSettingsDescription} onChange={(event) => setRoomSettingsDescription(event.target.value)} maxLength={1000} rows={2}
                        placeholder={t("chat.descriptionOptional")} />
              <small>{roomSettingsDescription.length}/1000</small>
            </label>
            {roomSettingsAvatar && <button type="button" className="tg-edit-link danger" onClick={() => setRoomSettingsAvatar(null)}><Trash2 size={15} />{t("chat.removePhoto")}</button>}

            <section className="tg-edit-group">
              {selectedRoom?.scope !== "workspace_only" && <div className="tg-edit-row">
                <Globe size={20} /><span className="tg-edit-row-label">{selectedRoom?.type === "channel" ? t("chat.channelTypeLabel") : t("chat.groupTypeLabel")}</span>
                <span className="tg-edit-seg" role="radiogroup">
                  <button type="button" role="radio" aria-checked={roomSettingsScope === "public"} className={roomSettingsScope === "public" ? "active" : ""} onClick={() => setRoomSettingsScope("public")}>{t("chat.visibilityPublicShort")}</button>
                  <button type="button" role="radio" aria-checked={roomSettingsScope === "private"} className={roomSettingsScope === "private" ? "active" : ""} onClick={() => setRoomSettingsScope("private")}>{t("chat.visibilityPrivateShort")}</button>
                </span>
              </div>}
              <label className="tg-edit-row tg-edit-row-input">
                <Link2 size={20} />
                <span className="tg-edit-row-label">{t("chat.linkLabel")}</span>
                <span className="tg-edit-slug"><small>/{selectedRoom?.type === "channel" ? "ch" : "g"}/</small><input value={roomSettingsSlug}
                  onChange={(event) => setRoomSettingsSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} maxLength={60}
                  placeholder={selectedRoom?.publicId ? String(selectedRoom.publicId) : "backend-team"} /></span>
              </label>
              <div className="tg-edit-row">
                <ImagePlus size={20} /><span className="tg-edit-row-label">{t("chat.chatBackgroundLabel")}</span>
                <span className="tg-edit-bg">
                  {roomSettingsBackground && <span className="tg-edit-bg-thumb" style={{ backgroundImage: `url(${roomSettingsBackground})` }} />}
                  <button type="button" onClick={() => roomBackgroundInput.current?.click()} disabled={uploadingRoomBackground}>{uploadingRoomBackground ? <LoaderCircle className="spin" size={15} /> : roomSettingsBackground ? t("chat.replacePhoto") : t("chat.setPhoto")}</button>
                  {roomSettingsBackground && <button type="button" className="danger" onClick={() => void removeRoomBackground()} disabled={uploadingRoomBackground} aria-label={t("chat.removePhoto")}><Trash2 size={15} /></button>}
                </span>
                <input ref={roomBackgroundInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => void uploadRoomBackground(event.target.files?.[0])} />
              </div>
            </section>
            <p className="tg-edit-note">{t("chat.adminsOnlyDesc")}</p>
          </div>
          <footer className="tg-edit-actions">
            <button type="button" onClick={() => setRoomSettingsOpen(false)}>{t("common.cancel")}</button>
            <button type="submit" className="primary" disabled={savingRoomSettings || !roomSettingsName.trim()}>{savingRoomSettings ? <LoaderCircle className="spin" size={16} /> : null}{t("common.save")}</button>
          </footer>
        </form>
      </Modal>

      <Modal open={Boolean(forwardingMessage)} onClose={() => !forwarding && setForwardingMessage(null)}
             title={t("chat.forwardMessageTitle")} description={t("chat.forwardMessageDesc")} width="md">
        <div className="forward-preview"><Reply
          size={16} /><span><strong>{forwardingMessage?.content || forwardingMessage?.attachments?.[0]?.fileName || t("chat.mediaMessageFallback")}</strong><small>{forwardingMessage?.attachments?.length ? t("chat.attachmentsCount", { count: forwardingMessage.attachments.length }) : t("chat.textMessageFallback")}</small></span>
        </div>
        <div className="forward-room-list">{rooms.filter((room) => room.memberStatus !== "pending").map((room) =>
          <button key={room.id} disabled={forwarding} onClick={() => void forwardMessage(room.id)}><span
            className="room-avatar">{room.type === "channel" ? <Megaphone size={17} /> : room.type === "direct" ?
            <UserRound size={17} /> : <Hash
              size={17} />}</span><span><strong>{roomTitle(room)}</strong><small>{room.type === "direct" ? t("chat.personalChatLabel") : t("chat.membersCountDesc", { count: room.memberCount })}</small></span>{forwarding ?
            <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button>)}</div>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title={t("chat.newConversationTitle")}
             description={t("chat.newConversationModalDesc")}>
        <form className="modal-form" onSubmit={createConversation}>
          <div className="segmented-control segmented-control-3"><span className="segmented-indicator"
                                                                      aria-hidden="true"
                                                                      style={{ transform: `translateX(${createMode === "direct" ? "200%" : createMode === "channel" ? "100%" : "0"})` }} />
            <button type="button" className={createMode === "group" ? "active" : ""} onClick={() => {
              setCreateMode("group");
              setSelectedMembers([]);
            }}><UsersRound size={17} /> {t("chat.groupWord")}</button>
            <button type="button" className={createMode === "channel" ? "active" : ""} onClick={() => {
              setCreateMode("channel");
              setSelectedMembers([]);
            }}><RadioTower size={17} /> {t("chat.channelWord")}</button>
            <button type="button" className={createMode === "direct" ? "active" : ""} onClick={() => {
              setCreateMode("direct");
              setSelectedMembers([]);
            }}><UserRound size={17} /> {t("chat.personalWord")}</button>
          </div>
          {createMode !== "direct" && <>
            <label>{createMode === "channel" ? t("chat.channelNameLabel") : t("chat.groupNameLabel")}<input name="name"
                                                                                                           placeholder={createMode === "channel" ? t("chat.channelNamePlaceholder") : t("chat.groupNamePlaceholder")}
                                                                                                           required
                                                                                                           maxLength={200} /></label>
            <label>{t("chat.descriptionLabel")}<input name="description" placeholder={t("chat.descriptionPlaceholder")}
                                                      maxLength={1000} /></label>
            {/* Without this every room was created `private`, and a private
                room is invisible to search — so a "public channel" was not
                something the UI could actually produce. */}
            <fieldset className="create-scope">
              <legend>{t("chat.visibilityLegend")}</legend>
              <label><input type="radio" name="scope" value="public" checked={createScope === "public"}
                            onChange={() => setCreateScope("public")} />
                <span><strong>{t("chat.visibilityPublicTitle")}</strong><small>{t("chat.visibilityPublicDesc")}</small></span>
              </label>
              <label><input type="radio" name="scope" value="private" checked={createScope === "private"}
                            onChange={() => setCreateScope("private")} />
                <span><strong>{t("chat.visibilityPrivateTitle")}</strong><small>{t("chat.visibilityPrivateDesc")}</small></span>
              </label>
            </fieldset>
          </>}
          <label className="search-field member-search"><Search size={17} /><input value={memberSearch}
                                                                                   onChange={(event) => setMemberSearch(event.target.value)}
                                                                                   placeholder={createMode === "direct" ? t("chat.searchByNamePlaceholder") : t("chat.searchWorkspaceMembersPlaceholder")}
                                                                                   aria-label={t("chat.searchUserAria")}
                                                                                   autoComplete="off"
                                                                                   name="chat-member-search" />{searchingUsers ?
            <LoaderCircle className="spin" size={16} /> : memberSearch &&
            <button type="button" onClick={() => setMemberSearch("")} aria-label={t("chat.clearSearchAria")}><X
              size={15} /></button>}</label>
          <fieldset className="member-picker">
            <legend>{createMode === "direct" ? t("chat.whoToChatLegend") : createMode === "channel" ? t("chat.selectSubscribersLegend") : t("chat.selectMembersLegend")}</legend>
            {pickerCandidates.length === 0 && <p
              className="field-hint">{createMode === "direct" && normalizedMemberSearch.length < 2 ? t("chat.minCharsHint") : t("chat.userNotFoundHint")}</p>}{pickerCandidates.map((member) => {
            const checked = selectedMembers.includes(member.id);
            return <label key={member.id} className={checked ? "checked" : ""}><input
              type={createMode === "direct" ? "radio" : "checkbox"} name="members" value={member.id} checked={checked}
              onChange={() => setSelectedMembers((current) => createMode === "direct" ? [member.id] : current.includes(member.id) ? current.filter((id) => id !== member.id) : [...current, member.id])} /><Avatar
              firstName={member.firstName} lastName={member.lastName} url={member.avatarUrl}
              size="sm" /><span><strong>{member.firstName} {member.lastName}</strong><small>@{member.username}</small></span><Check
              size={16} /></label>;
          })}</fieldset>
          <button type="button" className="invite-email-prompt" onClick={() => {
            setCreateOpen(false);
            setWorkspaceInviteOpen(true);
          }}><MailPlus
            size={18} /><span><strong>{t("chat.inviteNewPersonTitle")}</strong><small>{t("chat.inviteNewPersonHint")}</small></span>
          </button>
          <div className="modal-actions"><Button type="button" variant="secondary"
                                                 onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button><Button
            type="submit" loading={creating}
            disabled={createMode === "direct" && selectedMembers.length !== 1}>{createMode === "group" ? t("chat.createGroupButton") : createMode === "channel" ? t("chat.createChannelButton") : t("chat.openChatButton")}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={workspaceInviteOpen} onClose={() => setWorkspaceInviteOpen(false)}
             title={t("chat.workspaceInviteTitle")} description={t("chat.workspaceInviteDesc")}>
        <form className="modal-form" onSubmit={inviteToWorkspace}>
          <label>{t("auth.emailLabel")}<input name="email" type="email" autoComplete="email"
                                              placeholder="name@company.com" required /></label>
          <label>{t("chat.roleLabel")}<select name="role" defaultValue="junior">
            <option value="lead">Lead</option>
            <option value="senior">Senior</option>
            <option value="middle">Middle</option>
            <option value="junior">Junior</option>
            <option value="guest">Guest</option>
          </select></label>
          <p className="field-hint">{t("chat.workspaceInviteHint")}</p>
          <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => {
            setWorkspaceInviteOpen(false);
            setCreateOpen(true);
          }}>{t("chat.backButton")}</Button><Button type="submit" loading={invitingWorkspace}
                                                    icon={<MailPlus size={17} />}>{t("chat.sendInviteButton")}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={roomInfoOpen} onClose={() => setRoomInfoOpen(false)} title={t("chat.inviteToGroup")}
             description={t("chat.inviteLinkModalDesc")} width="md">
        <form className="modal-form invite-link-form" onSubmit={createRoomInvite}>
          <div className="form-grid-2"><label>{t("chat.maxUsesLabel")}<input name="maxUses" type="number" min="1"
                                                                             max="100000"
                                                                             defaultValue="25" /></label><label>{t("chat.expiresLabel")}<select
            name="expiresInHours" defaultValue="168">
            <option value="24">{t("chat.day1")}</option>
            <option value="168">{t("chat.day7")}</option>
            <option value="720">{t("chat.day30")}</option>
            <option value="">{t("chat.unlimited")}</option>
          </select></label></div>
          <Button type="submit" loading={creatingInvite}
                  icon={<Link2 size={17} />}>{t("chat.createNewLinkButton")}</Button>
        </form>
        <div className="invite-link-list" aria-live="polite">
          {loadingInvites && <div className="center-loader"><LoaderCircle className="spin" size={22} /></div>}
          {!loadingInvites && inviteError && <div className="inline-notice" role="alert">{inviteError}</div>}
          {!loadingInvites && !inviteError && roomInvites.length === 0 &&
            <div className="invite-link-empty"><Link2 size={21} /><p>{t("chat.noInviteLinksYet")}</p></div>}
          {roomInvites.map((invite) => {
            const url = new URL(`/join/chat/${invite.code}`, window.location.origin).toString();
            const expiryDate = invite.expiresAt ? new Intl.DateTimeFormat(localeTag[locale] || "uz-UZ", {
              day: "numeric",
              month: "short",
              year: "numeric"
            }).format(new Date(invite.expiresAt)) : "";
            return <div className={`invite-link-row ${invite.isActive ? "" : "inactive"}`} key={invite.id}><span
              className="invite-link-icon"><Link2 size={17} /></span><span
              className="invite-link-copy"><strong>{invite.isActive ? url : t("chat.revokedLinkLabel")}</strong><small>{invite.maxUses ? t("chat.usesWithMax", {
              used: invite.usesCount,
              max: invite.maxUses
            }) : t("chat.usesOnly", { used: invite.usesCount })} · {invite.expiresAt ? t("chat.untilDate", { date: expiryDate }) : t("chat.noExpiry")}</small></span>{invite.isActive && <>
              <button type="button" className="icon-button" onClick={() => void copyInvite(invite.code)}
                      aria-label={t("chat.copyLinkAria")} title={t("chat.copyTitle")}><Copy size={17} /></button>
              <button type="button" className="icon-button icon-button-danger"
                      onClick={() => void revokeRoomInvite(invite.id)} aria-label={t("chat.revokeLinkAria")}
                      title={t("chat.revokeTitle")}><Trash2 size={17} /></button>
            </>}</div>;
          })}
        </div>
      </Modal>
    </div>
  );
}
