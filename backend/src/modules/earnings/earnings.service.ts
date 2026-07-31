import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { MembersService } from '../workspaces/services/members.service';
import { PermissionService } from '../../common/services/permission.service';
import { CreateEarningDto } from './dto/create-earning.dto';

const EARNING_COLUMNS_SQL = `
  id, workspace_id AS "workspaceId", user_id AS "userId", amount, currency,
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

  async getSummary(workspaceId: string, userId: string) {
    await this.membersService.assertMember(workspaceId, userId);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const [allTimeRows, thisMonthRows] = await Promise.all([
      this.dataSource.query(
        `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
         FROM earnings WHERE workspace_id = $1`,
        [workspaceId],
      ),
      this.dataSource.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM earnings WHERE workspace_id = $1 AND date >= $2`,
        [workspaceId, monthStart],
      ),
    ]);

    return {
      total: Number(allTimeRows[0]?.total ?? 0),
      thisMonth: Number(thisMonthRows[0]?.total ?? 0),
      count: Number(allTimeRows[0]?.count ?? 0),
      currency: 'USD',
    };
  }

  async list(workspaceId: string, userId: string) {
    await this.membersService.assertMember(workspaceId, userId);
    return this.dataSource.query(
      `SELECT ${EARNING_COLUMNS_SQL} FROM earnings
       WHERE workspace_id = $1
       ORDER BY date DESC, created_at DESC
       LIMIT 50`,
      [workspaceId],
    );
  }

  async create(workspaceId: string, userId: string, dto: CreateEarningDto) {
    await this.membersService.assertMember(workspaceId, userId);
    const rows = await this.dataSource.query(
      `INSERT INTO earnings (workspace_id, user_id, amount, currency, description, date, source_type, source_id)
       VALUES ($1, $2, $3, COALESCE($4, 'USD'), $5, $6, $7, $8)
       RETURNING ${EARNING_COLUMNS_SQL}`,
      [
        workspaceId,
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

  async remove(workspaceId: string, userId: string, earningId: string) {
    const member = await this.membersService.assertMember(workspaceId, userId);

    const rows = await this.dataSource.query(
      `SELECT user_id AS "userId" FROM earnings WHERE id = $1 AND workspace_id = $2`,
      [earningId, workspaceId],
    );
    if (!rows[0]) {
      throw new NotFoundException('Earning record not found');
    }
    if (rows[0].userId !== userId) {
      try {
        this.permission.assertCanManageWorkspace(member);
      } catch {
        throw new ForbiddenException('You can only delete your own earning records');
      }
    }

    await this.dataSource.query(`DELETE FROM earnings WHERE id = $1 AND workspace_id = $2`, [earningId, workspaceId]);
  }
}
