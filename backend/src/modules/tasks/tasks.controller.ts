import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { FilterTasksDto } from './dto/filter-tasks.dto';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { AddTagDto } from './dto/add-tag.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Tasks')
@ApiBearerAuth('access-token')
@Controller()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get('projects/:projectId/tasks/:taskId/pushes')
  @ApiOperation({ summary: 'List pushes linked to a task' })
  @ApiParam({ name: 'projectId' })
  @ApiParam({ name: 'taskId' })
  getPushes(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.getPushesForTask(projectId, taskId, userId);
  }

  // ─── CRUD ──────────────────────────────────────────────────────────────────

  @Post('tasks')
  @ApiOperation({ summary: 'Create a new task' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(userId, dto);
  }

  @Get('projects/:projectId/tasks')
  @ApiOperation({
    summary: 'Get all tasks in a project (board view, paginated)',
  })
  @ApiParam({ name: 'projectId', description: 'Project UUID' })
  findAll(
    @Param('projectId') projectId: string,
    @CurrentUser('id') userId: string,
    @Query() filters: FilterTasksDto,
  ) {
    return this.tasksService.findAll(projectId, userId, filters);
  }

  @Get('tasks/:taskId')
  @ApiOperation({ summary: 'Get task details by ID' })
  findById(@Param('taskId') taskId: string, @CurrentUser('id') userId: string) {
    return this.tasksService.findById(taskId, userId);
  }

  @Patch('tasks/:taskId')
  @ApiOperation({ summary: 'Update a task' })
  update(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(taskId, userId, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a task' })
  remove(@Param('taskId') taskId: string, @CurrentUser('id') userId: string) {
    return this.tasksService.remove(taskId, userId);
  }

  // ─── Move (Kanban) ─────────────────────────────────────────────────────────

  @Patch('tasks/:taskId/move')
  @ApiOperation({
    summary: 'Move task to a different column / position / status',
  })
  move(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: MoveTaskDto,
  ) {
    return this.tasksService.move(taskId, userId, dto);
  }

  // ─── Watchers ──────────────────────────────────────────────────────────────

  @Get('tasks/:taskId/watchers')
  @ApiOperation({ summary: 'Get task watchers' })
  getWatchers(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.getWatchers(taskId, userId);
  }

  @Post('tasks/:taskId/watch')
  @ApiOperation({ summary: 'Watch a task (subscribe to notifications)' })
  watch(@Param('taskId') taskId: string, @CurrentUser('id') userId: string) {
    return this.tasksService.watch(taskId, userId);
  }

  @Delete('tasks/:taskId/watch')
  @ApiOperation({ summary: 'Unwatch a task' })
  unwatch(@Param('taskId') taskId: string, @CurrentUser('id') userId: string) {
    return this.tasksService.unwatch(taskId, userId);
  }

  // ─── Activities ────────────────────────────────────────────────────────────

  @Get('tasks/:taskId/activities')
  @ApiOperation({ summary: 'Get activity / audit trail for a task' })
  getActivities(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.getActivities(taskId, userId);
  }

  // ─── Dependencies ──────────────────────────────────────────────────────────

  @Get('tasks/:taskId/dependencies')
  @ApiOperation({ summary: 'Get task dependencies' })
  getDependencies(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.getDependencies(taskId, userId);
  }

  @Post('tasks/:taskId/dependencies')
  @ApiOperation({ summary: 'Add a task dependency' })
  addDependency(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddDependencyDto,
  ) {
    return this.tasksService.addDependency(taskId, userId, dto);
  }

  @Delete('tasks/:taskId/dependencies/:dependencyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a task dependency' })
  removeDependency(
    @Param('taskId') taskId: string,
    @Param('dependencyId') dependencyId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.removeDependency(taskId, dependencyId, userId);
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  @Get('tasks/:taskId/tags')
  @ApiOperation({ summary: 'Get tags attached to a task' })
  getTags(@Param('taskId') taskId: string, @CurrentUser('id') userId: string) {
    return this.tasksService.getTags(taskId, userId);
  }

  @Post('tasks/:taskId/tags')
  @ApiOperation({ summary: 'Attach a tag to a task' })
  addTag(
    @Param('taskId') taskId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddTagDto,
  ) {
    return this.tasksService.addTag(taskId, dto.tagId, userId);
  }

  @Delete('tasks/:taskId/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a tag from a task' })
  removeTag(
    @Param('taskId') taskId: string,
    @Param('tagId') tagId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.tasksService.removeTag(taskId, tagId, userId);
  }
}
