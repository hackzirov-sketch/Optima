import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceRole } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { isActiveEntity, isSoftDeleted } from '../../common/utils/soft-delete';
import { PermissionService } from '../../common/services/permission.service';
import { AuditService } from '../../common/services/audit.service';
import { WORKSPACE_COLUMNS_SQL, WORKSPACE_COLUMNS_SQL_W, WORKSPACE_MEMBER_COLUMNS_SQL } from './workspaces.sql';
import { buildUpdateSet, normalizeReturning } from '../../common/utils/sql.util';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly permission: PermissionService,
    private readonly audit: AuditService,
  ) {}

  private async getMember(workspaceId: string, userId: string): Promise<WorkspaceMember> {
    const rows: WorkspaceMember[] = await this.dataSource.query(
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

  async create(userId: string, dto: CreateWorkspaceDto): Promise<Workspace> {
    const existing = await this.dataSource.query(`SELECT id FROM workspaces WHERE slug = $1`, [dto.slug]);
    if (existing[0]) {
      throw new ConflictException({
        code: ErrorCode.WORKSPACE_SLUG_TAKEN,
        message: 'Workspace slug is already taken',
      });
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const savedWorkspaceRows: Workspace[] = await queryRunner.query(
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
      await queryRunner.query(
        `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)`,
        [savedWorkspace.id, userId, WorkspaceRole.OWNER],
      );

      await queryRunner.commitTransaction();
      return savedWorkspace;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to create workspace', error instanceof Error ? error.stack : error);
      throw new InternalServerErrorException({ code: ErrorCode.INTERNAL_ERROR, message: 'Failed to create workspace' });
    } finally {
      await queryRunner.release();
    }
  }

  async findAllForUser(userId: string): Promise<Workspace[]> {
    // Find all workspaces where the user is a member
    const rows: Workspace[] = await this.dataSource.query(
      `SELECT ${WORKSPACE_COLUMNS_SQL_W}
       FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1`,
      [userId],
    );
    return rows.filter((ws) => ws && !isSoftDeleted(ws));
  }

  async findById(id: string): Promise<Workspace> {
    const rows: Workspace[] = await this.dataSource.query(
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
    const rows: Workspace[] = await this.dataSource.query(
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
      throw new ForbiddenException({ code: ErrorCode.WORKSPACE_ACCESS_DENIED, message: 'Access denied to this workspace' });
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
      const existing = await this.dataSource.query(`SELECT id FROM workspaces WHERE slug = $1`, [dto.slug]);
      if (existing[0]) {
        throw new ConflictException({
          code: ErrorCode.WORKSPACE_SLUG_TAKEN,
          message: 'Workspace slug is already taken',
        });
      }
    }

    const { setClause, values } = buildUpdateSet(dto as Record<string, unknown>, 2, {
      visibility: 'workspaces_visibility_enum',
    });
    if (!setClause) return workspace;
    const rows: Workspace[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE workspaces SET ${setClause} WHERE id = $1 RETURNING ${WORKSPACE_COLUMNS_SQL}`,
        [id, ...values],
      ),
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
    const currentOwnerMember = await this.getMember(workspaceId, currentOwnerId);

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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(
        `UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, currentOwnerId, WorkspaceRole.ADMIN],
      );
      await queryRunner.query(
        `UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2`,
        [workspaceId, newOwnerUserId, WorkspaceRole.OWNER],
      );
      const savedRows: Workspace[] = normalizeReturning(
        await queryRunner.query(
          `UPDATE workspaces SET owner_id = $2 WHERE id = $1 RETURNING ${WORKSPACE_COLUMNS_SQL}`,
          [workspaceId, newOwnerUserId],
        ),
      );

      await queryRunner.commitTransaction();
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
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to transfer ownership',
      });
    } finally {
      await queryRunner.release();
    }
  }
}
