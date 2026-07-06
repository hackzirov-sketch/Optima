import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../../redis/redis.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { User } from '../../../database/entities/user.entity';
import { GoogleOAuthProfile, GitHubOAuthProfile } from '../interfaces/oauth-profiles.interface';
import { TokenService } from './token.service';
import { DeviceService } from './device.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

const GITHUB_ACCOUNT_COLUMNS_SQL = `
  id, user_id AS "userId", github_user_id AS "githubUserId", username,
  avatar_url AS "avatarUrl", email, access_token_encrypted AS "accessTokenEncrypted",
  refresh_token_encrypted AS "refreshTokenEncrypted", token_expires_at AS "tokenExpiresAt",
  connected_at AS "connectedAt", created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private usersService: UsersService,
    private redisService: RedisService,
    private encryptionService: EncryptionService,
    private tokenService: TokenService,
    private deviceService: DeviceService,
    @InjectDataSource()
    private dataSource: DataSource,
    @InjectQueue('auth') private authQueue: Queue,
  ) {}

  private async generateUniqueUsername(base: string): Promise<string> {
    let username = base;
    let suffix = 0;
    while (await this.usersService.findByUsername(username)) {
      suffix++;
      username = `${base}${suffix}`;
    }
    return username;
  }

  private async enqueueOnRegister(userId: string, email: string): Promise<void> {
    try {
      await this.authQueue.add(
        'on-register',
        { userId, email },
        {
          jobId: `on-register_${userId}`,
          removeOnComplete: true,
          attempts: 3,
        },
      );
    } catch (error) {
      this.logger.warn(`BullMQ on-register failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  async googleLogin(googleUser: GoogleOAuthProfile, ip?: string, userAgent?: string) {
    if (!googleUser) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Google authentication failed',
      });
    }

    let user = await this.usersService.findByEmail(googleUser.email);

    if (!user) {
      const baseUsername = googleUser.email.split('@')[0];
      const username = await this.generateUniqueUsername(baseUsername);

      user = await this.usersService.create({
        email: googleUser.email,
        firstName: googleUser.firstName || baseUsername,
        lastName: googleUser.lastName || '',
        username,
        avatarUrl: googleUser.picture,
        isVerified: true,
        passwordHash: null,
        providers: ['google'],
        needsPasswordSetup: true,
      });

      void this.enqueueOnRegister(user.id, user.email);
    }

    if (ip) {
      await this.deviceService.logIpAddress(user.id, ip, userAgent || '', 'google');
    }

    void this.usersService.updateLastSeen(user.id);

    return this.tokenService.generateTokens(user, { ip, userAgent, provider: 'google' });
  }

  async githubLogin(githubUser: GitHubOAuthProfile, ip?: string, userAgent?: string) {
    if (!githubUser) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'GitHub authentication failed',
      });
    }

    const accountRows: Array<{
      id: string;
      userId: string;
      accessTokenEncrypted: string;
      refreshTokenEncrypted: string | null;
    }> = await this.dataSource.query(
      `SELECT ${GITHUB_ACCOUNT_COLUMNS_SQL} FROM github_accounts WHERE github_user_id = $1`,
      [Number(githubUser.githubId)],
    );
    let githubAccount = accountRows[0];

    let user: User | null = null;

    if (githubAccount) {
      user = await this.usersService.findById(githubAccount.userId);
      const accessTokenEncrypted = this.encryptionService.encrypt(githubUser.accessToken);
      const refreshTokenEncrypted = githubUser.refreshToken
        ? this.encryptionService.encrypt(githubUser.refreshToken)
        : githubAccount.refreshTokenEncrypted;

      await this.dataSource.query(
        `UPDATE github_accounts
         SET access_token_encrypted = $2, refresh_token_encrypted = $3, updated_at = now()
         WHERE id = $1`,
        [githubAccount.id, accessTokenEncrypted, refreshTokenEncrypted],
      );
    } else {
      const email = githubUser.email || `${githubUser.githubId}@github.placeholder.com`;
      user = await this.usersService.findByEmail(email);

      if (!user) {
        const username = await this.generateUniqueUsername(githubUser.username || `github_user_${githubUser.githubId}`);
        user = await this.usersService.create({
          email,
          firstName: githubUser.firstName || username,
          lastName: githubUser.lastName || '',
          username,
          avatarUrl: githubUser.avatarUrl,
          isVerified: true,
          passwordHash: null,
          providers: ['github'],
          needsPasswordSetup: true,
        });

        void this.enqueueOnRegister(user.id, user.email);
      }

      await this.dataSource.query(
        `INSERT INTO github_accounts
           (user_id, github_user_id, username, email, avatar_url,
            access_token_encrypted, refresh_token_encrypted)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          user.id,
          Number(githubUser.githubId),
          githubUser.username,
          email,
          githubUser.avatarUrl ?? null,
          this.encryptionService.encrypt(githubUser.accessToken),
          githubUser.refreshToken ? this.encryptionService.encrypt(githubUser.refreshToken) : null,
        ],
      );
    }

    if (user && ip) {
      await this.deviceService.logIpAddress(user.id, ip, userAgent || '', 'github');
    }

    if (user) {
      void this.usersService.updateLastSeen(user.id);
      return this.tokenService.generateTokens(user, { ip, userAgent, provider: 'github' });
    } else {
      throw new UnauthorizedException({ code: ErrorCode.OAUTH_LINK_FAILED, message: 'Failed to link or create user' });
    }
  }

  async createOAuthSessionCode(
    accessToken: string,
    refreshToken: string,
  ): Promise<string> {
    const code = crypto.randomUUID();
    await this.redisService.setOAuthCode(code, { accessToken, refreshToken });
    return code;
  }

  async exchangeOAuthSessionCode(code: string) {
    const data = await this.redisService.getAndDeleteOAuthCode(code);
    if (!data) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired session code',
      });
    }
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
  }
}
