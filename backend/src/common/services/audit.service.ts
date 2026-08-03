import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export interface AuditLogEntry {
  workspaceId?: string | null;
  actorId: string;
  action: string; // e.g. 'workspace.deleted', 'member.role_changed'
  entityType?: string;
  entityId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * `audit_logs` had a migration + entity but was never written to or read
 * from anywhere in the codebase — dead schema. This wires up writes for the
 * genuinely destructive/sensitive actions (workspace delete, role changes,
 * member removal, project delete). Intentionally fire-and-forget-safe: a
 * failed audit write should never block the actual mutation, so callers
 * should not `await` this inline with the primary transaction, or should
 * wrap it in try/catch if they do.
 */
@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DatabaseService) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO audit_logs
           (workspace_id, actor_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          entry.workspaceId ?? null,
          entry.actorId,
          entry.action,
          entry.entityType ?? null,
          entry.entityId ?? null,
          entry.oldValue ?? null,
          entry.newValue ?? null,
          entry.ipAddress ?? null,
          entry.userAgent ?? null,
        ],
      );
    } catch {
      // Audit logging must never break the caller's actual operation.
    }
  }
}
