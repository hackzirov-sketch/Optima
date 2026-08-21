export type UserTheme = "light" | "dark" | "system";
export type UserLanguage = "uz" | "ru" | "en";

export interface User {
  id: string;
  publicId?: string;
  email: string;
  username: string | null;
  nickname?: string | null;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  nameEmoji?: string | null;
  backgroundUrl?: string | null;
  accountVisibility?: "public" | "private";
  phoneNumber?: number | null;
  occupation?: string | null;
  language?: UserLanguage;
  timezone?: string;
  theme?: UserTheme;
  isVerified?: boolean;
  notificationsEnabled?: boolean;
  emailNotifications?: boolean;
  pushNotifications?: boolean;
  notifyTaskAssigned?: boolean;
  notifyPushReviewed?: boolean;
  notifyPrEvents?: boolean;
  notifyMentions?: boolean;
}

export interface AuthResult {
  // No accessToken/refreshToken here on purpose: the backend strips them out
  // of the body and sets them as httpOnly cookies instead. Declaring them
  // anyway is what produced `Authorization: Bearer undefined` — the fields
  // were always undefined, and got stringified into localStorage.
  user: User;
  requiresPasswordSetup?: boolean;
}

export interface Workspace {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description?: string | null;
  visibility: "public" | "private";
  maxMembers?: number;
  maxProjects?: number;
  createdAt?: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: string;
  joinedAt?: string;
  user?: User;
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
  avatarUrl?: string | null;
}

export interface ChatRoom {
  id: string;
  workspaceId: string | null;
  type: "workspace" | "project" | "group" | "direct" | "public" | "private" | "channel";
  scope: "workspace_only" | "private" | "public";
  name?: string | null;
  description?: string | null;
  avatarUrl?: string | null;
  createdById: string;
  memberIds: string[];
  memberProfiles?: Array<Pick<User, "id" | "firstName" | "lastName" | "username" | "nickname" | "avatarUrl" | "publicId" | "nameEmoji">>;
  memberCount: number;
  unreadCount: number;
  isReadOnly: boolean;
  memberStatus?: "pending" | "active";
  lastMessage?: {
    id: string;
    content: string;
    senderId: string;
    senderName?: string | null;
    createdAt: string;
  } | null;
  createdAt: string;
  /** OTIMA community fields (ported from main) — only set on the two system rooms. */
  slug?: string | null;
  isSystem?: boolean;
  membershipLocked?: boolean;
  postingMode?: "members" | "admins_only";
  linkedRoomId?: string | null;
  myRole?: RoomRole;
  isMuted?: boolean;
  /** Stable 6-digit public identifier for /g, /ch, /u routes — never the internal UUID. */
  publicId?: number;
  /** Admin/owner-managed background shown to every member (see SYSTEM_DESIGN.md §14.10). */
  backgroundUrl?: string | null;
  backgroundType?: "DEFAULT" | "IMAGE" | "COLOR" | "GRADIENT" | "PATTERN";
}

/**
 * A row from the platform's single audit trail (`audit_logs`). The same shape
 * backs a workspace's activity feed and a room's change history — they are one
 * query with a different filter.
 */
export interface AuditEntry {
  id: string;
  workspaceId: string | null;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorUsername: string | null;
}

export type RoomRole = "owner" | "admin" | "moderator" | "member";
export type Audience = "owner" | "admins" | "moderators" | "members";
export type CommentAudience = "everyone" | "subscribers" | "verified" | "disabled";

/**
 * Per-room configuration, mirroring the backend's channel_settings table.
 * Ordinary members receive only the subset that describes the room's rules to
 * them, which is why every field is optional on the read path.
 */
export interface ChannelSettings {
  roomId: string;
  bannerUrl: string | null;
  language: string | null;
  category: string | null;

  discoverable: boolean;
  allowInviteLinks: boolean;
  joinRequiresApproval: boolean;

  whoCanPost: Audience;
  whoCanComment: CommentAudience;
  whoCanUploadFiles: Audience;
  whoCanSendVoice: Audience;
  whoCanSendMedia: Audience;
  reactionsEnabled: boolean;

  autoDeleteDays: number | null;
  slowModeSeconds: number;
  spamFilter: boolean;
  linkFilter: boolean;
  badWordsFilter: boolean;
  badWords: string[];

  defaultNotifications: boolean;
  mentionNotifications: boolean;
  eventNotifications: boolean;
  emailNotifications: boolean;

  pinnedMessageId: string | null;
  welcomeMessage: string | null;
  rules: string | null;
  faq: string | null;

  maxUploadBytes: number | null;
  allowedFileTypes: string[];

  requireAdmin2fa: boolean;

  allowMeetings: boolean;
  allowLiveStream: boolean;
  allowScreenShare: boolean;
  allowRecording: boolean;
  allowMeetingChat: boolean;

  aiModeration: boolean;
  aiSummary: boolean;
  aiTags: boolean;
  aiTranslate: boolean;
  aiSpamDetect: boolean;

  courseId: string | null;
  playlistId: string | null;
  trackProgress: boolean;
  linkedProjectId: string | null;
  autoPostTasks: boolean;
  isVerified: boolean;
  minReputation: number;
  joinQuestions: string[];

  integrations: Record<string, unknown>;
}

/** Caller's personal wallpaper/theme/font-size/compact-mode/animation override for a room. */
export interface UserChatSettings {
  id: string;
  userId: string;
  roomId: string;
  backgroundUrl: string | null;
  backgroundType: "DEFAULT" | "IMAGE" | "COLOR" | "GRADIENT" | "PATTERN" | null;
  theme: string | null;
  fontSize: number | null;
  compactMode: boolean;
  animationEnabled: boolean;
}

export interface RoomInvite {
  id: string;
  roomId: string;
  code: string;
  createdById: string;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  isActive: boolean;
}

export interface GlobalSearchResult {
  users: Array<Pick<User, "id" | "firstName" | "lastName" | "username" | "avatarUrl">>;
  chats: Array<{ id: string; name?: string | null; type: string }>;
  projects: Array<{ id: string; name: string }>;
  workspaces: Array<{ id: string; name: string; slug: string }>;
  meetings: Array<{ id: string; title: string }>;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  content: string;
  contentType?: string;
  attachments?: Array<{ id: string; fileName: string; fileSize: number; mimeType: string; url: string }>;
  sequence?: number;
  clientMessageId?: string;
  replyToId?: string | null;
  isEdited?: boolean;
  editedAt?: string | null;
  createdAt: string;
  reactions?: Array<{ emoji: string; userIds: string[] }>;
  sender?: Pick<User, "id" | "firstName" | "lastName" | "nickname" | "avatarUrl" | "nameEmoji"> | null;
  /** OTIMA community discussion-thread fields (ported from main). */
  sourceChannelMessageId?: string | null;
  discussionRootMessageId?: string | null;
  isPinned?: boolean;
  viewCount?: number;
  /** Slack-style threads (see SYSTEM_DESIGN.md §14.13). */
  isThreadReply?: boolean;
  threadReplyCount?: number;
  threadLastReplyAt?: string | null;
  /** Non-user-authored entries — currently just call outcomes (missed/declined/ended). */
  isSystem?: boolean;
  systemMetadata?: { kind: "missed_call" | "declined_call" | "call_ended"; callType: "audio" | "video"; durationSeconds?: number } | null;
}

/** Who a participant is — enough to label a tile without a second lookup. */
export interface MeetingUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username?: string | null;
  avatarUrl: string | null;
}

export interface MeetingParticipant {
  id: string;
  userId: string;
  role: "host" | "co_host" | "participant";
  joinedAt: string;
  leftAt?: string | null;
  isMuted: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  /** Joined server-side; the workspace member list can't supply guests. */
  user?: MeetingUser | null;
}

export type MeetingVisibility = "workspace_only" | "private" | "public" | "invite_only";
export type MeetingJoinPolicyValue = "auto" | "request_approval";
export type MeetingJoinRequestStatusValue = "pending" | "approved" | "rejected" | "cancelled";

/** Server-computed access decision for the current user, attached to GET/join responses. */
export interface MeetingAccess {
  isHost: boolean;
  isParticipant: boolean;
  /** True if calling join() right now succeeds immediately. */
  canJoin: boolean;
  /** True if requesting to join makes sense right now (not already pending). */
  canRequest: boolean;
  requestStatus: MeetingJoinRequestStatusValue | null;
  deniedReason?: "workspace_only" | "invite_only" | "locked";
}

export interface MeetingJoinRequest {
  id: string;
  meetingId: string;
  userId: string;
  status: MeetingJoinRequestStatusValue;
  requestedAt: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string | null;
}

export interface Meeting {
  id: string;
  workspaceId?: string | null;
  hostId: string;
  host?: Pick<User, "id" | "firstName" | "lastName" | "avatarUrl"> | null;
  title: string;
  description?: string | null;
  code: string;
  status: "scheduled" | "live" | "inactive" | "ended" | "cancelled";
  scope: MeetingVisibility;
  joinPolicy: MeetingJoinPolicyValue;
  locked: boolean;
  startTime: string;
  endTime?: string | null;
  maxParticipants: number;
  participantCount: number;
  participants: MeetingParticipant[];
  agenda?: string | null;
  createdAt: string;
  access?: MeetingAccess;
  /** Fast Redis-backed count, only present when the caller can manage the waiting room (host/co-host). */
  waitingCount?: number | null;
}

export interface MeetingRecording {
  id: string;
  meetingId: string;
  startedBy: string;
  status: "recording" | "completed" | "failed" | "cancelled";
  startedAt: string;
  stoppedAt?: string | null;
  durationSeconds?: number | null;
  autoStopped: boolean;
  storageKey?: string | null;
  storageUrl?: string | null;
  fileSize?: number | null;
  createdAt: string;
}

export interface MeetingFile {
  id: string;
  meetingId: string;
  sharedBy: string;
  fileName: string;
  mimeType: string;
  fileSize: string;
  storageUrl: string;
  createdAt: string;
  firstName?: string;
  lastName?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string | null;
  type: string;
  isRead: boolean;
  createdAt: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Where clicking the notification should take the user, when the server knows. */
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** A note taken during a meeting. Readable by anyone who was in that call. */
export interface Note {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  meetingId: string | null;
  creatorId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
