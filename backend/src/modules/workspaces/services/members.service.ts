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
import { RedisService } from '../../../redis/redis.service';
import { RedisKeys } from '../../../redis/redis.keys';

/**
 * What assertMember caches. Only the fields an authorization decision reads —
 * see RedisKeys.workspaceMember for why it is deliberately narrow.
 */
export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
}

/**
 * Short enough that a missed invalidation is a blip rather than an outage,
 * long enough to absorb the burst of calls a single page load makes.
 */
const MEMBERSHIP_TTL_SECONDS = 120;

@Injectable()
export class MembersService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly permission: PermissionService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
  ) {}

  /**
   * The most-called query in the application: 20-odd call sites gate on it,
   * so nearly every workspace-scoped request paid for it.
   *
   * Only positive results are cached. Negative caching would save a query on
   * requests that are about to be rejected anyway — throttling already covers
   * that — at the cost of a window where a just-invited member is still told
   * "not a member", which is a support ticket rather than a saved millisecond.
   */
  async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMembership> {
    const key = RedisKeys.workspaceMember(workspaceId, userId);
    const cached = await this.redis.getJson<WorkspaceMembership>(key);
    if (cached) return cached;

    const rows = await this.dataSource.query<WorkspaceMembership>(
      `SELECT id, workspace_id AS "workspaceId", user_id AS "userId", role
       FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    if (!rows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Not a workspace member',
      });
    }
    await this.redis.setJson(key, rows[0], MEMBERSHIP_TTL_SECONDS);
    return rows[0];
  }

  /**
   * Drops the cached membership for one or more users in a workspace.
   *
   * Must be called by every write that changes who is a member or what role
   * they hold. The cache this clears used to exist only inside TasksService
   * and was never invalidated at all, so a removed member kept working
   * against the tasks API for the full five minutes of its TTL — the reason
   * that cache now lives here, next to the writes.
   */
  async invalidateMember(
    workspaceId: string,
    ...userIds: string[]
  ): Promise<void> {
    await this.redis.drop(
      ...userIds.map((id) => RedisKeys.workspaceMember(workspaceId, id)),
    );
  }

  async findAll(workspaceId: string, requesterId: string): Promise<any[]> {
    const requester = await this.dataSource.query<{ role: WorkspaceRole }>(
      `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, requesterId],
    );
    if (!requester[0]) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'You are not a member of this workspace',
      });
    }
    // Email addresses are the one field here that isn't already public on a
    // profile, and this endpoint hands back every member at once — so for an
    // ordinary member it is a bulk export of the team's addresses. Managers
    // have a reason to see them (that's who administers the roster); everyone
    // else gets the same view they'd get from a profile page.
    const canSeeEmails = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN].includes(
      requester[0].role,
    );

    const rows = await this.dataSource.query<any>(
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

    return rows.map((row) => this.mapWithUser(row, canSeeEmails));
  }

  private mapWithUser(row: any, includeEmail = true) {
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
        ...(includeEmail ? { email: u_email } : {}),
        avatarUrl: u_avatarUrl,
        lastSeen: u_lastSeen,
      },
    };
  }

  async findOne(workspaceId: string, userId: string): Promise<any> {
    const rows = await this.dataSource.query<any>(
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
    const workspaceRows = await this.dataSource.query<{
      id: string;
      ownerId: string;
    }>(`SELECT id, owner_id AS "ownerId" FROM workspaces WHERE id = $1`, [
      workspaceId,
    ]);
    const workspace = workspaceRows[0];
    if (!workspace)
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });

    const requesterRows = await this.dataSource.query<WorkspaceMember>(
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

    const memberRows = await this.dataSource.query<WorkspaceMember>(
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
    // assertCanChangeRoleTo above only vetted the role being granted. This is
    // the other half: an admin must not be able to reach a peer admin at all.
    this.permission.assertOutranksTarget(requester, member);
    const oldRole = member.role;

    const savedRows: WorkspaceMember[] = await this.dataSource.query(
      `UPDATE workspace_members SET role = $2 WHERE workspace_id = $1 AND user_id = $3
         RETURNING ${WORKSPACE_MEMBER_COLUMNS_SQL}`,
      [workspaceId, dto.role, targetUserId],
    );
    const saved = savedRows[0];
    // Before the audit write, and awaited: until this lands, every guard in
    // the app still sees the old role.
    await this.invalidateMember(workspaceId, targetUserId);

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
    const workspaceRows = await this.dataSource.query<{
      id: string;
      ownerId: string;
    }>(`SELECT id, owner_id AS "ownerId" FROM workspaces WHERE id = $1`, [
      workspaceId,
    ]);
    const workspace = workspaceRows[0];
    if (!workspace)
      throw new NotFoundException({
        code: ErrorCode.WORKSPACE_NOT_FOUND,
        message: 'Workspace not found',
      });

    const requesterRows = await this.dataSource.query<WorkspaceMember>(
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

    const memberRows = await this.dataSource.query<WorkspaceMember>(
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
    // Same rule as updateRole: managing the workspace does not include
    // removing the people who manage it alongside you. Self-removal (leaving)
    // is exempt — assertOutranksTarget returns early when the ids match.
    this.permission.assertOutranksTarget(requester, member);

    await this.dataSource.query(
      `DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, targetUserId],
    );
    await this.invalidateMember(workspaceId, targetUserId);

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
