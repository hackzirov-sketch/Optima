import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.service';
import { Tag } from '../../../database/entities/tag.entity';
import { GroupMember } from '../../../database/entities/group-member.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { PermissionService } from '../../../common/services/permission.service';
import {
  TAG_COLUMNS_SQL,
  GROUP_MEMBER_COLUMNS_SQL,
} from '../repositories/groups.sql';
import { buildUpdateSet } from '../../../common/utils/sql.util';
import { CreateTagDto } from '../schemas/create-tag.schema';
import { UpdateTagDto } from '../schemas/update-tag.schema';

@Injectable()
export class TagsService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly permission: PermissionService,
  ) {}

  private async assertMember(
    groupId: string,
    userId: string,
  ): Promise<GroupMember> {
    const rows = await this.dataSource.query<GroupMember>(
      `SELECT ${GROUP_MEMBER_COLUMNS_SQL} FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [groupId, userId],
    );
    if (!rows[0])
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_MEMBER,
        message: 'Not a group member',
      });
    return rows[0];
  }

  private async assertAdminOrOwner(groupId: string, userId: string) {
    const m = await this.assertMember(groupId, userId);
    this.permission.assertCanManageProject(m); // LEAD+
    return m;
  }

  async listByGroup(groupId: string, userId: string): Promise<Tag[]> {
    await this.assertMember(groupId, userId);
    return this.dataSource.query(
      `SELECT ${TAG_COLUMNS_SQL} FROM tags WHERE group_id = $1 ORDER BY name ASC`,
      [groupId],
    );
  }

  async create(
    groupId: string,
    userId: string,
    dto: CreateTagDto,
  ): Promise<Tag> {
    await this.assertAdminOrOwner(groupId, userId);

    const existing = await this.dataSource.query(
      `SELECT id FROM tags WHERE group_id = $1 AND name = $2`,
      [groupId, dto.name],
    );
    if (existing[0])
      throw new ConflictException({
        code: ErrorCode.TAG_ALREADY_EXISTS,
        message: 'Tag with this name already exists in group',
      });

    const rows = await this.dataSource.query<Tag>(
      `INSERT INTO tags (group_id, name, color, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING ${TAG_COLUMNS_SQL}`,
      [groupId, dto.name, dto.color ?? '#6B7280', userId],
    );
    return rows[0];
  }

  async update(
    groupId: string,
    tagId: string,
    userId: string,
    dto: UpdateTagDto,
  ): Promise<Tag> {
    await this.assertAdminOrOwner(groupId, userId);

    const rows = await this.dataSource.query<Tag>(
      `SELECT ${TAG_COLUMNS_SQL} FROM tags WHERE id = $1 AND group_id = $2`,
      [tagId, groupId],
    );
    const tag = rows[0];
    if (!tag)
      throw new NotFoundException({
        code: ErrorCode.TAG_NOT_FOUND,
        message: 'Tag not found',
      });

    if (dto.name && dto.name !== tag.name) {
      const existing = await this.dataSource.query(
        `SELECT id FROM tags WHERE group_id = $1 AND name = $2`,
        [groupId, dto.name],
      );
      if (existing[0])
        throw new ConflictException({
          code: ErrorCode.TAG_ALREADY_EXISTS,
          message: 'Tag with this name already exists in group',
        });
    }

    const { setClause, values } = buildUpdateSet(
      dto as Record<string, unknown>,
      2,
    );
    if (!setClause) return tag;
    const updatedRows: Tag[] = await this.dataSource.query(
      `UPDATE tags SET ${setClause} WHERE id = $1 RETURNING ${TAG_COLUMNS_SQL}`,
      [tagId, ...values],
    );
    return updatedRows[0];
  }

  async remove(groupId: string, tagId: string, userId: string): Promise<void> {
    await this.assertAdminOrOwner(groupId, userId);

    const rows = await this.dataSource.query(
      `SELECT id FROM tags WHERE id = $1 AND group_id = $2`,
      [tagId, groupId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: ErrorCode.TAG_NOT_FOUND,
        message: 'Tag not found',
      });

    await this.dataSource.query(`DELETE FROM tags WHERE id = $1`, [tagId]);
  }
}
