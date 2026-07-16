import { WorkspaceRole } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export interface WorkspaceMember {
  id: string;

  workspaceId: string;

  workspace: Workspace;

  userId: string;

  user: User;

  role: WorkspaceRole;

  joinedAt: Date;

  createdAt: Date;

  updatedAt: Date;
}
