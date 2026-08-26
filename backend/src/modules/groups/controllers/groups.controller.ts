import {
  Controller,
  ParseUUIDPipe,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { GroupsService } from '../services/groups.service';
import { MembersService } from '../services/members.service';
import { InvitationsService } from '../services/invitations.service';
import { TagsService } from '../services/tags.service';
import { CreateTagDto } from '../schemas/create-tag.schema';
import { UpdateTagDto } from '../schemas/update-tag.schema';
import { CreateGroupDto } from '../schemas/create-group.schema';
import { UpdateGroupDto } from '../schemas/update-group.schema';
import { InviteMemberDto } from '../schemas/invite-member.schema';
import { UpdateMemberRoleDto } from '../schemas/update-member-role.schema';
import { TransferOwnershipDto } from '../schemas/transfer-ownership.schema';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { TokenService } from '../../auth/services/token.service';
import { UsersService } from '../../users/services/users.service';
import { setAuthCookies } from '../../../common/utils/auth-cookies.util';
import { AuditService } from '../../../common/services/audit.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

@ApiTags('Groups')
@ApiBearerAuth('access-token')
@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly membersService: MembersService,
    private readonly invitationsService: InvitationsService,
    private readonly tagsService: TagsService,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The group activity feed.
   *
   * audit_logs was written to from five places and read from none — a trail
   * nobody can open is not a trail. Restricted to owners and admins: it names
   * who removed whom and who changed which role, which is exactly the record
   * an ordinary member should not be able to browse.
   */
  @Get(':groupId/audit')
  @ApiOperation({ summary: 'Group audit trail — owners and admins only' })
  @ApiParam({ name: 'groupId' })
  async listAudit(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('id') userId: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const member = await this.membersService.assertMember(groupId, userId);
    if (!['owner', 'admin'].includes(member.role))
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Only group owners and admins can read the audit log',
      });
    return this.audit.list({
      groupId,
      action,
      entityType,
      limit: Number(limit) || 50,
      offset: Number(offset) || 0,
    });
  }

  @Post(':groupId/select')
  @ApiOperation({
    summary: 'Set the active group for this session',
    description:
      'Verifies membership, then reissues the access/refresh token pair scoped to this group ' +
      '(embedded as a `groupId` JWT claim) and resets the httpOnly auth cookies. Replaces the old ' +
      'client-side "selected group" localStorage key — the active group now lives in the token itself.',
  })
  async selectGroup(
    @Param('groupId') groupId: string,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.groupsService.assertMembership(groupId, userId);
    const user = await this.usersService.findById(userId);
    const { accessToken, refreshToken, ...rest } =
      await this.tokenService.generateTokens(user, {}, groupId);
    setAuthCookies(res, this.config, { accessToken, refreshToken });
    return { ...rest, groupId: groupId };
  }

  // ── Groups ──────────────────────────────────
  @Post()
  @ApiOperation({ summary: 'Create a new group' })
  createGroup(@CurrentUser('id') userId: string, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all groups for current user' })
  getGroups(@CurrentUser('id') userId: string) {
    return this.groupsService.findAllForUser(userId);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get group by slug' })
  getGroupBySlug(
    @Param('slug') slug: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.groupsService.findBySlug(slug, userId);
  }

  @Patch(':groupId')
  @ApiOperation({ summary: 'Update group settings' })
  updateGroup(
    @Param('groupId') groupId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(groupId, userId, dto);
  }

  @Delete(':groupId')
  @ApiOperation({
    summary: 'Soft-delete group (billing owner only)',
    description:
      'Only the group billing owner (`ownerId`) may delete. Group ADMIN members can update settings but cannot delete the group.',
  })
  deleteGroup(
    @Param('groupId') groupId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.groupsService.remove(groupId, userId);
  }

  @Post(':groupId/transfer-ownership')
  @ApiOperation({
    summary: 'Transfer group ownership to another member',
    description:
      'Only the current OWNER can call this. Old owner becomes ADMIN, target member becomes OWNER. Invariant: exactly one OWNER at all times.',
  })
  transferOwnership(
    @Param('groupId') groupId: string,
    @CurrentUser('id') currentOwnerId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.groupsService.transferOwnership(
      groupId,
      currentOwnerId,
      dto.newOwnerUserId,
    );
  }

  // ── Members ─────────────────────────────────────
  @Get(':groupId/members')
  @ApiOperation({ summary: 'Get group members' })
  getMembers(
    @Param('groupId') groupId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.membersService.findAll(groupId, userId);
  }

  @Patch(':groupId/members/:userId')
  @ApiOperation({ summary: 'Update member role' })
  updateMemberRole(
    @Param('groupId') groupId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('id') requesterId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membersService.updateRole(
      groupId,
      targetUserId,
      dto,
      requesterId,
    );
  }

  @Delete(':groupId/members/:userId')
  @ApiOperation({ summary: 'Remove a member from group' })
  removeMember(
    @Param('groupId') groupId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.membersService.remove(groupId, targetUserId, requesterId);
  }

  // ── Invitations (group-scoped) ──────────────
  // NOTE: accept/decline routelari InvitationsController ga ko'chirilgan
  //       → /invitations/:token/accept  va  /invitations/:token/decline
  //       Sabab: bu yerda edi /groups/invitations/:token/accept
  //              NestJS :groupId parametrini "invitations" sifatida match qilardi.

  @Post(':groupId/invitations')
  @ApiOperation({ summary: 'Invite a new member' })
  inviteMember(
    @Param('groupId') groupId: string,
    @CurrentUser('id') inviterId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.invitationsService.create(groupId, inviterId, dto);
  }

  @Get(':groupId/invitations')
  @ApiOperation({ summary: 'Get pending invitations for group' })
  getInvitations(
    @Param('groupId') groupId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.invitationsService.findAllForGroup(groupId, userId);
  }

  @Delete(':groupId/invitations/:id')
  @ApiOperation({ summary: 'Revoke an invitation' })
  revokeInvitation(
    @Param('groupId') groupId: string,
    @Param('id') invitationId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.invitationsService.remove(groupId, invitationId, requesterId);
  }

  // ── Tags ────────────────────────────────────────

  @Get(':groupId/tags')
  @ApiOperation({ summary: 'List all tags in group' })
  listTags(
    @Param('groupId') groupId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tagsService.listByGroup(groupId, userId);
  }

  @Post(':groupId/tags')
  @ApiOperation({ summary: 'Create a tag in group' })
  createTag(
    @Param('groupId') groupId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTagDto,
  ) {
    return this.tagsService.create(groupId, userId, dto);
  }

  @Patch(':groupId/tags/:tagId')
  @ApiOperation({ summary: 'Update a group tag' })
  updateTag(
    @Param('groupId') groupId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagsService.update(groupId, tagId, userId, dto);
  }

  @Delete(':groupId/tags/:tagId')
  @ApiOperation({ summary: 'Delete a group tag' })
  deleteTag(
    @Param('groupId') groupId: string,
    @Param('tagId', ParseUUIDPipe) tagId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tagsService.remove(groupId, tagId, userId);
  }
}
