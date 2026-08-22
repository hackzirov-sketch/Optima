import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../users/services/users.service';
import { RedisService, CachedUser } from '../../../redis/redis.service';
import type { User } from '../../../database/entities/user.entity';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { ACCESS_COOKIE } from '../../../common/utils/auth-cookies.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private redisService: RedisService,
  ) {
    super({
      // Tokens live in an httpOnly cookie now, not a Bearer header — nothing
      // JS-readable holds them, so an XSS bug can't read/exfiltrate one.
      jwtFromRequest: (req: Request) => req?.cookies?.[ACCESS_COOKIE] ?? null,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: {
    sub: string;
    jti?: string;
    iat?: number;
    groupId?: string;
  }) {
    // OPTIMIZED: Single pipeline — blacklist + sessionBlock + cachedUser in 1 Redis RTT
    const [blacklisted, sessionBlockCutoff, cachedUser] =
      await this.redisService.validateTokenPipeline(payload.sub, payload.jti);

    if (blacklisted) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_REVOKED,
        message: 'Token has been revoked',
      });
    }

    // "Revoke all sessions" can't just flag the account — that would lock the
    // user out of the session they log into next. It records a cutoff instead,
    // and only tokens minted at or before it are rejected.
    if (
      sessionBlockCutoff !== null &&
      (payload.iat === undefined || payload.iat <= sessionBlockCutoff)
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_REVOKED,
        message: 'All sessions for this account have been revoked',
      });
    }

    // A cache hit comes back JSON-parsed, so its date columns are strings
    // rather than Dates (see CachedUser). Nothing downstream reads them —
    // req.user is used for identity and permissions — so the two shapes are
    // interchangeable here, but the union keeps that fact visible instead of
    // pretending a round-tripped row is still a User.
    let user: User | CachedUser | null = cachedUser;
    if (!user) {
      const fresh = await this.usersService.findById(payload.sub);
      if (fresh) {
        // fire-and-forget cache write — don't block response
        this.redisService.cacheUser(payload.sub, fresh, 30).catch(() => null);
      }
      user = fresh;
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCOUNT_INACTIVE,
        message: 'Account is inactive or user not found',
      });
    }
    // Carried on req.user so @CurrentUser('groupId') can read the
    // group this token was scoped to via POST /groups/:groupId/select.
    return { ...user, groupId: payload.groupId };
  }
}
