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

export enum ChatRoomType {
  WORKSPACE = 'workspace',
  GROUP = 'group',
  PROJECT = 'project',
  DIRECT = 'direct',
  MEETING = 'meeting',
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
}
