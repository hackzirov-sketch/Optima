import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Earning } from '../../database/entities/earning.entity';
import { MembersService } from '../workspaces/members.service';
import { CreateEarningDto } from './dto/create-earning.dto';

@Injectable()
export class EarningsService {
  constructor(
    @InjectRepository(Earning)
    private readonly earningRepo: Repository<Earning>,
    private readonly membersService: MembersService,
  ) {}

  async getSummary(workspaceId: string, userId: string) {
    await this.membersService.assertMember(workspaceId, userId);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];

    const [allTime, thisMonth] = await Promise.all([
      this.earningRepo
        .createQueryBuilder('e')
        .select('COALESCE(SUM(e.amount), 0)', 'total')
        .addSelect('COUNT(*)', 'count')
        .where('e.workspace_id = :ws', { ws: workspaceId })
        .getRawOne<{ total: string; count: string }>(),

      this.earningRepo
        .createQueryBuilder('e')
        .select('COALESCE(SUM(e.amount), 0)', 'total')
        .where('e.workspace_id = :ws', { ws: workspaceId })
        .andWhere('e.date >= :start', { start: monthStart })
        .getRawOne<{ total: string }>(),
    ]);

    return {
      total: Number(allTime?.total ?? 0),
      thisMonth: Number(thisMonth?.total ?? 0),
      count: Number(allTime?.count ?? 0),
      currency: 'USD',
    };
  }

  async list(workspaceId: string, userId: string) {
    await this.membersService.assertMember(workspaceId, userId);
    return this.earningRepo.find({
      where: { workspaceId },
      order: { date: 'DESC', createdAt: 'DESC' },
      take: 50,
    });
  }

  async create(workspaceId: string, userId: string, dto: CreateEarningDto) {
    await this.membersService.assertMember(workspaceId, userId);
    const earning = this.earningRepo.create({
      workspaceId,
      userId,
      amount: dto.amount,
      currency: dto.currency ?? 'USD',
      description: dto.description ?? null,
      date: dto.date,
      sourceType: dto.sourceType ?? null,
      sourceId: dto.sourceId ?? null,
    });
    return this.earningRepo.save(earning);
  }

  async remove(workspaceId: string, userId: string, earningId: string) {
    await this.membersService.assertMember(workspaceId, userId);
    await this.earningRepo.delete({ id: earningId, workspaceId });
  }
}
