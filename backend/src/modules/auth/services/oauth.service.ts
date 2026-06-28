import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../../redis/redis.service';
import { EncryptionService } from '../../../common/services/encryption.service';
import { GithubAccount } from '../../../database/entities/github-account.entity';
import { User } from '../../../database/entities/user.entity';
import { GoogleOAuthProfile, GitHubOAuthProfile } from '../interfaces/oauth-profiles.interface';
import { TokenService } from './token.service';
import { DeviceService } from './device.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

@Injectable()
export class OAuthService {
  constructor(
    private usersService: UsersService,
    private redisService: RedisService,
    private encryptionService: EncryptionService,
    private tokenService: TokenService,
    private deviceService: DeviceService,
    @InjectRepository(GithubAccount)
    private githubAccountsRepository: Repository<GithubAccount>,
  ) {}

  async googleLogin(googleUser: GoogleOAuthProfile, ip?: string, userAgent?: string) {
    if (!googleUser) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Google authentication failed',
      });
    }

    let user = await this.usersService.findByEmail(googleUser.email);

    if (!user) {
      const username = googleUser.email.split('@')[0] + crypto.randomInt(1000);
      user = await this.usersService.create({
        email: googleUser.email,
        firstName: googleUser.firstName || googleUser.email.split('@')[0],
        lastName: googleUser.lastName || '',
        username,
        avatarUrl: googleUser.picture,
        isVerified: true,
        passwordHash: null,
        providers: ['google'],
        needsPasswordSetup: true,
      });

      // Usually would enqueue OnRegister here, let's just assume we return a flag or do it via event emitter or caller handles it
    }

    if (ip) {
      await this.deviceService.logIpAddress(user.id, ip, userAgent || '', 'google');
    }

    await this.usersService.updateLastSeen(user.id);

    return this.tokenService.generateTokens(user, { ip, userAgent, provider: 'google' });
  }

  async githubLogin(githubUser: GitHubOAuthProfile, ip?: string, userAgent?: string) {
    if (!githubUser) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'GitHub authentication failed',
      });
    }

    let githubAccount = await this.githubAccountsRepository.findOne({
      where: { githubUserId: Number(githubUser.githubId) },
      relations: ['user'],
    });

    let user: User | null = null;

    if (githubAccount) {
      user = githubAccount.user;
      githubAccount.accessTokenEncrypted = this.encryptionService.encrypt(
        githubUser.accessToken,
      );
      if (githubUser.refreshToken) {
        githubAccount.refreshTokenEncrypted = this.encryptionService.encrypt(
          githubUser.refreshToken,
        );
      }
      await this.githubAccountsRepository.save(githubAccount);
    } else {
      user = await this.usersService.findByEmail(githubUser.email!);

      if (!user) {
        user = await this.usersService.create({
          email: githubUser.email,
          firstName: githubUser.firstName || githubUser.email?.split('@')[0],
          lastName: githubUser.lastName || '',
          username: githubUser.username,
          avatarUrl: githubUser.avatarUrl,
          isVerified: true,
          passwordHash: null,
          providers: ['github'],
          needsPasswordSetup: true,
        });
      }

      githubAccount = this.githubAccountsRepository.create({
        userId: user.id,
        githubUserId: Number(githubUser.githubId),
        username: githubUser.username,
        email: githubUser.email,
        avatarUrl: githubUser.avatarUrl,
        accessTokenEncrypted: this.encryptionService.encrypt(githubUser.accessToken),
        refreshTokenEncrypted: githubUser.refreshToken
          ? this.encryptionService.encrypt(githubUser.refreshToken)
          : undefined,
      });
      await this.githubAccountsRepository.save(githubAccount);
    }

    if (user && ip) {
      await this.deviceService.logIpAddress(user.id, ip, userAgent || '', 'github');
    }

    if (user) {
      await this.usersService.updateLastSeen(user.id);
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
