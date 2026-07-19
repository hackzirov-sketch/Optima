import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
  private readonly logger = new Logger(TokenService.name);

  /** Tolerance window for concurrent refresh requests racing on the same
   * still-valid token (e.g. two open tabs) before treating reuse as theft. */
  private static readonly REUSE_GRACE_MS = 20_000;

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
    // Parallel JWT signing (both are CPU-bound, independent)
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpires'),
      } as any),
    ]);
    return { accessToken, refreshToken, jti };
  }

  async generateTokens(user: User, ctx: TokenContext = {}) {
    const refreshExpires = this.configService.get<string>('jwt.refreshExpires') || '7d';
    const expiresAt = new Date(Date.now() + ms(refreshExpires as any));
    const deviceInfo = this.deviceService.parseDeviceInfo(ctx.userAgent, ctx.deviceName);

    // Parallel: enforceSessionLimit + buildJwtPair (independent)
    const [{ accessToken, refreshToken }] = await Promise.all([
      this.buildJwtPair(user),
      this.sessionService.enforceSessionLimit(user.id),
    ]);

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Must complete before we hand the refreshToken back to the client — otherwise
    // a client that refreshes again within milliseconds (e.g. two visibilitychange
    // events firing back-to-back) can race findByTokenHash() against this INSERT
    // and get a spurious "invalid token" 401, wiping the session it was just given.
    await this.sessionService.persistRefreshToken(user.id, tokenHash, expiresAt, ctx, deviceInfo);

    // SECURITY: raw-SQL rows are plain objects, not User class instances, so the
    // @Exclude() on User.passwordHash is NOT applied by ClassSerializerInterceptor.
    // Strip it explicitly here — this is the single choke point every login/register/
    // oauth/refresh flow returns through.
    const { passwordHash: _omit, ...safeUser } = user;

    return {
      requiresPasswordSetup: user.needsPasswordSetup,
      accessToken,
      refreshToken,
      user: safeUser,
    };
  }

  async verifyAccessToken(token: string): Promise<string | null> {
    try {
      const secret = this.configService.get<string>('jwt.accessSecret');
      const decoded = await this.jwtService.verifyAsync<{ sub?: string }>(token, { secret });
      return decoded?.sub || null;
    } catch {
      return null;
    }
  }

  async refresh(refreshToken: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const storedToken = await this.sessionService.findByTokenHash(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired refresh token',
      });
    }

    if (storedToken.revokedAt) {
      // Already rotated. Within a short grace window this is almost always
      // a benign race between two concurrent requests for the same
      // still-valid token — e.g. the same account open in two tabs, both
      // refreshing within milliseconds of each other around token expiry —
      // not an attacker replaying a stolen token: genuine reuse of a
      // rotated-out token typically resurfaces well after rotation, not
      // within the same instant. Only escalate to a full session wipe once
      // we're clearly past that window.
      const msSinceRevoked = Date.now() - storedToken.revokedAt.getTime();
      if (msSinceRevoked > TokenService.REUSE_GRACE_MS) {
        await this.sessionService.revokeAllSessions(storedToken.userId);
        throw new UnauthorizedException({
          code: ErrorCode.TOKEN_REVOKED,
          message: 'Token reuse detected. All sessions revoked.',
        });
      }
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Refresh already in progress — retry with the latest token',
      });
    }

    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired refresh token',
      });
    }

    // Atomic claim: only the request that actually flips revoked_at from
    // NULL proceeds. A concurrent request that loses this race falls into
    // the grace-window branch above instead of both requests independently
    // rotating the same token.
    const claimed = await this.sessionService.claimRefreshToken(storedToken.id);
    if (!claimed) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Refresh already in progress — retry with the latest token',
      });
    }

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
