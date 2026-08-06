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

/** One page of audit history, plus the total so a UI can paginate. */
export interface AuditLogPage {
  items: AuditLogRow[];
  total: number;
}

export interface AuditLogRow {
  id: string;
  workspaceId: string | null;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorUsername: string | null;
}

export interface AuditQuery {
  workspaceId?: string | null;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}

/**
 * The single audit trail for the platform: who did what, to which entity, when.
 *
 * `audit_logs` had a migration and an entity but nothing ever wrote to it, and
 * even once writes existed nothing could read them — a log nobody can open is
 * not a log. `list()` is the read side, and it is what makes the workspace
 * activity feed and a room's change history the same query with a different
 * filter.
 *
 * Writes are intentionally failure-tolerant: a broken audit insert must never
 * roll back the mutation it describes, so `log()` swallows its own errors and
 * callers need not await it inside their transaction.
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

  /**
   * Reads history back. Every filter is optional and composes, so the same
   * method serves "this workspace's activity", "this room's change history"
   * and "what has this person been doing" — the three questions an audit trail
   * exists to answer.
   *
   * Authorisation lives with the caller: this class has no idea who may see a
   * given workspace, and guessing would put a second, weaker copy of the
   * permission rules here.
   */
  async list(query: AuditQuery = {}): Promise<AuditLogPage> {
    const where: string[] = [];
    const params: unknown[] = [];

    const add = (clause: string, value: unknown) => {
      params.push(value);
      where.push(clause.replace('$?', `$${params.length}`));
    };

    // `workspaceId: null` is a real filter (platform-level rows), distinct
    // from the key being absent, which means "any workspace".
    if (query.workspaceId === null) where.push('a.workspace_id IS NULL');
    else if (query.workspaceId) add('a.workspace_id = $?', query.workspaceId);
    if (query.entityType) add('a.entity_type = $?', query.entityType);
    if (query.entityId) add('a.entity_id = $?', query.entityId);
    if (query.actorId) add('a.actor_id = $?', query.actorId);
    if (query.action) add('a.action = $?', query.action);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const offset = Math.max(query.offset ?? 0, 0);

    const [{ total }] = await this.dataSource.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM audit_logs a ${whereSql}`,
      params,
    );

    params.push(limit, offset);
    const items = await this.dataSource.query<AuditLogRow>(
      `SELECT a.id, a.workspace_id AS "workspaceId", a.actor_id AS "actorId",
              a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
              a.old_value AS "oldValue", a.new_value AS "newValue",
              a.ip_address::text AS "ipAddress", a.created_at AS "createdAt",
              u.first_name AS "actorFirstName", u.last_name AS "actorLastName",
              u.username AS "actorUsername"
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_id
         ${whereSql}
        ORDER BY a.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { items, total };
  }
}
