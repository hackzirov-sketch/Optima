import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export interface Tag {
  id: string;

  workspaceId: string;

  workspace: Workspace;

  name: string;

  color: string;

  createdById: string;

  createdBy: User;

  createdAt: Date;
}
