import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

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
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          workspaceId: entry.workspaceId ?? null,
          actorId: entry.actorId,
          action: entry.action,
          entityType: entry.entityType ?? null,
          entityId: entry.entityId ?? null,
          oldValue: entry.oldValue ?? null,
          newValue: entry.newValue ?? null,
          ipAddress: entry.ipAddress ?? null,
          userAgent: entry.userAgent ?? null,
        }),
      );
    } catch {
      // Audit logging must never break the caller's actual operation.
    }
  }
}
