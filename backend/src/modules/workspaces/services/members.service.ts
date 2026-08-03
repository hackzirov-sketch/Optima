import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { UpdateMemberRoleDto } from '../schemas/update-member-role.schema';
import { WorkspaceRole } from '../../../common/enums';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { PermissionService } from '../../../common/services/permission.service';
import { AuditService } from '../../../common/services/audit.service';
import { ROLE_LEVEL } from '../../../common/constants/role-levels';
import { WORKSPACE_MEMBER_COLUMNS_SQL } from '../repositories/workspaces.sql';
import { normalizeReturning } from '../../../common/utils/sql.util';

@Injectable()
export class MembersService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly permission: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember> {
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

  async findAll(workspaceId: string, requesterId: string): Promise<any[]> {
    const requester = await this.dataSource.query(
      `SELECT id FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, requesterId],
    );
    if (!requester[0]) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'You are not a member of this workspace',
      });
    }

    const rows: any[] = await this.dataSource.query(
      `SELECT
         wm.id AS "id", wm.workspace_id AS "workspaceId", wm.user_id AS "userId",
         wm.role, wm.joined_at AS "joinedAt", wm.created_at AS "createdAt",
         wm.updated_at AS "updatedAt",
         u.id AS "u_id", u.public_id AS "u_publicId", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
         u.username AS "u_username", u.email AS "u_email", u.avatar_url AS "u_avatarUrl",
         u.last_seen AS "u_lastSeen"
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1`,
      [workspaceId],
    );

    return rows.map((row) => this.mapWithUser(row));
  }

  private mapWithUser(row: any) {
    const {
      u_id,
      u_publicId,
      u_firstName,
      u_lastName,
      u_username,
      u_email,
      u_avatarUrl,
      u_lastSeen,
      ...member
    } = row;
    return {
      ...member,
      user: {
        id: u_id,
        publicId: u_publicId,
        firstName: u_firstName,
        lastName: u_lastName,
        username: u_username,
        email: u_email,
        avatarUrl: u_avatarUrl,
        lastSeen: u_lastSeen,
      },
    };
  }

  async findOne(workspaceId: string, userId: string): Promise<any> {
    const rows: any[] = await this.dataSource.query(
      `SELECT
         wm.id AS "id", wm.workspace_id AS "workspaceId", wm.user_id AS "userId",
         wm.role, wm.joined_at AS "joinedAt", wm.created_at AS "createdAt",
         wm.updated_at AS "updatedAt",
         u.id AS "u_id", u.first_name AS "u_firstName", u.last_name AS "u_lastName",
         u.username AS "u_username", u.email AS "u_email", u.avatar_url AS "u_avatarUrl",
         u.last_seen AS "u_lastSeen"
       FROM workspace_members wm
       JOIN users u ON u.id = wm.user_id
       WHERE wm.workspace_id = $1 AND wm.user_id = $2`,
      [workspaceId, userId],
    );

    if (!rows[0]) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Member not found in this workspace',
      });
    }

    return this.mapWithUser(rows[0]);
  }

  async updateRole(
    workspaceId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
    requesterId: string,
  ): Promise<WorkspaceMember> {
    const workspaceRows: Array<{ id: string; ownerId: string }> =
      await this.dataSource.query(
        `SELECT id, owner_id AS "ownerId" FROM workspaces WHERE id = $1`,
        [workspaceId],
      );
    const workspace = workspaceRows[0];
    if (!workspace)
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });

    const requesterRows: WorkspaceMember[] = await this.dataSource.query(
      `SELECT ${WORKSPACE_MEMBER_COLUMNS_SQL} FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, requesterId],
    );
    const requester = requesterRows[0];
    if (!requester) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Requester not found in workspace',
      });
    }

    // Must be ADMIN or OWNER; ADMIN can only assign ≤ LEAD
    this.permission.assertCanChangeRoleTo(requester, dto.role);

    // Workspace billing owner's role cannot be changed by anyone else
    if (workspace.ownerId === targetUserId && requesterId !== targetUserId) {
      throw new ConflictException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Cannot change the role of the workspace owner',
      });
    }

    // Prevent self-promotion: cannot assign yourself a role higher than your own
    if (
      requesterId === targetUserId &&
      requester.role !== WorkspaceRole.OWNER
    ) {
      if (ROLE_LEVEL[dto.role] > ROLE_LEVEL[requester.role]) {
        throw new ForbiddenException({
          code: ErrorCode.INSUFFICIENT_PERMISSIONS,
          message: 'Cannot promote yourself',
        });
      }
    }

    const memberRows: WorkspaceMember[] = await this.dataSource.query(
      `SELECT ${WORKSPACE_MEMBER_COLUMNS_SQL} FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, targetUserId],
    );
    const member = memberRows[0];
    if (!member) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Member not found in this workspace',
      });
    }
    const oldRole = member.role;

    const savedRows: WorkspaceMember[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE workspace_members SET role = $2 WHERE workspace_id = $1 AND user_id = $3
         RETURNING ${WORKSPACE_MEMBER_COLUMNS_SQL}`,
        [workspaceId, dto.role, targetUserId],
      ),
    );
    const saved = savedRows[0];

    await this.audit.log({
      workspaceId,
      actorId: requesterId,
      action: 'member.role_changed',
      entityType: 'workspace_member',
      entityId: targetUserId,
      oldValue: { role: oldRole },
      newValue: { role: dto.role },
    });
    return saved;
  }

  async remove(
    workspaceId: string,
    targetUserId: string,
    requesterId: string,
  ): Promise<void> {
    const workspaceRows: Array<{ id: string; ownerId: string }> =
      await this.dataSource.query(
        `SELECT id, owner_id AS "ownerId" FROM workspaces WHERE id = $1`,
        [workspaceId],
      );
    const workspace = workspaceRows[0];
    if (!workspace)
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });

    const requesterRows: WorkspaceMember[] = await this.dataSource.query(
      `SELECT ${WORKSPACE_MEMBER_COLUMNS_SQL} FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, requesterId],
    );
    const requester = requesterRows[0];
    if (!requester) {
      throw new NotFoundException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Requester not found in workspace',
      });
    }

    // User can remove themselves (leave); otherwise must be ADMIN or OWNER
    if (requesterId !== targetUserId) {
      this.permission.assertCanManageWorkspace(requester);
    }

    if (workspace.ownerId === targetUserId) {
      throw new ConflictException({
        code: ErrorCode.CANNOT_REMOVE_OWNER,
        message: 'The workspace owner cannot be removed',
      });
    }

    const memberRows: WorkspaceMember[] = await this.dataSource.query(
      `SELECT ${WORKSPACE_MEMBER_COLUMNS_SQL} FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, targetUserId],
    );
    const member = memberRows[0];
    if (!member) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Member not found in this workspace',
      });
    }

    await this.dataSource.query(
      `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, targetUserId],
    );

    await this.audit.log({
      workspaceId,
      actorId: requesterId,
      action: requesterId === targetUserId ? 'member.left' : 'member.removed',
      entityType: 'workspace_member',
      entityId: targetUserId,
      oldValue: { role: member.role },
    });
  }
}
