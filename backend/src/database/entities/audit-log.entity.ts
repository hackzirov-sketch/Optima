import { Group } from './group.entity';
import { User } from './user.entity';

export interface AuditLog {
  id: string;

  groupId: string | null;

  group: Group | null;

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
