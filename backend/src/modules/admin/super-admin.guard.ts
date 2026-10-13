import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isSuperAdmin } from '../../common/super-admin';

/** Lets through only the user ids listed in SUPER_ADMIN_USER_IDS. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: { id?: string } }>();
    if (isSuperAdmin(request.user?.id)) return true;
    throw new ForbiddenException({ code: 'SUPER_ADMIN_ONLY', message: 'Optima admins only' });
  }
}
