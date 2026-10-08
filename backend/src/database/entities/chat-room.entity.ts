import { ChatRoomType, RoomScope } from '../../common/enums';
import { Group } from './group.entity';
import { Project } from './project.entity';
import { User } from './user.entity';
import { ChatMessage } from './chat-message.entity';

export interface ChatRoom {
  id: string;

  groupId: string | null;

  group: Group | null;

  projectId: string;

  project: Project;

  type: ChatRoomType;

  scope: RoomScope;

  name: string;

  avatarUrl: string | null;

  description: string | null;

  isArchived: boolean;

  isReadOnly: boolean;

  inviteCode: string | null;

  lastMessageId: string;

  lastMessage: ChatMessage;

  lastMessageAt: Date | null;

  messageSeq: number;

  createdById: string;

  createdBy: User;

  createdAt: Date;

  updatedAt: Date;

  /** Stable 6-digit public identifier for /g, /ch, /u routes — never the internal UUID. */
  publicId: number;

  /** OTIMA community fields (ported from main) — only set on the two system rooms. */
  slug: string | null;

  isSystem: boolean;

  membershipLocked: boolean;

  postingMode: 'members' | 'admins_only';

  linkedRoomId: string | null;

  /** Admin/owner-managed background shown to every member (see §14.10). */
  backgroundUrl: string | null;

  backgroundType: 'DEFAULT' | 'IMAGE' | 'COLOR' | 'GRADIENT' | 'PATTERN';
}
