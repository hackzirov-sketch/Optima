import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { RedisService } from '../../../redis/redis.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
    private redisService: RedisService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret')!,
    });
  }

  async validate(payload: { sub: string; jti?: string }) {
    if (
      payload.jti &&
      (await this.redisService.isAccessTokenBlacklisted(payload.jti))
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_REVOKED,
        message: 'Token has been revoked',
      });
    }

    if (await this.redisService.isUserSessionBlocked(payload.sub)) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_REVOKED,
        message: 'All sessions for this account have been revoked',
      });
    }

    let user = await this.redisService.getCachedUser(payload.sub);
    if (!user) {
      user = await this.usersService.findById(payload.sub);
      if (user) {
        await this.redisService.cacheUser(payload.sub, user, 10);
      }
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCOUNT_INACTIVE,
        message: 'Account is inactive or user not found',
      });
    }
    return user;
  }
}
