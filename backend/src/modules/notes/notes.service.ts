import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

import { ErrorCode } from '../../common/enums/error-code.enum';
import { MembersService } from '../groups/services/members.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NOTE_COLUMNS_SQL } from './notes.sql';
import { buildUpdateSet } from '../../common/utils/sql.util';

export interface NoteDto {
  id: string;
  groupId: string | null;
  projectId: string | null;
  taskId: string | null;
  creatorId: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class NotesService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly membersService: MembersService,
  ) {}

  private async findNote(noteId: string): Promise<NoteDto | null> {
    const rows = await this.dataSource.query<NoteDto>(
      `SELECT ${NOTE_COLUMNS_SQL} FROM notes WHERE id = $1 AND deleted_at IS NULL`,
      [noteId],
    );
    return rows[0] ?? null;
  }

  /**
   * A note is visible to a user if:
   *  - it has no group at all (a personal/global note — only its creator can see it), or
   *  - it belongs to a group the user is a member of.
   */
  private async assertReadable(note: NoteDto, userId: string) {
    if (!note.groupId) {
      if (note.creatorId !== userId) {
        throw new ForbiddenException({
          code: ErrorCode.NOTE_FORBIDDEN,
          message: 'Not allowed to view this note',
        });
      }
      return;
    }
    await this.membersService.assertMember(note.groupId, userId);
  }

  async create(userId: string, dto: CreateNoteDto): Promise<NoteDto> {
    if (dto.taskId && !dto.projectId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'taskId requires projectId',
      });
    }
    if ((dto.projectId || dto.taskId) && !dto.groupId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'projectId/taskId requires groupId',
      });
    }

    if (dto.groupId) {
      await this.membersService.assertMember(dto.groupId, userId);
    }
    if (dto.projectId) {
      const p = await this.dataSource.query(
        `SELECT id FROM projects WHERE id = $1 AND group_id = $2`,
        [dto.projectId, dto.groupId],
      );
      if (!p[0])
        throw new BadRequestException({
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: 'Project not in this group',
        });
    }
    if (dto.taskId) {
      const t = await this.dataSource.query(
        `SELECT id FROM tasks WHERE id = $1 AND project_id = $2`,
        [dto.taskId, dto.projectId],
      );
      if (!t[0])
        throw new BadRequestException({
          code: ErrorCode.TASK_NOT_FOUND,
          message: 'Task not in this project',
        });
    }

    const rows = await this.dataSource.query<NoteDto>(
      `INSERT INTO notes (group_id, project_id, task_id, creator_id, title, content)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${NOTE_COLUMNS_SQL}`,
      [
        dto.groupId ?? null,
        dto.projectId ?? null,
        dto.taskId ?? null,
        userId,
        dto.title,
        dto.content ?? '',
      ],
    );
    return rows[0];
  }

  /**
   * List notes visible to the user for a given scope. Exactly one of
   * groupId/projectId/taskId should be the "narrowest" filter the
   * caller wants; passing none lists the user's own global notes.
   */
  async list(
    userId: string,
    filter: {
      groupId?: string;
      projectId?: string;
      taskId?: string;
    },
  ) {
    if (filter.taskId) {
      const note0 = await this.dataSource.query(
        `SELECT group_id FROM notes WHERE task_id = $1 LIMIT 1`,
        [filter.taskId],
      );
      // Even with no notes yet, we still need to know the task's group to authorize.
      const task = await this.dataSource.query(
        `SELECT p.group_id AS "groupId" FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
        [filter.taskId],
      );
      const groupId = task[0]?.groupId ?? note0[0]?.group_id;
      if (groupId) await this.membersService.assertMember(groupId, userId);
      return this.dataSource.query(
        `SELECT ${NOTE_COLUMNS_SQL} FROM notes WHERE task_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [filter.taskId],
      );
    }

    if (filter.projectId) {
      const project = await this.dataSource.query(
        `SELECT group_id AS "groupId" FROM projects WHERE id = $1`,
        [filter.projectId],
      );
      if (!project[0])
        throw new NotFoundException({
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: 'Project not found',
        });
      await this.membersService.assertMember(project[0].groupId, userId);
      return this.dataSource.query(
        `SELECT ${NOTE_COLUMNS_SQL} FROM notes WHERE project_id = $1 AND task_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC`,
        [filter.projectId],
      );
    }

    if (filter.groupId) {
      await this.membersService.assertMember(filter.groupId, userId);
      return this.dataSource.query(
        `SELECT ${NOTE_COLUMNS_SQL} FROM notes
         WHERE group_id = $1 AND project_id IS NULL AND task_id IS NULL AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [filter.groupId],
      );
    }

    // No scope given -> the user's own fully-global notes.
    return this.dataSource.query(
      `SELECT ${NOTE_COLUMNS_SQL} FROM notes
       WHERE creator_id = $1 AND group_id IS NULL
         AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userId],
    );
  }

  async getOne(noteId: string, userId: string): Promise<NoteDto> {
    const note = await this.findNote(noteId);
    if (!note)
      throw new NotFoundException({
        code: ErrorCode.NOTE_NOT_FOUND,
        message: 'Note not found',
      });
    await this.assertReadable(note, userId);
    return note;
  }

  async update(
    noteId: string,
    userId: string,
    dto: UpdateNoteDto,
  ): Promise<NoteDto> {
    const note = await this.getOne(noteId, userId);
    if (note.creatorId !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.NOTE_FORBIDDEN,
        message: 'Only the creator can edit this note',
      });
    }
    const { setClause, values } = buildUpdateSet(
      dto as Record<string, unknown>,
      2,
    );
    if (!setClause) return note;
    const rows = await this.dataSource.query(
      `UPDATE notes SET ${setClause} WHERE id = $1 RETURNING ${NOTE_COLUMNS_SQL}`,
      [noteId, ...values],
    );
    return rows[0];
  }

  async remove(noteId: string, userId: string): Promise<void> {
    const note = await this.getOne(noteId, userId);
    if (note.creatorId !== userId) {
      throw new ForbiddenException({
        code: ErrorCode.NOTE_FORBIDDEN,
        message: 'Only the creator can delete this note',
      });
    }
    await this.dataSource.query(
      `UPDATE notes SET deleted_at = now(), deleted_by = $2 WHERE id = $1`,
      [noteId, userId],
    );
  }
}
