import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { Group } from '../../../database/entities/group.entity';
import { GroupMember } from '../../../database/entities/group-member.entity';
import { CreateGroupDto } from '../schemas/create-group.schema';
import { UpdateGroupDto } from '../schemas/update-group.schema';
import { MemberRole } from '../../../common/enums';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import {
  isActiveEntity,
  isSoftDeleted,
} from '../../../common/utils/soft-delete';
import { PermissionService } from '../../../common/services/permission.service';
import { AuditService } from '../../../common/services/audit.service';
import { MembersService } from './members.service';
import {
  GROUP_COLUMNS_SQL,
  GROUP_COLUMNS_SQL_W,
  GROUP_MEMBER_COLUMNS_SQL,
} from '../repositories/groups.sql';
import { buildUpdateSet } from '../../../common/utils/sql.util';

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    private readonly dataSource: DatabaseService,
    private readonly permission: PermissionService,
    private readonly audit: AuditService,
    private readonly members: MembersService,
  ) {}

  private async getMember(
    groupId: string,
    userId: string,
  ): Promise<GroupMember> {
    const rows = await this.dataSource.query<GroupMember>(
      `SELECT ${GROUP_MEMBER_COLUMNS_SQL} FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (!rows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_MEMBER,
        message: 'Not a group member',
      });
    }
    return rows[0];
  }

  /** Verifies the user belongs to the group — throws ForbiddenException otherwise. */
  async assertMembership(groupId: string, userId: string): Promise<void> {
    await this.getMember(groupId, userId);
  }

  async create(userId: string, dto: CreateGroupDto): Promise<Group> {
    const existing = await this.dataSource.query(
      `SELECT id FROM groups WHERE slug = $1`,
      [dto.slug],
    );
    if (existing[0]) {
      throw new ConflictException({
        code: ErrorCode.GROUP_SLUG_TAKEN,
        message: 'Group slug is already taken',
      });
    }

    try {
      return await this.dataSource.withTransaction(async (query) => {
        const savedGroupRows: Group[] = await query(
          `INSERT INTO groups (owner_id, name, slug, description, visibility, max_members, max_projects, created_by)
           VALUES ($1, $2, $3, $4, COALESCE($5, 'private')::groups_visibility_enum, COALESCE($6, 10), COALESCE($7, 20), $1)
           RETURNING ${GROUP_COLUMNS_SQL}`,
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
        const savedGroup = savedGroupRows[0];

        // Add owner as a member with OWNER role
        await query(
          `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)`,
          [savedGroup.id, userId, MemberRole.OWNER],
        );

        // Create default #general group channel. Marked is_public so new
        // members auto-join it (see invitations.service.ts) — chat_rooms no
        // longer has a `type` column, so "the group-wide channel" is
        // identified as: this group, not scoped to a group/project, public.
        const savedRoomRows: Array<{ id: string }> = await query(
          `INSERT INTO chat_rooms (group_id, name, is_public, created_by) VALUES ($1, $2, true, $3) RETURNING id`,
          [savedGroup.id, 'general', userId],
        );

        // Add owner to the channel
        await query(
          `INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2)`,
          [savedRoomRows[0].id, userId],
        );

        return savedGroup;
      });
    } catch (error) {
      this.logger.error(
        'Failed to create group',
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to create group',
      });
    }
  }

  async findAllForUser(userId: string): Promise<Group[]> {
    // Find all groups where the user is a member
    const rows = await this.dataSource.query<Group>(
      `SELECT ${GROUP_COLUMNS_SQL_W}
       FROM group_members wm
       JOIN groups w ON w.id = wm.group_id
       WHERE wm.user_id = $1`,
      [userId],
    );
    return rows.filter((ws) => ws && !isSoftDeleted(ws));
  }

  async findById(id: string): Promise<Group> {
    const rows = await this.dataSource.query<Group>(
      `SELECT ${GROUP_COLUMNS_SQL} FROM groups WHERE id = $1`,
      [id],
    );
    const group = rows[0] ?? null;
    if (!isActiveEntity(group)) {
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Group not found',
      });
    }
    return group;
  }

  async findBySlug(slug: string, userId: string): Promise<Group> {
    const rows = await this.dataSource.query<Group>(
      `SELECT ${GROUP_COLUMNS_SQL} FROM groups WHERE slug = $1`,
      [slug],
    );
    const group = rows[0] ?? null;
    if (!isActiveEntity(group)) {
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Group not found',
      });
    }
    // Ensure requesting user is actually a member of this group
    const memberRows = await this.dataSource.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [group.id, userId],
    );
    if (!memberRows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.GROUP_ACCESS_DENIED,
        message: 'Access denied to this group',
      });
    }
    return group;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateGroupDto,
  ): Promise<Group> {
    const group = await this.findById(id);
    const member = await this.getMember(id, userId);
    this.permission.assertCanManageGroup(member);

    if (dto.slug && dto.slug !== group.slug) {
      const existing = await this.dataSource.query(
        `SELECT id FROM groups WHERE slug = $1`,
        [dto.slug],
      );
      if (existing[0]) {
        throw new ConflictException({
          code: ErrorCode.GROUP_SLUG_TAKEN,
          message: 'Group slug is already taken',
        });
      }
    }

    const { setClause, values } = buildUpdateSet(
      dto as Record<string, unknown>,
      2,
      {
        visibility: 'groups_visibility_enum',
      },
    );
    if (!setClause) return group;
    const rows: Group[] = await this.dataSource.query(
      `UPDATE groups SET ${setClause} WHERE id = $1 RETURNING ${GROUP_COLUMNS_SQL}`,
      [id, ...values],
    );
    return rows[0];
  }

  /** Soft-delete group. Only role === OWNER (access control via PermissionService, not ownerId). */
  async remove(id: string, userId: string): Promise<void> {
    const group = await this.findById(id);
    const member = await this.getMember(id, userId);
    this.permission.assertCanDeleteGroup(member);

    await this.dataSource.query(
      `UPDATE groups SET deleted_at = now(), deleted_by = $2 WHERE id = $1`,
      [id, userId],
    );
    await this.audit.log({
      groupId: id,
      actorId: userId,
      action: 'group.deleted',
      entityType: 'group',
      entityId: id,
      oldValue: { name: group.name },
    });
  }

  /**
   * Transfer group ownership to another member.
   * Invariant: there is always exactly one OWNER.
   * 1. Only the current OWNER can initiate the transfer.
   * 2. Single DB transaction: old OWNER → ADMIN, new member → OWNER, group.ownerId updated (audit only).
   */
  async transferOwnership(
    groupId: string,
    currentOwnerId: string,
    newOwnerUserId: string,
  ): Promise<Group> {
    await this.findById(groupId);
    const currentOwnerMember = await this.getMember(
      groupId,
      currentOwnerId,
    );

    if (currentOwnerMember.role !== MemberRole.OWNER) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_OWNER,
        message: 'Only the current group owner can transfer ownership',
      });
    }

    if (newOwnerUserId === currentOwnerId) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'New owner must be a different member',
      });
    }

    const newOwnerRows = await this.dataSource.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, newOwnerUserId],
    );
    if (!newOwnerRows[0]) {
      throw new NotFoundException({
        code: ErrorCode.MEMBER_NOT_FOUND,
        message: 'Target user is not a member of this group',
      });
    }

    try {
      const savedRows: Group[] = await this.dataSource.withTransaction(
        async (query) => {
          await query(
            `UPDATE group_members SET role = $3 WHERE group_id = $1 AND user_id = $2`,
            [groupId, currentOwnerId, MemberRole.ADMIN],
          );
          await query(
            `UPDATE group_members SET role = $3 WHERE group_id = $1 AND user_id = $2`,
            [groupId, newOwnerUserId, MemberRole.OWNER],
          );
          return await query(
            `UPDATE groups SET owner_id = $2 WHERE id = $1 RETURNING ${GROUP_COLUMNS_SQL}`,
            [groupId, newOwnerUserId],
          );
        },
      );

      // Both rows changed role, so both cached memberships are stale — the
      // outgoing owner is now an admin and the incoming one is the owner.
      await this.members.invalidateMember(
        groupId,
        currentOwnerId,
        newOwnerUserId,
      );

      await this.audit.log({
        groupId,
        actorId: currentOwnerId,
        action: 'group.ownership_transferred',
        entityType: 'group',
        entityId: groupId,
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
