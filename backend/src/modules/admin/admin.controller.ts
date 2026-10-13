import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HttpAdapterHost } from '@nestjs/core';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from './super-admin.guard';

@ApiTags('admin')
@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly http: HttpAdapterHost,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Platform at a glance: online now, users, rooms, meetings, requests, AI' })
  overview() {
    return this.admin.overview();
  }

  @Get('users')
  users(@Query('q') q = '', @Query('page') page?: string, @Query('filter') filter?: string) {
    return this.admin.users(q, page, filter);
  }

  @Post('users/:id/block')
  blockUser(@CurrentUser('id') actorId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { reason?: string }) {
    return this.admin.setUserBlocked(actorId, id, true, body?.reason);
  }

  @Post('users/:id/unblock')
  unblockUser(@CurrentUser('id') actorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.setUserBlocked(actorId, id, false);
  }

  @Get('users/:id/sessions')
  @ApiOperation({ summary: "A person's active sessions (devices)" })
  userSessions(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.userSessions(id);
  }

  @Post('users/:id/sessions/revoke')
  @ApiOperation({ summary: 'Sign a person out on every device (no block)' })
  revokeSessions(@CurrentUser('id') actorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.revokeUserSessions(actorId, id);
  }

  /** Every route the API serves (method + path), for the admin site's API page. */
  @Get('routes')
  @ApiOperation({ summary: 'All HTTP routes registered on the API' })
  routes() {
    const app = this.http.httpAdapter.getInstance() as { router?: { stack?: unknown[] }; _router?: { stack?: unknown[] } };
    const stack = (app.router?.stack ?? app._router?.stack ?? []) as Array<{ route?: { path?: string; methods?: Record<string, boolean> } }>;
    const routes = stack
      .filter((layer) => layer.route?.path)
      .filter((layer) => !layer.route!.path!.includes('*'))
      .flatMap((layer) => Object.keys(layer.route!.methods ?? {})
        .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map((method) => ({ method: method.toUpperCase(), path: layer.route!.path! })))
      .filter((route, index, all) => all.findIndex((other) => other.method === route.method && other.path === route.path) === index)
      .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    return { total: routes.length, routes };
  }

  @Get('rooms')
  rooms(@Query('q') q = '', @Query('page') page?: string, @Query('type') type?: string, @Query('filter') filter?: string) {
    return this.admin.rooms(q, page, type, filter);
  }

  @Post('rooms/:id/block')
  blockRoom(@CurrentUser('id') actorId: string, @Param('id', ParseUUIDPipe) id: string, @Body() body: { reason?: string }) {
    return this.admin.setRoomBlocked(actorId, id, true, body?.reason);
  }

  @Post('rooms/:id/unblock')
  unblockRoom(@CurrentUser('id') actorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.setRoomBlocked(actorId, id, false);
  }

  @Post('rooms/:id/join')
  joinRoom(@CurrentUser('id') actorId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.admin.joinRoom(actorId, id);
  }

  @Get('requests')
  requests() {
    return this.admin.requests();
  }

  @Get('meetings')
  meetings() {
    return this.admin.liveMeetings();
  }

  @Get('audit')
  audit(@Query('page') page?: string) {
    return this.admin.auditLog(page);
  }
}
