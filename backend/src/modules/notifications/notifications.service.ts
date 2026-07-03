import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../database/entities/notification.entity';
import { UserNotificationPrefs } from '../../database/entities/user-notification-prefs.entity';
import { NotificationType } from '../../common/enums';
import { EventsGateway } from '../gateway/events.gateway';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { UpdateNotifPrefsDto } from './dto/update-notif-prefs.dto';

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
    @InjectRepository(UserNotificationPrefs)
    private readonly prefsRepo: Repository<UserNotificationPrefs>,
    @Inject(forwardRef(() => EventsGateway))
    private readonly gateway: EventsGateway,
    private readonly dispatcher: NotificationDispatcherService,
  ) {}

  async create(dto: CreateNotificationDto): Promise<Notification> {
    const saved = await this.notifRepo.save(
      this.notifRepo.create({ ...dto, isRead: false }),
    );
    // Emit in-app via WebSocket
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
    if (!n) throw new NotFoundException({ code: ErrorCode.NOTIFICATION_NOT_FOUND, message: 'Notification not found' });
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

  // ── Notification Preferences ─────────────────────────────────────────────────

  async getPrefs(userId: string): Promise<UserNotificationPrefs> {
    let prefs = await this.prefsRepo.findOne({ where: { userId } });
    if (!prefs) {
      // Create with defaults on first access
      prefs = this.prefsRepo.create({ userId });
      await this.prefsRepo.save(prefs);
    }
    return prefs;
  }

  async updatePrefs(userId: string, dto: UpdateNotifPrefsDto): Promise<UserNotificationPrefs> {
    let prefs = await this.prefsRepo.findOne({ where: { userId } });
    if (!prefs) {
      prefs = this.prefsRepo.create({ userId });
    }
    Object.assign(prefs, dto);
    const saved = await this.prefsRepo.save(prefs);

    // Invalidate Redis cache
    await this.dispatcher.invalidatePrefsCache(userId);
    return saved;
  }

  async linkTelegram(userId: string, chatId: string): Promise<UserNotificationPrefs> {
    let prefs = await this.prefsRepo.findOne({ where: { userId } });
    if (!prefs) prefs = this.prefsRepo.create({ userId });
    prefs.telegramChatId = chatId;
    const saved = await this.prefsRepo.save(prefs);
    await this.dispatcher.invalidatePrefsCache(userId);
    return saved;
  }

  async unlinkTelegram(userId: string): Promise<{ success: boolean }> {
    await this.prefsRepo.update({ userId }, { telegramChatId: null });
    await this.dispatcher.invalidatePrefsCache(userId);
    return { success: true };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notifRepo.count({ where: { userId, isRead: false } });
    return { count };
  }
}
