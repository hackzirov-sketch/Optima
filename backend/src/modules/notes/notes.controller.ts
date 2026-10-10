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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

import { NotesService } from './notes.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@ApiTags('Notes')
@ApiBearerAuth('access-token')
@Controller('notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  @ApiOperation({
    summary:
      'List notes for a scope. Pass exactly the narrowest filter you have — taskId, or projectId, or groupId. No filter lists your own global notes.',
  })
  @ApiQuery({ name: 'groupId', required: false })
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'taskId', required: false })
  list(
    @CurrentUser('id') userId: string,
    @Query('groupId') groupId?: string,
    @Query('projectId') projectId?: string,
    @Query('taskId') taskId?: string,
  ) {
    return this.notesService.list(userId, {
      groupId,
      projectId,
      taskId,
    });
  }

  @Post()
  @ApiOperation({
    summary: 'Create a note (group/project/task-scoped, or fully global)',
  })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateNoteDto) {
    return this.notesService.create(userId, dto);
  }

  @Get(':noteId')
  @ApiOperation({ summary: 'Get a note' })
  getOne(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.notesService.getOne(noteId, userId);
  }

  @Patch(':noteId')
  @ApiOperation({ summary: 'Update a note (creator only)' })
  update(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.notesService.update(noteId, userId, dto);
  }

  @Delete(':noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a note (creator only)' })
  async remove(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.notesService.remove(noteId, userId);
  }
}
