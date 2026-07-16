import { GroupType } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';
import { GroupMember } from './group-member.entity';

export interface Group {
  id: string;

  workspaceId: string;

  workspace: Workspace;

  name: string;

  slug: string;

  type: GroupType;

  description: string | null;

  avatarUrl: string | null;

  createdById: string;

  createdBy: User;

  createdAt: Date;

  updatedAt: Date;

  deletedAt: Date | null;

  deletedBy: string | null;

  members: GroupMember[];
}
