import { Workspace } from './workspace.entity';
import { User } from './user.entity';

export interface AuditLog {
  id: string;

  workspaceId: string | null;

  workspace: Workspace;

  actorId: string | null;

  actor: User;

  action: string;

  entityType: string | null;

  entityId: string | null;

  oldValue: any;

  newValue: any;

  ipAddress: string | null;

  userAgent: string | null;

  createdAt: Date;
}
