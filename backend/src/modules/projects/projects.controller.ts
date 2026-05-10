import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateColumnDto } from './dto/create-column.dto';
import { UpdateColumnDto } from './dto/update-column.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Projects')
@ApiBearerAuth('access-token')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new project' })
  createProject(@CurrentUser('id') userId: string, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(userId, dto);
  }

  @Get('workspace/:workspaceId')
  @ApiOperation({ summary: 'Get all projects in a workspace' })
  getWorkspaceProjects(
    @Param('workspaceId') workspaceId: string,
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
    @Param('projectId') projectId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateColumnDto,
  ) {
    return this.projectsService.createColumn(projectId, userId, dto);
  }

  @Patch(':projectId/columns/:columnId')
  @ApiOperation({ summary: 'Update a project column' })
  updateColumn(
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateColumnDto,
  ) {
    return this.projectsService.updateColumn(projectId, columnId, userId, dto);
  }

  @Delete(':projectId/columns/:columnId')
  @ApiOperation({ summary: 'Delete a project column' })
  deleteColumn(
    @Param('projectId') projectId: string,
    @Param('columnId') columnId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.projectsService.deleteColumn(projectId, columnId, userId);
  }
}
