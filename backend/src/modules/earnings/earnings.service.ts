import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MembersService } from '../groups/services/members.service';
import { PermissionService } from '../../common/services/permission.service';
import { CreateEarningDto } from './dto/create-earning.dto';

const EARNING_COLUMNS_SQL = `
  id, group_id AS "groupId", user_id AS "userId", amount, currency,
  description, date, source_type AS "sourceType", source_id AS "sourceId",
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class EarningsService {
  constructor(
    private readonly dataSource: DatabaseService,
    private readonly membersService: MembersService,
    private readonly permission: PermissionService,
  ) {}

  async getSummary(groupId: string, userId: string) {
    await this.membersService.assertMember(groupId, userId);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const [allTimeRows, thisMonthRows] = await Promise.all([
      this.dataSource.query(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
         FROM earnings WHERE group_id = $1`,
        [groupId],
      ),
      this.dataSource.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM earnings WHERE group_id = $1 AND date >= $2`,
        [groupId, monthStart],
      ),
    ]);

    return {
      total: Number(allTimeRows[0]?.total ?? 0),
      thisMonth: Number(thisMonthRows[0]?.total ?? 0),
      count: Number(allTimeRows[0]?.count ?? 0),
      currency: 'USD',
    };
  }

  async list(groupId: string, userId: string) {
    await this.membersService.assertMember(groupId, userId);
    return this.dataSource.query(
      `SELECT ${EARNING_COLUMNS_SQL} FROM earnings
       WHERE group_id = $1
       ORDER BY date DESC, created_at DESC
       LIMIT 50`,
      [groupId],
    );
  }

  async create(groupId: string, userId: string, dto: CreateEarningDto) {
    await this.membersService.assertMember(groupId, userId);
    const rows = await this.dataSource.query(
      `INSERT INTO earnings (group_id, user_id, amount, currency, description, date, source_type, source_id)
       VALUES ($1, $2, $3, COALESCE($4, 'USD'), $5, $6, $7, $8)
       RETURNING ${EARNING_COLUMNS_SQL}`,
      [
        groupId,
        userId,
        dto.amount,
        dto.currency ?? null,
        dto.description ?? null,
        dto.date,
        dto.sourceType ?? null,
        dto.sourceId ?? null,
      ],
    );
    return rows[0];
  }

  async remove(groupId: string, userId: string, earningId: string) {
    const member = await this.membersService.assertMember(groupId, userId);

    const rows = await this.dataSource.query(
      `SELECT user_id AS "userId" FROM earnings WHERE id = $1 AND group_id = $2`,
      [earningId, groupId],
    );
    if (!rows[0]) {
      throw new NotFoundException('Earning record not found');
    }
    if (rows[0].userId !== userId) {
      try {
        this.permission.assertCanManageGroup(member);
      } catch {
        throw new ForbiddenException(
          'You can only delete your own earning records',
        );
      }
    }

    await this.dataSource.query(
      `DELETE FROM earnings WHERE id = $1 AND group_id = $2`,
      [earningId, groupId],
    );
  }
}
