import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service';
import { MembersService } from './members.service';
import { InvitationsService } from './invitations.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Workspaces')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller()
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly membersService: MembersService,
    private readonly invitationsService: InvitationsService,
  ) {}

  // ── Workspaces ──────────────────────────────────
  @Post('workspaces')
  @ApiOperation({ summary: 'Create a new workspace' })
  createWorkspace(@CurrentUser('id') userId: string, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(userId, dto);
  }

  @Get('workspaces')
  @ApiOperation({ summary: 'Get all workspaces for current user' })
  getWorkspaces(@CurrentUser('id') userId: string) {
    return this.workspacesService.findAllForUser(userId);
  }

  @Get('workspaces/:slug')
  @ApiOperation({ summary: 'Get workspace by slug' })
  getWorkspaceBySlug(@Param('slug') slug: string) {
    return this.workspacesService.findBySlug(slug);
  }

  @Patch('workspaces/:wsId')
  @ApiOperation({ summary: 'Update workspace settings' })
  updateWorkspace(
    @Param('wsId') wsId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.update(wsId, userId, dto);
  }

  @Delete('workspaces/:wsId')
  @ApiOperation({ summary: 'Delete a workspace' })
  deleteWorkspace(@Param('wsId') wsId: string, @CurrentUser('id') userId: string) {
    return this.workspacesService.remove(wsId, userId);
  }

  // ── Members ─────────────────────────────────────
  @Get('workspaces/:wsId/members')
  @ApiOperation({ summary: 'Get workspace members' })
  getMembers(@Param('wsId') wsId: string) {
    return this.membersService.findAll(wsId);
  }

  @Patch('workspaces/:wsId/members/:userId')
  @ApiOperation({ summary: 'Update member role' })
  updateMemberRole(
    @Param('wsId') wsId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') requesterId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membersService.updateRole(wsId, targetUserId, dto, requesterId);
  }

  @Delete('workspaces/:wsId/members/:userId')
  @ApiOperation({ summary: 'Remove a member from workspace' })
  removeMember(
    @Param('wsId') wsId: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.membersService.remove(wsId, targetUserId, requesterId);
  }

  // ── Invitations ─────────────────────────────────
  @Post('workspaces/:wsId/invitations')
  @ApiOperation({ summary: 'Invite a new member' })
  inviteMember(
    @Param('wsId') wsId: string,
    @CurrentUser('id') inviterId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.invitationsService.create(wsId, inviterId, dto);
  }

  @Get('workspaces/:wsId/invitations')
  @ApiOperation({ summary: 'Get pending invitations for workspace' })
  getInvitations(@Param('wsId') wsId: string) {
    return this.invitationsService.findAllForWorkspace(wsId);
  }

  @Delete('workspaces/:wsId/invitations/:id')
  @ApiOperation({ summary: 'Revoke an invitation' })
  revokeInvitation(
    @Param('wsId') wsId: string,
    @Param('id') invitationId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.invitationsService.remove(wsId, invitationId, requesterId);
  }

  @Post('invitations/:token/accept')
  @ApiOperation({ summary: 'Accept a workspace invitation' })
  acceptInvitation(@Param('token') token: string, @CurrentUser('id') userId: string) {
    return this.invitationsService.accept(token, userId);
  }

  @Post('invitations/:token/decline')
  @ApiOperation({ summary: 'Decline a workspace invitation' })
  declineInvitation(@Param('token') token: string, @CurrentUser('id') userId: string) {
    return this.invitationsService.decline(token, userId);
  }
}
