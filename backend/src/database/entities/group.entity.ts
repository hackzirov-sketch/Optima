import { GroupType, GroupVisibility } from '../../common/enums';
import { User } from './user.entity';
import { GroupMember } from './group-member.entity';

/**
 * Group is the top-level ownership/tenant container in the platform
 * (previously "Group"). Every project, task, chat room, repository,
 * tag, earning record, etc. is scoped to a Group. There is no broader
 * container above it.
 */
export interface Group {
  id: string;

  ownerId: string;

  owner: User;

  name: string;

  slug: string;

  type: GroupType;

  description: string | null;

  avatarUrl: string | null;

  visibility: GroupVisibility;

  maxMembers: number;

  maxProjects: number;

  createdById: string;

  createdBy: User;

  createdAt: Date;

  updatedAt: Date;

  deletedAt: Date | null;

  deletedBy: string | null;

  // Relations
  members: GroupMember[];
}
