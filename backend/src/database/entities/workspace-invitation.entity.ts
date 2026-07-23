import { WorkspaceRole } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export interface WorkspaceInvitation {
  id: string;

  workspaceId: string;

  workspace: Workspace;

  invitedById: string;

  invitedBy: User;

  email: string;

  role: WorkspaceRole;

  token: string;

  expiresAt: Date;

  acceptedAt: Date | null;

  declinedAt: Date | null;

  createdAt: Date;
}
