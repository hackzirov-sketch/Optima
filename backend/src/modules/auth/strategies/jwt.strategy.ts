import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { UsersService } from '../../users/services/users.service';
import { RedisService } from '../../../redis/redis.service';
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

  async validate(payload: { sub: string; jti?: string; workspaceId?: string }) {
    // OPTIMIZED: Single pipeline — blacklist + sessionBlock + cachedUser in 1 Redis RTT
    const [blacklisted, sessionBlocked, cachedUser] =
      await this.redisService.validateTokenPipeline(payload.sub, payload.jti);

    if (blacklisted) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_REVOKED,
        message: 'Token has been revoked',
      });
    }

    if (sessionBlocked) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_REVOKED,
        message: 'All sessions for this account have been revoked',
      });
    }

    let user = cachedUser;
    if (!user) {
      user = await this.usersService.findById(payload.sub);
      if (user) {
        // fire-and-forget cache write — don't block response
        this.redisService.cacheUser(payload.sub, user, 30).catch(() => null);
      }
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCOUNT_INACTIVE,
        message: 'Account is inactive or user not found',
      });
    }
    // Carried on req.user so @CurrentUser('workspaceId') can read the
    // workspace this token was scoped to via POST /workspaces/:wsId/select.
    return { ...user, workspaceId: payload.workspaceId };
  }
}
