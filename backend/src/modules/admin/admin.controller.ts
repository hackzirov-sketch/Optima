import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from './super-admin.guard';

@ApiTags('admin')
@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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
