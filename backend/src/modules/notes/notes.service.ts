import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

import { ErrorCode } from '../../common/enums/error-code.enum';
import { MembersService } from '../workspaces/services/members.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { NOTE_COLUMNS_SQL } from './notes.sql';
import {
  buildUpdateSet,
  normalizeReturning,
} from '../../common/utils/sql.util';

export interface NoteDto {
  id: string;
  workspaceId: string | null;
  projectId: string | null;
  taskId: string | null;
  meetingId: string | null;
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
   * Whether someone took part in a meeting — as host, or as a participant at
   * any point.
   *
   * Deliberately not `left_at IS NULL`: notes are read after the call, and
   * someone who wrote them or was in the room when they were written does not
   * lose the right to read them by hanging up.
   */
  private async isMeetingParticipant(
    meetingId: string,
    userId: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM meetings m
        WHERE m.id = $1
          AND (m.host_id = $2
               OR EXISTS (SELECT 1 FROM meeting_participants mp
                           WHERE mp.meeting_id = m.id AND mp.user_id = $2))`,
      [meetingId, userId],
    );
    return !!rows[0];
  }

  /**
   * A note is visible to a user if:
   *  - it belongs to a meeting they took part in, or
   *  - it has no workspace at all (a personal/global note — only its creator can see it), or
   *  - it belongs to a workspace the user is a member of.
   */
  private async assertReadable(note: NoteDto, userId: string) {
    // Checked before the workspace rule, not after: a meeting can belong to a
    // workspace, and falling through to workspace membership would open the
    // room's notes to everyone in the organisation rather than to the people
    // who were actually in the call.
    if (note.meetingId) {
      if (!(await this.isMeetingParticipant(note.meetingId, userId))) {
        throw new ForbiddenException({
          code: ErrorCode.NOTE_FORBIDDEN,
          message: 'Not allowed to view this note',
        });
      }
      return;
    }
    if (!note.workspaceId) {
      if (note.creatorId !== userId) {
        throw new ForbiddenException({
          code: ErrorCode.NOTE_FORBIDDEN,
          message: 'Not allowed to view this note',
        });
      }
      return;
    }
    await this.membersService.assertMember(note.workspaceId, userId);
  }

  async create(userId: string, dto: CreateNoteDto): Promise<NoteDto> {
    if (dto.meetingId && (dto.projectId || dto.taskId)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'meetingId cannot be combined with projectId/taskId',
      });
    }
    if (dto.meetingId) {
      if (!(await this.isMeetingParticipant(dto.meetingId, userId))) {
        throw new ForbiddenException({
          code: ErrorCode.NOTE_FORBIDDEN,
          message: 'Only people in the meeting can take notes on it',
        });
      }
    }
    if (dto.taskId && !dto.projectId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'taskId requires projectId',
      });
    }
    if ((dto.projectId || dto.taskId) && !dto.workspaceId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'projectId/taskId requires workspaceId',
      });
    }

    if (dto.workspaceId) {
      await this.membersService.assertMember(dto.workspaceId, userId);
    }
    if (dto.projectId) {
      const p = await this.dataSource.query(
        `SELECT id FROM projects WHERE id = $1 AND workspace_id = $2`,
        [dto.projectId, dto.workspaceId],
      );
      if (!p[0])
        throw new BadRequestException({
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: 'Project not in this workspace',
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
      `INSERT INTO notes (workspace_id, project_id, task_id, meeting_id, creator_id, title, content)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${NOTE_COLUMNS_SQL}`,
      [
        dto.workspaceId ?? null,
        dto.projectId ?? null,
        dto.taskId ?? null,
        dto.meetingId ?? null,
        userId,
        dto.title,
        dto.content ?? '',
      ],
    );
    return rows[0];
  }

  /**
   * List notes visible to the user for a given scope. Exactly one of
   * workspaceId/projectId/taskId should be the "narrowest" filter the
   * caller wants; passing none lists the user's own global notes.
   */
  async list(
    userId: string,
    filter: {
      workspaceId?: string;
      projectId?: string;
      taskId?: string;
      meetingId?: string;
    },
  ) {
    if (filter.meetingId) {
      if (!(await this.isMeetingParticipant(filter.meetingId, userId))) {
        throw new ForbiddenException({
          code: ErrorCode.NOTE_FORBIDDEN,
          message: 'Not allowed to view notes for this meeting',
        });
      }
      return this.dataSource.query(
        `SELECT ${NOTE_COLUMNS_SQL} FROM notes
          WHERE meeting_id = $1 AND deleted_at IS NULL
          ORDER BY created_at DESC`,
        [filter.meetingId],
      );
    }

    if (filter.taskId) {
      const note0 = await this.dataSource.query(
        `SELECT workspace_id FROM notes WHERE task_id = $1 LIMIT 1`,
        [filter.taskId],
      );
      // Even with no notes yet, we still need to know the task's workspace to authorize.
      const task = await this.dataSource.query(
        `SELECT p.workspace_id AS "workspaceId" FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = $1`,
        [filter.taskId],
      );
      const workspaceId = task[0]?.workspaceId ?? note0[0]?.workspace_id;
      if (workspaceId)
        await this.membersService.assertMember(workspaceId, userId);
      return this.dataSource.query(
        `SELECT ${NOTE_COLUMNS_SQL} FROM notes WHERE task_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC`,
        [filter.taskId],
      );
    }

    if (filter.projectId) {
      const project = await this.dataSource.query(
        `SELECT workspace_id AS "workspaceId" FROM projects WHERE id = $1`,
        [filter.projectId],
      );
      if (!project[0])
        throw new NotFoundException({
          code: ErrorCode.PROJECT_NOT_FOUND,
          message: 'Project not found',
        });
      await this.membersService.assertMember(project[0].workspaceId, userId);
      return this.dataSource.query(
        `SELECT ${NOTE_COLUMNS_SQL} FROM notes WHERE project_id = $1 AND task_id IS NULL AND deleted_at IS NULL ORDER BY created_at DESC`,
        [filter.projectId],
      );
    }

    if (filter.workspaceId) {
      await this.membersService.assertMember(filter.workspaceId, userId);
      return this.dataSource.query(
        `SELECT ${NOTE_COLUMNS_SQL} FROM notes
         WHERE workspace_id = $1 AND project_id IS NULL AND task_id IS NULL AND deleted_at IS NULL
         ORDER BY created_at DESC`,
        [filter.workspaceId],
      );
    }

    // No scope given -> the user's own fully-global notes.
    return this.dataSource.query(
      `SELECT ${NOTE_COLUMNS_SQL} FROM notes
       WHERE creator_id = $1 AND workspace_id IS NULL AND meeting_id IS NULL
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
    const rows = normalizeReturning(
      await this.dataSource.query(
        `UPDATE notes SET ${setClause} WHERE id = $1 RETURNING ${NOTE_COLUMNS_SQL}`,
        [noteId, ...values],
      ),
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
