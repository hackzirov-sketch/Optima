import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorCode } from '../../../common/enums/error-code.enum';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException({
          code: ErrorCode.TOKEN_INVALID,
          message:
            info?.message === 'jwt expired'
              ? 'Refresh token expired, please log in again'
              : 'Invalid or expired refresh token',
        })
      );
    }
    return user;
  }
}
