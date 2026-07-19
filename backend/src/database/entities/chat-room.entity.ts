import { ChatRoomType, RoomScope } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { Group } from './group.entity';
import { Project } from './project.entity';
import { User } from './user.entity';
import { ChatMessage } from './chat-message.entity';

export interface ChatRoom {
  id: string;

  workspaceId: string;

  workspace: Workspace;

  groupId: string;

  group: Group;

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

  /** OTIMA community fields (ported from main) — only set on the two system rooms. */
  slug: string | null;

  isSystem: boolean;

  membershipLocked: boolean;

  postingMode: 'members' | 'admins_only';

  linkedRoomId: string | null;
}
