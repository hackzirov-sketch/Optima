import {
  Controller,
  ParseUUIDPipe,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsIn, IsOptional } from 'class-validator';
import { ProjectsService } from './projects.service';
import { ProjectMembersService } from './project-members.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

class InviteProjectMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsIn(['manager', 'member'])
  role?: 'manager' | 'member';
}

class RespondInviteDto {
  accept!: boolean;
}

@ApiTags('Projects')
@ApiBearerAuth('access-token')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectMembersService: ProjectMembersService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  createProject(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(userId, dto);
  }

  @Get('workspace/:workspaceId')
  @ApiOperation({ summary: 'Get all projects in a workspace' })
  getWorkspaceProjects(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.findAllInWorkspace(workspaceId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project details by id' })
  getProjectById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.projectsService.findById(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project settings' })
  updateProject(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a project' })
  deleteProject(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.projectsService.remove(id, userId);
  }

  // Columns endpoints
  @Post(':projectId/columns')
  @ApiOperation({ summary: 'Create a new column in project' })
  createColumn(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.projectsService.createColumn(projectId, userId, dto);
  }

  @Patch(':projectId/columns/:columnId')
  @ApiOperation({ summary: 'Update a project column' })
  updateColumn(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.projectsService.updateColumn(projectId, columnId, userId, dto);
  }

  @Delete(':projectId/columns/:columnId')
  @ApiOperation({ summary: 'Delete a project column' })
  deleteColumn(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.deleteColumn(projectId, columnId, userId);
  }

  // ── Project Members ────────────────────────────

  @Get(':projectId/members')
  @ApiOperation({ summary: 'List project members' })
  listProjectMembers(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectMembersService.listMembers(projectId, userId);
  }

  @Post(':projectId/members')
  @ApiOperation({ summary: 'Invite a member to project' })
  inviteProjectMember(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: InviteProjectMemberDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectMembersService.inviteMember(
      projectId,
      dto.userId,
      dto.role ?? 'member',
      userId,
    );
  }

  @Delete(':projectId/members/:targetUserId')
  @ApiOperation({ summary: 'Remove a member from project' })
  removeProjectMember(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('targetUserId') targetUserId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectMembersService.removeMember(
      projectId,
      targetUserId,
      userId,
    );
  }

  @Patch('member-invites/:memberId/respond')
  @ApiOperation({ summary: 'Accept or decline a project invite' })
  respondToInvite(
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: RespondInviteDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectMembersService.respondToInvite(
      memberId,
      userId,
      dto.accept,
    );
  }

  @Get('my-invites')
  @ApiOperation({ summary: 'Get my pending project invites' })
  getMyInvites(@CurrentUser('id') userId: string) {
    return this.projectMembersService.getMyInvites(userId);
  }
}
