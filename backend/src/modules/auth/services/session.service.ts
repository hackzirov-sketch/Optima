import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RefreshToken } from '../../../database/entities/refresh-token.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';

interface TokenContext {
  ip?: string;
  userAgent?: string;
  deviceName?: string;
  provider?: string;
}

@Injectable()
export class SessionService {
  private readonly maxSessions: number;

  constructor(
    @InjectRepository(RefreshToken)
    private refreshTokensRepository: Repository<RefreshToken>,
    private configService: ConfigService,
  ) {
    this.maxSessions = this.configService.get<number>('app.maxSessions') ?? 5;
  }

  async getSessions(userId: string) {
    const sessions = await this.refreshTokensRepository.find({
      where: { userId, revokedAt: IsNull(), isDeleted: false },
      order: { lastUsedAt: 'DESC' },
    });

    return sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      browser: s.deviceInfo?.browser,
      os: s.deviceInfo?.os,
      ipAddress: s.ipAddress,
      location: s.location,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      provider: s.provider,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.refreshTokensRepository.findOne({
      where: { id: sessionId, userId, isDeleted: false },
    });
    if (!session) {
      throw new NotFoundException({ code: ErrorCode.SESSION_NOT_FOUND, message: 'Session not found or already revoked' });
    }

    session.revokedAt = new Date();
    session.isDeleted = true;
    await this.refreshTokensRepository.save(session);
    return { message: 'Session revoked successfully' };
  }

  async revokeAllSessions(userId: string) {
    await this.refreshTokensRepository.update(
      { userId, isDeleted: false },
      { revokedAt: new Date(), isDeleted: true },
    );
    return { message: 'All sessions revoked successfully' };
  }

  async enforceSessionLimit(userId: string): Promise<void> {
    const activeCount = await this.refreshTokensRepository.count({
      where: { userId, revokedAt: IsNull(), isDeleted: false },
    });
    if (activeCount >= this.maxSessions) {
      const oldest = await this.refreshTokensRepository.find({
        where: { userId, revokedAt: IsNull(), isDeleted: false },
        order: { createdAt: 'ASC' },
        take: 1,
      });
      if (oldest.length > 0) {
        oldest[0].revokedAt = new Date();
        await this.refreshTokensRepository.save(oldest[0]);
      }
    }
  }

  async persistRefreshToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    ctx: TokenContext,
    deviceInfo: { browser?: string; os?: string; deviceName?: string },
  ): Promise<void> {
    const entity = this.refreshTokensRepository.create({
      userId,
      tokenHash,
      expiresAt,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      deviceName: deviceInfo.deviceName ?? null,
      deviceInfo: { browser: deviceInfo.browser, os: deviceInfo.os },
      provider: ctx.provider ?? null,
      lastUsedAt: new Date(),
      isDeleted: false,
    });
    await this.refreshTokensRepository.save(entity);
  }

  async revokeSessionByTokenHash(tokenHash: string) {
    await this.refreshTokensRepository.update(
      { tokenHash },
      { revokedAt: new Date(), isDeleted: true },
    );
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.refreshTokensRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });
  }

  async save(session: RefreshToken) {
    return this.refreshTokensRepository.save(session);
  }
}
