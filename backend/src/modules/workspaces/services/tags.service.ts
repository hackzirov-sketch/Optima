import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { Tag } from '../../../database/entities/tag.entity';
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { PermissionService } from '../../../common/services/permission.service';
import {
  TAG_COLUMNS_SQL,
  WORKSPACE_MEMBER_COLUMNS_SQL,
} from '../repositories/workspaces.sql';
import {
  buildUpdateSet,
  normalizeReturning,
} from '../../../common/utils/sql.util';
import { CreateTagDto } from '../schemas/create-tag.schema';
import { UpdateTagDto } from '../schemas/update-tag.schema';

@Injectable()
export class TagsService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly permission: PermissionService,
  ) {}

  private async assertMember(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceMember> {
    const rows: WorkspaceMember[] = await this.dataSource.query(
      `SELECT ${WORKSPACE_MEMBER_COLUMNS_SQL} FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    );
    if (!rows[0])
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_MEMBER,
        message: 'Not a workspace member',
      });
    return rows[0];
  }

  private async assertAdminOrOwner(workspaceId: string, userId: string) {
    const m = await this.assertMember(workspaceId, userId);
    this.permission.assertCanManageProject(m); // LEAD+
    return m;
  }

  async listByWorkspace(workspaceId: string, userId: string): Promise<Tag[]> {
    await this.assertMember(workspaceId, userId);
    return this.dataSource.query(
      `SELECT ${TAG_COLUMNS_SQL} FROM tags WHERE workspace_id = $1 ORDER BY name ASC`,
      [workspaceId],
    );
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateTagDto,
  ): Promise<Tag> {
    await this.assertAdminOrOwner(workspaceId, userId);

    const existing = await this.dataSource.query(
      `SELECT id FROM tags WHERE workspace_id = $1 AND name = $2`,
      [workspaceId, dto.name],
    );
    if (existing[0])
      throw new ConflictException({
        code: ErrorCode.TAG_ALREADY_EXISTS,
        message: 'Tag with this name already exists in workspace',
      });

    const rows: Tag[] = await this.dataSource.query(
      `INSERT INTO tags (workspace_id, name, color, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING ${TAG_COLUMNS_SQL}`,
      [workspaceId, dto.name, dto.color ?? '#6B7280', userId],
    );
    return rows[0];
  }

  async update(
    workspaceId: string,
    tagId: string,
    userId: string,
    dto: UpdateTagDto,
  ): Promise<Tag> {
    await this.assertAdminOrOwner(workspaceId, userId);

    const rows: Tag[] = await this.dataSource.query(
      `SELECT ${TAG_COLUMNS_SQL} FROM tags WHERE id = $1 AND workspace_id = $2`,
      [tagId, workspaceId],
    );
    const tag = rows[0];
    if (!tag)
      throw new NotFoundException({
        code: ErrorCode.TAG_NOT_FOUND,
        message: 'Tag not found',
      });

    if (dto.name && dto.name !== tag.name) {
      const existing = await this.dataSource.query(
        `SELECT id FROM tags WHERE workspace_id = $1 AND name = $2`,
        [workspaceId, dto.name],
      );
      if (existing[0])
        throw new ConflictException({
          code: ErrorCode.TAG_ALREADY_EXISTS,
          message: 'Tag with this name already exists in workspace',
        });
    }

    const { setClause, values } = buildUpdateSet(
      dto as Record<string, unknown>,
      2,
    );
    if (!setClause) return tag;
    const updatedRows: Tag[] = normalizeReturning(
      await this.dataSource.query(
        `UPDATE tags SET ${setClause} WHERE id = $1 RETURNING ${TAG_COLUMNS_SQL}`,
        [tagId, ...values],
      ),
    );
    return updatedRows[0];
  }

  async remove(
    workspaceId: string,
    tagId: string,
    userId: string,
  ): Promise<void> {
    await this.assertAdminOrOwner(workspaceId, userId);

    const rows = await this.dataSource.query(
      `SELECT id FROM tags WHERE id = $1 AND workspace_id = $2`,
      [tagId, workspaceId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.TAG_NOT_FOUND,
        message: 'Tag not found',
      });

    await this.dataSource.query(`DELETE FROM tags WHERE id = $1`, [tagId]);
  }
}
