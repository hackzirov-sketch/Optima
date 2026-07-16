import { WorkspaceVisibility } from '../../common/enums';
import { User } from './user.entity';
import { WorkspaceMember } from './workspace-member.entity';

export interface Workspace {
  id: string;

  ownerId: string;

  owner: User;

  name: string;

  slug: string;

  description: string | null;

  avatarUrl: string | null;

  visibility: WorkspaceVisibility;

  maxMembers: number;

  maxProjects: number;

  createdAt: Date;

  updatedAt: Date;

  deletedAt: Date | null;

  deletedBy: string | null;

  // Relations
  members: WorkspaceMember[];
}
