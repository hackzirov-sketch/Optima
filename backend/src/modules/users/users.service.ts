import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User } from '../../database/entities/user.entity';
import { UserSettings } from '../../database/entities/user-settings.entity';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { PublicUserDto } from './dto/public-user.dto';
import { RedisService } from '../../redis/redis.service';
import { RedisKeys } from '../../redis/redis.keys';
import { ContentFilterService } from '../moderation/services/content-filter.service';
import { ImageModerationService } from '../moderation/services/image-moderation.service';

function parseExpiry(s: string): number {
  const n = parseInt(s, 10);
  if (s.endsWith('d')) return n * 86400;
  if (s.endsWith('h')) return n * 3600;
  if (s.endsWith('m')) return n * 60;
  return n;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(UserSettings)
    private settingsRepository: Repository<UserSettings>,
    @InjectRepository(RefreshToken)
    private refreshTokensRepository: Repository<RefreshToken>,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly contentFilter: ContentFilterService,
    private readonly imageModeration: ImageModerationService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }
    return user;
  }

  async findPublicById(id: string): Promise<PublicUserDto> {
    const user = await this.usersRepository.findOne({
      where: { id },
      select: ['id', 'firstName', 'lastName', 'username', 'avatarUrl', 'lastSeen'],
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      avatarUrl: user.avatarUrl,
      lastSeen: user.lastSeen,
    };
  }

  async findByIdWithRelations(id: string) {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: [
        'settings',
        'workspaceMemberships',
        'workspaceMemberships.workspace',
      ],
    });
    if (!user) {
      throw new NotFoundException({
        code: ErrorCode.USER_NOT_FOUND,
        message: 'User not found',
      });
    }

    const workspaces = user.workspaceMemberships.map((m) => ({
      role: m.role,
      joinedAt: m.joinedAt,
      ...m.workspace,
    }));

    return { ...user, workspaceMemberships: undefined, workspaces };
  }

  async findByEmail(email: string): Promise<User | null> {
    // Select only auth-critical fields — avoids fetching unused columns (avatarUrl, settings, etc.)
    return this.usersRepository.findOne({
      where: { email },
      select: ['id', 'email', 'passwordHash', 'isVerified', 'isActive', 'deletedAt',
               'providers', 'needsPasswordSetup', 'firstName', 'lastName', 'username', 'avatarUrl'],
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  async update(id: string, data: Partial<User>): Promise<void> {
    await this.usersRepository.update(id, data);
  }

  async updateLastSeen(userId: string): Promise<void> {
    const key = RedisKeys.lastSeen(userId);
    const client = this.redisService.getClient();
    if (client) {
      const isSet = await client.set(key, '1', 'EX', 30, 'NX');
      if (!isSet) return; // Debounce for 30 seconds
    }
    await this.usersRepository.update(userId, { lastSeen: new Date() });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const texts = [dto.firstName, dto.lastName].filter(Boolean) as string[];
    for (const t of texts) {
      await this.contentFilter.filterText(t, userId, 'profile');
    }
    await this.usersRepository.update(userId, dto);
    return this.findById(userId);
  }

  async updateSettings(
    userId: string,
    dto: UpdateSettingsDto,
  ): Promise<UserSettings> {
    await this.settingsRepository.update({ userId }, dto);
    const settings = await this.settingsRepository.findOne({
      where: { userId },
    });
    if (!settings) {
      throw new NotFoundException({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Settings not found',
      });
    }
    return settings;
  }

  async updateAvatar(userId: string, avatarUrl: string): Promise<User> {
    await this.imageModeration.filterImageUrl(avatarUrl, userId);
    await this.usersRepository.update(userId, { avatarUrl });
    return this.findById(userId);
  }

  async softDeleteAccount(userId: string): Promise<void> {
    await this.findById(userId);
    // Block all active access tokens before revoking refresh tokens.
    // TTL covers the max access-token lifetime so no valid token can slip through.
    const accessExpires = this.configService.get<string>('jwt.accessExpires') || '25m';
    const ttlSeconds = parseExpiry(accessExpires);
    await this.redisService.blockUserSessions(userId, ttlSeconds);
    await this.refreshTokensRepository.delete({ userId });
    await this.usersRepository.update(userId, {
      deletedBy: userId,
    });
    await this.usersRepository.softDelete(userId);
  }
}
