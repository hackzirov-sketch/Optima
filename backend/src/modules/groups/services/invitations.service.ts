import {
  Injectable,
  Logger,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { GroupInvitation } from '../../../database/entities/group-invitation.entity';
import { InviteMemberDto } from '../schemas/invite-member.schema';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { MailService } from '../../mail/mail.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '../../../common/enums';
import { PermissionService } from '../../../common/services/permission.service';
import { MembersService } from './members.service';
import * as crypto from 'crypto';
import {
  GROUP_INVITATION_COLUMNS_SQL,
  GROUP_MEMBER_COLUMNS_SQL,
} from '../repositories/groups.sql';

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly dataSource: DatabaseService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly permission: PermissionService,
    private readonly members: MembersService,
  ) {}

  async create(
    groupId: string,
    inviterId: string,
    dto: InviteMemberDto,
  ): Promise<GroupInvitation> {
    const groupRows = await this.dataSource.query<{
      id: string;
      name: string;
    }>(`SELECT id, name FROM groups WHERE id = $1`, [groupId]);
    const group = groupRows[0];
    if (!group)
      throw new NotFoundException({
        code: ErrorCode.GROUP_NOT_FOUND,
        message: 'Group not found',
      });

    const inviterRows = await this.dataSource.query(
      `SELECT ${GROUP_MEMBER_COLUMNS_SQL} FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, inviterId],
    );
    const inviter = inviterRows[0];
    if (!inviter)
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_MEMBER,
        message: 'Not a group member',
      });
    this.permission.assertCanManageGroup(inviter);

    const existingUserRows = await this.dataSource.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`,
      [dto.email],
    );
    const existingUser = existingUserRows[0] ?? null;
    if (existingUser) {
      const alreadyMemberRows = await this.dataSource.query(
        `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [groupId, existingUser.id],
      );
      if (alreadyMemberRows[0]) {
        throw new ConflictException({
          code: ErrorCode.ALREADY_MEMBER,
          message: 'User is already a member of this group',
        });
      }
    }

    const existingInviteRows = await this.dataSource.query<GroupInvitation>(
      `SELECT ${GROUP_INVITATION_COLUMNS_SQL} FROM group_invitations
       WHERE group_id = $1 AND email = $2 AND accepted_at IS NULL AND declined_at IS NULL`,
      [groupId, dto.email],
    );
    const existingInvite = existingInviteRows[0];

    if (existingInvite && existingInvite.expiresAt > new Date()) {
      // Already invited
      return existingInvite;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 5); // 5 days

    const savedRows = await this.dataSource.query<GroupInvitation>(
      `INSERT INTO group_invitations (group_id, invited_by, email, role, token, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${GROUP_INVITATION_COLUMNS_SQL}`,
      [groupId, inviterId, dto.email, dto.role, token, expiresAt],
    );
    const saved = savedRows[0];

    // Fire-and-forget: sendInvitationEmail already catches its own errors and
    // just logs on failure, but awaiting it here blocked the whole request
    // (and the client) for up to ~90s whenever the SMTP host was slow or
    // unreachable. The invite is already persisted — email delivery is a
    // side effect, not something the caller should wait on.
    void this.mailService.sendInvitationEmail(dto.email, token, group.name);

    // Real-time notification to invited user (if they have an account)
    if (existingUser) {
      await this.notificationsService.create({
        userId: existingUser.id,
        actorId: inviterId,
        type: NotificationType.GROUP_INVITE,
        title: `You've been invited to "${group.name}"`,
        message: `Accept the invitation to join the group.`,
        entityType: 'group',
        entityId: groupId,
        actionUrl: `/auth/accept-invite?token=${token}`,
      });
    }

    return saved;
  }

  async findAllForGroup(
    groupId: string,
    requesterId: string,
  ): Promise<GroupInvitation[]> {
    const requesterRows = await this.dataSource.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, requesterId],
    );
    if (!requesterRows[0]) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_MEMBER,
        message: 'You are not a member of this group',
      });
    }
    return this.dataSource.query(
      `SELECT ${GROUP_INVITATION_COLUMNS_SQL} FROM group_invitations
       WHERE group_id = $1 ORDER BY created_at DESC`,
      [groupId],
    );
  }

  async accept(token: string, userId: string): Promise<any> {
    const invitationRows = await this.dataSource.query<
      GroupInvitation & { groupName: string }
    >(
      `SELECT i.id, i.group_id AS "groupId", i.email, i.role,
              i.invited_by AS "invitedById", i.token, i.expires_at AS "expiresAt",
              i.accepted_at AS "acceptedAt", i.declined_at AS "declinedAt",
              i.created_at AS "createdAt", w.name AS "groupName"
       FROM group_invitations i
       JOIN groups w ON w.id = i.group_id
       WHERE i.token = $1`,
      [token],
    );

    const invitation = invitationRows[0];
    if (!invitation) {
      throw new NotFoundException({
        code: ErrorCode.INVITATION_NOT_FOUND,
        message: 'Invitation not found',
      });
    }

    if (invitation.acceptedAt) {
      throw new ConflictException({
        code: ErrorCode.INVITATION_ALREADY_ACCEPTED,
        message: 'Invitation already accepted',
      });
    }

    if (invitation.expiresAt < new Date()) {
      throw new ConflictException({
        code: ErrorCode.INVITATION_EXPIRED,
        message: 'Invitation has expired',
      });
    }

    const userRows = await this.dataSource.query<{
      id: string;
      email: string;
      firstName: string;
      lastName: string;
    }>(
      `SELECT id, email, first_name AS "firstName", last_name AS "lastName" FROM users WHERE id = $1`,
      [userId],
    );
    const user = userRows[0];
    if (!user || user.email !== invitation.email) {
      throw new ConflictException({
        code: ErrorCode.INVITATION_EMAIL_MISMATCH,
        message: 'Invitation email does not match user email',
      });
    }

    const alreadyMemberRows = await this.dataSource.query(
      `SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [invitation.groupId, userId],
    );
    if (alreadyMemberRows[0]) {
      throw new ConflictException({
        code: ErrorCode.ALREADY_MEMBER,
        message: 'User is already a member',
      });
    }

    try {
      const savedMember = await this.dataSource.withTransaction(
        async (query) => {
          await query(
            `UPDATE group_invitations SET accepted_at = now() WHERE id = $1`,
            [invitation.id],
          );

          const savedMemberRows: any[] = await query(
            `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3)
           RETURNING ${GROUP_MEMBER_COLUMNS_SQL}`,
            [invitation.groupId, userId, invitation.role],
          );
          const savedMember = savedMemberRows[0];

          // Auto-join all group-wide public channels (e.g. #general). A room
          // no longer has a `type`; "group-wide" is: belongs to this
          // group, not scoped to a specific group/project, and public.
          const wsRooms: Array<{ id: string }> = await query(
            `SELECT id FROM chat_rooms
           WHERE group_id = $1 AND group_id IS NULL AND project_id IS NULL AND is_public = true`,
            [invitation.groupId],
          );
          for (const room of wsRooms) {
            await query(
              `INSERT INTO chat_members (room_id, user_id)
             SELECT $1, $2 WHERE NOT EXISTS (
               SELECT 1 FROM chat_members WHERE room_id = $1 AND user_id = $2
             )`,
              [room.id, userId],
            );
          }

          return savedMember;
        },
      );

      // The invitee may have had a cached "not a member" outcome from a
      // previous attempt; more importantly, they are about to make their first
      // authenticated requests against this group.
      await this.members.invalidateMember(invitation.groupId, userId);

      // Notify the inviter that the invitation was accepted
      if (invitation.invitedById && invitation.invitedById !== userId) {
        const userName =
          `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
        await this.notificationsService.create({
          userId: invitation.invitedById,
          actorId: userId,
          type: NotificationType.GROUP_INVITE,
          title: `${userName} accepted your invitation`,
          message: `They joined "${invitation.groupName}".`,
          entityType: 'group',
          entityId: invitation.groupId,
          actionUrl: `/app/teams`,
        });
      }

      return savedMember;
    } catch (error) {
      this.logger.error('Failed to accept invitation', (error as Error)?.stack);
      throw new InternalServerErrorException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Failed to accept invitation',
      });
    }
  }

  async decline(token: string, userId: string): Promise<void> {
    const invitationRows = await this.dataSource.query<GroupInvitation>(
      `SELECT ${GROUP_INVITATION_COLUMNS_SQL} FROM group_invitations WHERE token = $1`,
      [token],
    );
    const invitation = invitationRows[0];
    if (!invitation) {
      throw new NotFoundException({
        code: ErrorCode.INVITATION_NOT_FOUND,
        message: 'Invitation not found',
      });
    }

    const userRows = await this.dataSource.query<{ email: string }>(
      `SELECT email FROM users WHERE id = $1`,
      [userId],
    );
    const user = userRows[0];
    if (!user || user.email !== invitation.email) {
      throw new ConflictException({
        code: ErrorCode.INVITATION_EMAIL_MISMATCH,
        message: 'Invitation email does not match user email',
      });
    }

    await this.dataSource.query(
      `UPDATE group_invitations SET declined_at = now() WHERE id = $1`,
      [invitation.id],
    );
  }

  async remove(
    groupId: string,
    id: string,
    requesterId: string,
  ): Promise<void> {
    const inviterRows = await this.dataSource.query(
      `SELECT ${GROUP_MEMBER_COLUMNS_SQL} FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, requesterId],
    );
    const inviter = inviterRows[0];
    if (!inviter)
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_MEMBER,
        message: 'Not a group member',
      });
    this.permission.assertCanManageGroup(inviter);

    const invitationRows = await this.dataSource.query(
      `SELECT id FROM group_invitations WHERE id = $1 AND group_id = $2`,
      [id, groupId],
    );
    if (!invitationRows[0])
      throw new NotFoundException({
        code: ErrorCode.INVITATION_NOT_FOUND,
        message: 'Invitation not found',
      });

    await this.dataSource.query(
      `DELETE FROM group_invitations WHERE id = $1`,
      [id],
    );
  }
}
