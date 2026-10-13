export enum UserTheme {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

export enum UserLanguage {
  UZ = 'uz',
  RU = 'ru',
  EN = 'en',
}

export enum GroupVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum MemberRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  LEAD = 'lead',
  SENIOR = 'senior',
  MIDDLE = 'middle',
  JUNIOR = 'junior',
  GUEST = 'guest',
}

export enum GroupType {
  GENERAL = 'general',
  DEVELOPMENT = 'development',
  DESIGN = 'design',
  MARKETING = 'marketing',
  MANAGEMENT = 'management',
  QA = 'qa',
  DEVOPS = 'devops',
  HR = 'hr',
  PRODUCT = 'product',
}

export enum ProjectStatus {
  PLANNING = 'planning',
  ACTIVE = 'active',
  ON_HOLD = 'on_hold',
  COMPLETED = 'completed',
  ARCHIVED = 'archived',
  CANCELLED = 'cancelled',
}

export enum ProjectVisibility {
  PUBLIC = 'public',
  GROUP = 'group',
  PRIVATE = 'private',
}

export enum PriorityLevel {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum TaskType {
  FEATURE = 'feature',
  BUG = 'bug',
  IMPROVEMENT = 'improvement',
  RESEARCH = 'research',
  DESIGN = 'design',
  HOTFIX = 'hotfix',
}

export enum TaskStatus {
  BACKLOG = 'backlog',
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  REVIEW = 'review',
  TESTING = 'testing',
  DONE = 'done',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled',
}

export enum DependencyType {
  BLOCKS = 'blocks',
  BLOCKED_BY = 'blocked_by',
  RELATES_TO = 'relates_to',
  DUPLICATES = 'duplicates',
}

export enum PushType {
  GITHUB_DIRECT = 'github_direct',
  UPZ_REVIEW = 'upz_review',
  DRAFT = 'draft',
}

export enum PushStatus {
  PENDING = 'pending',
  UPLOADED = 'uploaded',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  MERGED = 'merged',
}

/**
 * Structural kind of a chat room. Mirrors chat_rooms_type_enum exactly — the
 * two drifted apart once already (the DB had values TS didn't model, and the
 * frontend branched on a 'channel' type that existed nowhere in the schema),
 * so any change here needs a migration and vice versa.
 *
 * DIRECT/CHANNEL are the user-facing kinds:
 *   DIRECT  — exactly two people, no group, unique per pair (dm_key)
 *   CHANNEL — broadcast, posting restricted by posting_mode, group optional
 *
 * GROUP/PROJECT are structural rooms derived from groupId/projectId. GROUP is
 * the group's own dedicated room (formerly split into GROUP + GROUP —
 * merged into one now that Group is the sole top-level container).
 * PUBLIC/PRIVATE are legacy values kept only so existing rows still parse —
 * scope, not type, is what governs visibility now.
 */
export enum ChatRoomType {
  PROJECT = 'project',
  GROUP = 'group',
  DIRECT = 'direct',
  CHANNEL = 'channel',
  /** @deprecated legacy rows only — use RoomScope for visibility. */
  PUBLIC = 'public',
  /** @deprecated legacy rows only — use RoomScope for visibility. */
  PRIVATE = 'private',
}

/** The kinds a user is allowed to create from the chat UI. */
export const CREATABLE_ROOM_TYPES = [
  ChatRoomType.DIRECT,
  ChatRoomType.GROUP,
  ChatRoomType.CHANNEL,
] as const;

export enum ChatMemberStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
}

/**
 * Shared scope model for chat rooms and meetings — chosen by the user at
 * creation time, replacing the old ChatVisibility/MeetingVisibility enums
 * (which had different, overlapping value sets for what is really the same
 * concept). Determines both who can see/join the room and whether a
 * group is required:
 *  - GROUP_ONLY:  group_id required, visible only to group members
 *  - PRIVATE:     group_id optional, host + invited users join directly,
 *                 anyone else with the link can send a "request to join"
 *  - PUBLIC:      group_id optional, discoverable in global search
 *  - INVITE_ONLY: group_id optional, not discoverable at all — only
 *                 the host + explicitly invited users can join; unlike
 *                 PRIVATE there is no "request to join" fallback
 *                 (meetings-only today; see MeetingJoinPolicy)
 */
export enum RoomScope {
  GROUP_ONLY = 'group_only',
  PRIVATE = 'private',
  PUBLIC = 'public',
  INVITE_ONLY = 'invite_only',
}

export enum UserPresence {
  ONLINE = 'online',
  AWAY = 'away',
  OFFLINE = 'offline',
}

export enum NotificationType {
  TASK_ASSIGNED = 'task_assigned',
  TASK_UPDATED = 'task_updated',
  TASK_COMMENTED = 'task_commented',
  PUSH_SUBMITTED = 'push_submitted',
  PUSH_APPROVED = 'push_approved',
  PUSH_REJECTED = 'push_rejected',
  PR_CREATED = 'pr_created',
  PR_REVIEWED = 'pr_reviewed',
  PR_MERGED = 'pr_merged',
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  MEMBER_JOINED = 'member_joined',
  MEMBER_ROLE_CHANGED = 'member_role_changed',
  MENTION = 'mention',
  GROUP_INVITE = 'group_invite',
  TASK_COMPLETED = 'task_completed',
  TASK_STATUS_CHANGED = 'task_status_changed',
  PROJECT_MEMBER_INVITE = 'project_member_invite',
  PROJECT_MEMBER_ACCEPTED = 'project_member_accepted',
  PROJECT_MEMBER_DECLINED = 'project_member_declined',
  MEETING_INVITE = 'meeting_invite',
  CHAT_INVITE = 'chat_invite',
  CHAT_INVITE_ACCEPTED = 'chat_invite_accepted',
  CHAT_INVITE_DECLINED = 'chat_invite_declined',
  ANNOUNCEMENT = 'announcement',
}

// ─── Notification Channel & Priority ──────────────────────────────────────────

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  TELEGRAM = 'telegram',
  SMS = 'sms',
}

export enum NotificationPriority {
  LOW = 'low', // in_app only
  NORMAL = 'normal', // telegram + in_app
  HIGH = 'high', // telegram + email + in_app
  CRITICAL = 'critical', // sms + telegram + email + in_app
}

export enum NotificationCategory {
  MEETING = 'meeting',
  TASK = 'task',
  HOMEWORK = 'homework',
  PAYMENT = 'payment',
  SECURITY = 'security',
  COURSE = 'course',
  MARKETING = 'marketing',
  CERTIFICATE = 'certificate',
  SYSTEM = 'system',
}

export enum ReminderJobType {
  MEETING_24H = 'meeting_24h',
  MEETING_3H = 'meeting_3h',
  MEETING_30M = 'meeting_30m',
  MEETING_5M = 'meeting_5m',
  TASK_3D = 'task_3d',
  TASK_1D = 'task_1d',
  TASK_2H = 'task_2h',
}

/**
 * Self-selected profession at signup — purely informational/onboarding data
 * (used for personalization, defaults, analytics). NOT to be confused with
 * `MemberRole` (owner/admin/lead/senior/middle/junior/guest), which is the
 * per-group RBAC role and governs actual permissions.
 */
export enum UserOccupation {
  DEVELOPER = 'developer',
  DESIGNER = 'designer',
  FREELANCER = 'freelancer',
  PROJECT_MANAGER = 'project_manager',
  QA_ENGINEER = 'qa_engineer',
  DEVOPS_ENGINEER = 'devops_engineer',
  PRODUCT_MANAGER = 'product_manager',
  STUDENT = 'student',
  OTHER = 'other',
}
