import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { Workspace } from '../../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { CreateWorkspaceDto } from '../schemas/create-workspace.schema';
import { UpdateWorkspaceDto } from '../schemas/update-workspace.schema';
import { WorkspaceRole } from '../../../common/enums';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import {
  isActiveEntity,
  isSoftDeleted,
} from '../../../common/utils/soft-delete';
import { PermissionService } from '../../../common/services/permission.service';
import { AuditService } from '../../../common/services/audit.service';
import { MembersService } from './members.service';
import {
  WORKSPACE_COLUMNS_SQL,
  WORKSPACE_COLUMNS_SQL_W,
  WORKSPACE_MEMBER_COLUMNS_SQL,
} from '../repositories/workspaces.sql';
import { buildUpdateSet } from '../../../common/utils/sql.util';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly dataSource: DatabaseService,
    private readonly permission: PermissionService,
    private readonly audit: AuditService,
    private readonly members: MembersService,
  ) {}

  private async getMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember> {
    const rows = await this.dataSource.query<WorkspaceMember>(
      `SELECT ${WORKSPACE_MEMBER_COLUMNS_SQL} FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    if (!rows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Not a workspace member',
      });
    }
    return rows[0];
  }

  /** Verifies the user belongs to the workspace — throws ForbiddenException otherwise. */
  async assertMembership(workspaceId: string, userId: string): Promise<void> {
    await this.getMember(workspaceId, userId);
  }

  async create(userId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
    const existing = await this.dataSource.query(
      `SELECT id FROM workspaces WHERE slug = $1`,
      [dto.slug],
    );
    if (existing[0]) {
      throw new ConflictException({
        code: ErrorCode.WORKSPACE_SLUG_TAKEN,
        message: 'Workspace slug is already taken',
      });
    }

    try {
      return await this.dataSource.withTransaction(async (query) => {
        const savedWorkspaceRows: Workspace[] = await query(
          `INSERT INTO workspaces (owner_id, name, slug, description, visibility, max_members, max_projects)
           VALUES ($1, $2, $3, $4, COALESCE($5, 'private')::workspaces_visibility_enum, COALESCE($6, 10), COALESCE($7, 20))
           RETURNING ${WORKSPACE_COLUMNS_SQL}`,
          [
            userId,
            dto.name,
            dto.slug,
            dto.description ?? null,
            dto.visibility ?? null,
            dto.maxMembers ?? null,
            dto.maxProjects ?? null,
          ],
        );
        const savedWorkspace = savedWorkspaceRows[0];

        // Add owner as a member with OWNER role
        await query(
          `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)`,
          [savedWorkspace.id, userId, WorkspaceRole.OWNER],
        );

        // Create default #general workspace channel. Marked is_public so new
        // members auto-join it (see invitations.service.ts) — chat_rooms no
        // longer has a `type` column, so "the workspace-wide channel" is
        // identified as: this workspace, not scoped to a group/project, public.
        const savedRoomRows: Array<{ id: string }> = await query(
          `INSERT INTO chat_rooms (workspace_id, name, is_public, created_by) VALUES ($1, $2, true, $3) RETURNING id`,
          [savedWorkspace.id, 'general', userId],
        );

        // Add owner to the channel
        await query(
          `INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2)`,
          [savedRoomRows[0].id, userId],
        );

        return savedWorkspace;
      });
    } catch (error) {
      this.logger.error(
        'Failed to create workspace',
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to create workspace',
      });
    }
  }

  async findAllForUser(userId: string): Promise<Workspace[]> {
    // Find all workspaces where the user is a member
    const rows = await this.dataSource.query<Workspace>(
      `SELECT ${WORKSPACE_COLUMNS_SQL_W}
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1`,
      [userId],
    );
    return rows.filter((ws) => ws && !isSoftDeleted(ws));
  }

  async findById(id: string): Promise<Workspace> {
    const rows = await this.dataSource.query<Workspace>(
      `SELECT ${WORKSPACE_COLUMNS_SQL} FROM workspaces WHERE id = $1`,
      [id],
    );
    const workspace = rows[0] ?? null;
    if (!isActiveEntity(workspace)) {
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });
    }
    return workspace;
  }

  async findBySlug(slug: string, userId: string): Promise<Workspace> {
    const rows = await this.dataSource.query<Workspace>(
      `SELECT ${WORKSPACE_COLUMNS_SQL} FROM workspaces WHERE slug = $1`,
      [slug],
    );
    const workspace = rows[0] ?? null;
    if (!isActiveEntity(workspace)) {
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });
    }
    // Ensure requesting user is actually a member of this workspace
    const memberRows = await this.dataSource.query(
      `SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspace.id, userId],
    );
    if (!memberRows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.WORKSPACE_ACCESS_DENIED,
        message: 'Access denied to this workspace',
      });
    }
    return workspace;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateWorkspaceDto,
  ): Promise<Workspace> {
    const workspace = await this.findById(id);
    const member = await this.getMember(id, userId);
    this.permission.assertCanManageWorkspace(member);

    if (dto.slug && dto.slug !== workspace.slug) {
      const existing = await this.dataSource.query(
        `SELECT id FROM workspaces WHERE slug = $1`,
        [dto.slug],
      );
      if (existing[0]) {
        throw new ConflictException({
          code: ErrorCode.WORKSPACE_SLUG_TAKEN,
          message: 'Workspace slug is already taken',
        });
      }
    }

    const { setClause, values } = buildUpdateSet(
      dto as Record<string, unknown>,
      2,
      {
        visibility: 'workspaces_visibility_enum',
      },
    );
    if (!setClause) return workspace;
    const rows: Workspace[] = await this.dataSource.query(
      `UPDATE workspaces SET ${setClause} WHERE id = $1 RETURNING ${WORKSPACE_COLUMNS_SQL}`,
      [id, ...values],
    );
    return rows[0];
  }

  /** Soft-delete workspace. Only role === OWNER (access control via PermissionService, not ownerId). */
  async remove(id: string, userId: string): Promise<void> {
    const workspace = await this.findById(id);
    const member = await this.getMember(id, userId);
    this.permission.assertCanDeleteWorkspace(member);

    await this.dataSource.query(
      `UPDATE workspaces SET deleted_at = now(), deleted_by = $2 WHERE id = $1`,
      [id, userId],
    );
    await this.audit.log({
      workspaceId: id,
      actorId: userId,
      action: 'workspace.deleted',
      entityType: 'workspace',
      entityId: id,
      oldValue: { name: workspace.name },
    });
  }

  /**
   * Transfer workspace ownership to another member.
   * Invariant: there is always exactly one OWNER.
   * 1. Only the current OWNER can initiate the transfer.
   * 2. Single DB transaction: old OWNER → ADMIN, new member → OWNER, workspace.ownerId updated (audit only).
   */
  async transferOwnership(
    workspaceId: string,
    currentOwnerId: string,
    newOwnerUserId: string,
  ): Promise<Workspace> {
    await this.findById(workspaceId);
    const currentOwnerMember = await this.getMember(
      workspaceId,
      currentOwnerId,
    );

    if (currentOwnerMember.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_OWNER,
        message: 'Only the current workspace owner can transfer ownership',
      });
    }

    if (newOwnerUserId === currentOwnerId) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'New owner must be a different member',
      });
    }

    const newOwnerRows = await this.dataSource.query(
      `SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, newOwnerUserId],
    );
    if (!newOwnerRows[0]) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Target user is not a member of this workspace',
      });
    }

    try {
      const savedRows: Workspace[] = await this.dataSource.withTransaction(
        async (query) => {
          await query(
            `UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2`,
            [workspaceId, currentOwnerId, WorkspaceRole.ADMIN],
          );
          await query(
            `UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2`,
            [workspaceId, newOwnerUserId, WorkspaceRole.OWNER],
          );
          return await query(
            `UPDATE workspaces SET owner_id = $2 WHERE id = $1 RETURNING ${WORKSPACE_COLUMNS_SQL}`,
            [workspaceId, newOwnerUserId],
          );
        },
      );

      // Both rows changed role, so both cached memberships are stale — the
      // outgoing owner is now an admin and the incoming one is the owner.
      await this.members.invalidateMember(
        workspaceId,
        currentOwnerId,
        newOwnerUserId,
      );

      await this.audit.log({
        workspaceId,
        actorId: currentOwnerId,
        action: 'workspace.ownership_transferred',
        entityType: 'workspace',
        entityId: workspaceId,
        oldValue: { ownerId: currentOwnerId },
        newValue: { ownerId: newOwnerUserId },
      });
      return savedRows[0];
    } catch {
      throw new InternalServerErrorException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to transfer ownership',
      });
    }
  }
}
