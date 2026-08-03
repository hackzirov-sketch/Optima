import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { REFRESH_COOKIE } from '../../../common/utils/auth-cookies.util';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(private configService: ConfigService) {
    super({
      // The refresh token now travels only as an httpOnly cookie, never in
      // the request body — nothing JS-readable holds it.
      jwtFromRequest: (req: Request) => req?.cookies?.[REFRESH_COOKIE] ?? null,
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret')!,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: any) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    return { ...payload, refreshToken };
  }
}
