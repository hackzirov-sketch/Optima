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

export enum WorkspaceVisibility {
  PUBLIC = 'public',
  PRIVATE = 'private',
}

export enum WorkspaceRole {
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
  WORKSPACE = 'workspace',
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

/** Structural kind of a chat room — what it's attached to. Derived server-side
 * from workspaceId/groupId/projectId/targetUserId, never trusted from the client. */
export enum ChatRoomType {
  WORKSPACE = 'workspace',
  PROJECT = 'project',
  GROUP = 'group',
  DIRECT = 'direct',
}

export enum ChatMemberStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
}

/**
 * Shared scope model for chat rooms and meetings — chosen by the user at
 * creation time, replacing the old ChatVisibility/MeetingVisibility enums
 * (which had different, overlapping value sets for what is really the same
 * concept). Determines both who can see/join the room and whether a
 * workspace is required:
 *  - WORKSPACE_ONLY: workspace_id required, visible only to workspace members
 *  - PRIVATE:        workspace_id optional, host + invited users join directly,
 *                     anyone else with the link can send a "request to join"
 *  - PUBLIC:         workspace_id optional, discoverable in global search
 *  - INVITE_ONLY:    workspace_id optional, not discoverable at all — only
 *                     the host + explicitly invited users can join; unlike
 *                     PRIVATE there is no "request to join" fallback
 *                     (meetings-only today; see MeetingJoinPolicy)
 */
export enum RoomScope {
  WORKSPACE_ONLY = 'workspace_only',
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
  WORKSPACE_INVITE = 'workspace_invite',
  TASK_COMPLETED = 'task_completed',
  TASK_STATUS_CHANGED = 'task_status_changed',
  PROJECT_MEMBER_INVITE = 'project_member_invite',
  PROJECT_MEMBER_ACCEPTED = 'project_member_accepted',
  PROJECT_MEMBER_DECLINED = 'project_member_declined',
  MEETING_INVITE = 'meeting_invite',
  CHAT_INVITE = 'chat_invite',
  CHAT_INVITE_ACCEPTED = 'chat_invite_accepted',
  CHAT_INVITE_DECLINED = 'chat_invite_declined',
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
 * `WorkspaceRole` (owner/admin/lead/senior/middle/junior/guest), which is the
 * per-workspace RBAC role and governs actual permissions.
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
