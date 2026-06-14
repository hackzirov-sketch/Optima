import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../database/entities/notification.entity';
import { NotificationType } from '../../common/enums';
import { EventsGateway } from '../gateway/events.gateway';

export interface CreateNotificationDto {
  userId: string;
  actorId?: string;
  type: NotificationType;
  title: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly gateway: EventsGateway,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const saved = await this.notifRepo.save(
      this.notifRepo.create({ ...dto, isRead: false }),
    );
    this.gateway.sendNotification(dto.userId, {
      id: saved.id,
      type: saved.type,
      title: saved.title,
      message: saved.message,
      actorId: saved.actorId,
      entityType: saved.entityType,
      entityId: saved.entityId,
      actionUrl: saved.actionUrl,
      isRead: false,
      createdAt: saved.createdAt.toISOString(),
    });
    return saved;
  }

  async list(userId: string, page = 1, limit = 30) {
    const safeLimit = Math.min(limit, 100);
    const [data, total] = await this.notifRepo.findAndCount({
      where: { userId },
      relations: ['actor'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * safeLimit,
      take: safeLimit,
    });
    return { data, total, page, limit: safeLimit };
  }

  async markRead(userId: string, id: string) {
    const n = await this.notifRepo.findOne({ where: { id, userId } });
    if (!n) throw new NotFoundException('Notification not found');
    n.isRead = true;
    n.readAt = new Date();
    return this.notifRepo.save(n);
  }

  async markAllRead(userId: string) {
    await this.notifRepo.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
    return { updated: true };
  }
}
