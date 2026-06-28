import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import ms from 'ms';
import { RedisService } from '../../../redis/redis.service';
import { User } from '../../../database/entities/user.entity';
import { SessionService } from './session.service';
import { DeviceService } from './device.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

interface TokenContext {
  ip?: string;
  userAgent?: string;
  deviceName?: string;
  provider?: string;
}

@Injectable()
export class TokenService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private sessionService: SessionService,
    private deviceService: DeviceService,
  ) {}

  async buildJwtPair(user: User): Promise<{ accessToken: string; refreshToken: string; jti: string }> {
    const jti = crypto.randomUUID();
    const payload = { sub: user.id, email: user.email, jti };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpires'),
    } as any);
    return { accessToken, refreshToken, jti };
  }

  async generateTokens(user: User, ctx: TokenContext = {}) {
    await this.sessionService.enforceSessionLimit(user.id);

    const { accessToken, refreshToken } = await this.buildJwtPair(user);

    const refreshExpires = this.configService.get<string>('jwt.refreshExpires') || '7d';
    const expiresAt = new Date(Date.now() + ms(refreshExpires as any));
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const deviceInfo = this.deviceService.parseDeviceInfo(ctx.userAgent, ctx.deviceName);
    await this.sessionService.persistRefreshToken(user.id, tokenHash, expiresAt, ctx, deviceInfo);

    return { requiresPasswordSetup: user.needsPasswordSetup, accessToken, refreshToken, user };
  }

  async refresh(refreshToken: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const storedToken = await this.sessionService.findByTokenHash(tokenHash);

    if (
      !storedToken ||
      storedToken.revokedAt ||
      new Date() > storedToken.expiresAt
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired refresh token',
      });
    }

    storedToken.revokedAt = new Date();
    await this.sessionService.save(storedToken);

    return this.generateTokens(storedToken.user, {
      ip: storedToken.ipAddress ?? undefined,
      userAgent: storedToken.userAgent ?? undefined,
      deviceName: storedToken.deviceName ?? undefined,
      provider: storedToken.provider ?? 'jwt-refresh',
    });
  }

  async logout(refreshToken: string, accessToken?: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    
    await this.sessionService.revokeSessionByTokenHash(tokenHash);

    if (accessToken) {
      try {
        const secret = this.configService.get<string>('jwt.accessSecret');
        const decoded = this.jwtService.verify<{ jti?: string; exp?: number }>(
          accessToken,
          { secret },
        );
        if (decoded?.jti && decoded?.exp) {
          const ttl = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
          await this.redisService.blacklistAccessToken(decoded.jti, ttl);
        }
      } catch {
        // ignore malformed access token on logout
      }
    }
  }
}
