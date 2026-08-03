import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  UpdateNotifPrefsDto,
  LinkTelegramDto,
} from './dto/update-notif-prefs.dto';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  list(
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.notificationsService.list(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 30,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  unreadCount(@CurrentUser('id') userId: string) {
    return this.notificationsService.unreadCount(userId);
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  readAll(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllRead(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markOne(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationsService.markRead(userId, id);
  }

  // ── Preferences ──────────────────────────────────────────────────────────────

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  getPrefs(@CurrentUser('id') userId: string) {
    return this.notificationsService.getPrefs(userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update notification preferences' })
  updatePrefs(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateNotifPrefsDto,
  ) {
    return this.notificationsService.updatePrefs(userId, dto);
  }

  // ── Telegram ─────────────────────────────────────────────────────────────────

  @Post('telegram/link')
  @ApiOperation({ summary: 'Link Telegram bot chat_id' })
  linkTelegram(
    @CurrentUser('id') userId: string,
    @Body() dto: LinkTelegramDto,
  ) {
    return this.notificationsService.linkTelegram(userId, dto.chatId);
  }

  @Delete('telegram/unlink')
  @ApiOperation({ summary: 'Unlink Telegram' })
  unlinkTelegram(@CurrentUser('id') userId: string) {
    return this.notificationsService.unlinkTelegram(userId);
  }
}
