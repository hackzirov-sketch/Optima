import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { WorkspacesService } from '../services/workspaces.service';
import { MembersService } from '../services/members.service';
import { InvitationsService } from '../services/invitations.service';
import { TagsService } from '../services/tags.service';
import { CreateTagDto } from '../schemas/create-tag.schema';
import { UpdateTagDto } from '../schemas/update-tag.schema';
import { CreateWorkspaceDto } from '../schemas/create-workspace.schema';
import { UpdateWorkspaceDto } from '../schemas/update-workspace.schema';
import { InviteMemberDto } from '../schemas/invite-member.schema';
import { UpdateMemberRoleDto } from '../schemas/update-member-role.schema';
import { TransferOwnershipDto } from '../schemas/transfer-ownership.schema';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { TokenService } from '../../auth/services/token.service';
import { UsersService } from '../../users/services/users.service';
import { setAuthCookies } from '../../../common/utils/auth-cookies.util';

@ApiTags('Workspaces')
@ApiBearerAuth('access-token')
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly membersService: MembersService,
    private readonly invitationsService: InvitationsService,
    private readonly tagsService: TagsService,
    private readonly tokenService: TokenService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Post(':wsId/select')
  @ApiOperation({
    summary: 'Set the active workspace for this session',
    description:
      'Verifies membership, then reissues the access/refresh token pair scoped to this workspace ' +
      '(embedded as a `workspaceId` JWT claim) and resets the httpOnly auth cookies. Replaces the old ' +
      'client-side "selected workspace" localStorage key — the active workspace now lives in the token itself.',
  })
  async selectWorkspace(
    @Param('wsId') wsId: string,
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.workspacesService.assertMembership(wsId, userId);
    const user = await this.usersService.findById(userId);
    const { accessToken, refreshToken, ...rest } = await this.tokenService.generateTokens(user, {}, wsId);
    setAuthCookies(res, this.config, { accessToken, refreshToken });
    return { ...rest, workspaceId: wsId };
  }

  // ── Workspaces ──────────────────────────────────
  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  createWorkspace(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all workspaces for current user' })
  getWorkspaces(@CurrentUser('id') userId: string) {
    return this.workspacesService.findAllForUser(userId);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get workspace by slug' })
  getWorkspaceBySlug(
    @Param('slug') slug: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.workspacesService.findBySlug(slug, userId);
  }

  @Patch(':wsId')
  @ApiOperation({ summary: 'Update workspace settings' })
  updateWorkspace(
    @Param('wsId') wsId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(wsId, userId, dto);
  }

  @Delete(':wsId')
  @ApiOperation({
    summary: 'Soft-delete workspace (billing owner only)',
    description:
      'Only the workspace billing owner (`ownerId`) may delete. Workspace ADMIN members can update settings but cannot delete the workspace.',
  })
  deleteWorkspace(
    @Param('wsId') wsId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.workspacesService.remove(wsId, userId);
  }

  @Post(':wsId/transfer-ownership')
  @ApiOperation({
    summary: 'Transfer workspace ownership to another member',
    description:
      'Only the current OWNER can call this. Old owner becomes ADMIN, target member becomes OWNER. Invariant: exactly one OWNER at all times.',
  })
  transferOwnership(
    @Param('wsId') wsId: string,
    @CurrentUser('id') currentOwnerId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.workspacesService.transferOwnership(wsId, currentOwnerId, dto.newOwnerUserId);
  }

  // ── Members ─────────────────────────────────────
  @Get(':wsId/members')
  @ApiOperation({ summary: 'Get workspace members' })
  getMembers(
    @Param('wsId') wsId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.membersService.findAll(wsId, userId);
  }

  @Patch(':wsId/members/:userId')
  @ApiOperation({ summary: 'Update member role' })
  updateMemberRole(
    @Param('wsId') wsId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') requesterId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membersService.updateRole(wsId, targetUserId, dto, requesterId);
  }

  @Delete(':wsId/members/:userId')
  @ApiOperation({ summary: 'Remove a member from workspace' })
  removeMember(
    @Param('wsId') wsId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.membersService.remove(wsId, targetUserId, requesterId);
  }

  // ── Invitations (workspace-scoped) ──────────────
  // NOTE: accept/decline routelari InvitationsController ga ko'chirilgan
  //       → /invitations/:token/accept  va  /invitations/:token/decline
  //       Sabab: bu yerda edi /workspaces/invitations/:token/accept
  //              NestJS :wsId parametrini "invitations" sifatida match qilardi.

  @Post(':wsId/invitations')
  @ApiOperation({ summary: 'Invite a new member' })
  inviteMember(
    @Param('wsId') wsId: string,
    @CurrentUser('id') inviterId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.invitationsService.create(wsId, inviterId, dto);
  }

  @Get(':wsId/invitations')
  @ApiOperation({ summary: 'Get pending invitations for workspace' })
  getInvitations(
    @Param('wsId') wsId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.invitationsService.findAllForWorkspace(wsId, userId);
  }

  @Delete(':wsId/invitations/:id')
  @ApiOperation({ summary: 'Revoke an invitation' })
  revokeInvitation(
    @Param('wsId') wsId: string,
    @Param('id') invitationId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.invitationsService.remove(wsId, invitationId, requesterId);
  }

  // ── Tags ────────────────────────────────────────

  @Get(':wsId/tags')
  @ApiOperation({ summary: 'List all tags in workspace' })
  listTags(
    @Param('wsId') wsId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tagsService.listByWorkspace(wsId, userId);
  }

  @Post(':wsId/tags')
  @ApiOperation({ summary: 'Create a tag in workspace' })
  createTag(
    @Param('wsId') wsId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateTagDto,
  ) {
    return this.tagsService.create(wsId, userId, dto);
  }

  @Patch(':wsId/tags/:tagId')
  @ApiOperation({ summary: 'Update a workspace tag' })
  updateTag(
    @Param('wsId') wsId: string,
    @Param('tagId') tagId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tagsService.update(wsId, tagId, userId, dto);
  }

  @Delete(':wsId/tags/:tagId')
  @ApiOperation({ summary: 'Delete a workspace tag' })
  deleteTag(
    @Param('wsId') wsId: string,
    @Param('tagId') tagId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tagsService.remove(wsId, tagId, userId);
  }
}