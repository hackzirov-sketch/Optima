import {
  Controller,
  ParseUUIDPipe,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { ChatRoomService } from './services/room.service';
import { ChatMessageService } from './services/message.service';
import { ChatReactionService } from './services/reaction.service';
import { ChatAiService } from './services/ai.service';
import { ChatRoomInviteService } from './services/room-invite.service';
import { ChannelSettingsService } from './services/channel-settings.service';
import { MessageViewService } from './services/message-view.service';
import { ChatMemberService } from './services/member.service';
import { CommunityService } from './services/community.service';
import {
  ChatPresenceService,
  PresenceStatus,
} from './services/presence.service';
import { UsersService } from '../users/services/users.service';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { CreateRoomInviteDto } from './dto/create-room-invite.dto';
import { PresignAttachmentDto } from './dto/presing-attachment.dto';
import { AiRequestDto } from './dto/ai-request.dto';
import {
  UpdateChannelSettingsDto,
  SetMemberRoleDto,
  TransferOwnershipDto,
  RecordViewsDto,
} from './dto/channel-settings.dto';
import { UpdateRoomSettingsDto } from './dto/update-room-settings.dto';
import { BanMemberDto } from './dto/moderate-member.dto';
import { IpRateLimitGuard } from '../moderation/guards/ip-rate-limit.guard';
import { ChatRoomType } from '../../common/enums';
import { RedisService } from '../../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@Controller()
export class ChatController {
  constructor(
    private readonly roomService: ChatRoomService,
    private readonly messageService: ChatMessageService,
    private readonly reactionService: ChatReactionService,
    private readonly aiService: ChatAiService,
    private readonly roomInviteService: ChatRoomInviteService,
    private readonly memberService: ChatMemberService,
    private readonly storageService: StorageService,
    private readonly communityService: CommunityService,
    private readonly usersService: UsersService,
    private readonly presenceService: ChatPresenceService,
    private readonly redisService: RedisService,
    private readonly channelSettings: ChannelSettingsService,
    private readonly viewService: MessageViewService,
    private readonly events: EventEmitter2,
  ) {}

  /** Per-user (not per-IP) message send limit — mirrors the socket path's check in EventsGateway. */
  private async assertMessageRateLimit(userId: string): Promise<void> {
    const { exceeded, retryAfterSeconds } =
      await this.redisService.checkChatMessageRateLimit(userId);
    if (exceeded) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many messages. Try again in ${retryAfterSeconds}s.`,
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ── OTIMA community (ported from main) ────────────────────────────────────
  @Get('chat/community')
  @ApiOperation({
    summary: 'Get mandatory OTIMA community channel and discussion group',
  })
  community(@CurrentUser('id') userId: string) {
    return this.communityService.overview(userId);
  }

  @Get('chat/community/:roomId/members')
  @ApiOperation({ summary: 'List community room members' })
  communityMembers(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Query('query') query = '',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.listMembers(
      roomId,
      userId,
      query,
      Number(page) || 1,
      Number(limit) || 30,
    );
  }

  @Get('chat/community/:roomId/shared/:kind')
  @ApiOperation({
    summary: 'List shared media/files/links/music/voice in a community room',
  })
  communityShared(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('kind') kind: 'media' | 'files' | 'links' | 'music' | 'voice',
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.shared(
      roomId,
      userId,
      kind,
      cursor,
      Number(limit) || 30,
    );
  }

  @Post('chat/community/posts/:messageId/discussion')
  @ApiOperation({
    summary: 'Get or create the discussion-group thread for a channel post',
  })
  communityDiscussion(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.communityService.getOrCreateDiscussion(messageId, userId);
  }

  @Patch('chat/community/:roomId/members/:username/role')
  @ApiOperation({
    summary: 'Promote/demote a community member (admin/owner only)',
  })
  communityUpdateMemberRole(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('username') username: string,
    @Body('role') role: 'member' | 'admin',
    @CurrentUser('id') userId: string,
  ) {
    return this.communityService.updateMemberRole(
      roomId,
      username,
      role,
      userId,
    );
  }

  /**
   * The primary listing. Chat membership is itself the permission, so the JWT
   * is all the authorisation needed — no group in the path, and DMs,
   * groups and channels the user opened outside any group are included.
   */
  @Get('chat/rooms')
  @ApiOperation({ summary: 'List every chat room the caller belongs to' })
  listMyRooms(@CurrentUser('id') userId: string) {
    return this.roomService.listUserRooms(userId);
  }

  @Get('groups/:groupId/chat/rooms')
  @ApiOperation({
    summary:
      'List chat rooms for a group — a filtered view of GET /chat/rooms; user-owned rooms (direct/group/channel) are always included',
  })
  @ApiParam({ name: 'groupId' })
  listGroupRooms(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.roomService.listRooms(groupId, userId);
  }

  @Post('groups/:groupId/chat/rooms')
  @ApiOperation({ summary: 'Create chat room in a group' })
  createRoom(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChatRoomDto,
  ) {
    return this.roomService.createRoom(groupId, userId, dto);
  }

  @Get('groups/:groupId/chat/resolve/:type/:identifier')
  @ApiOperation({
    summary:
      'Resolve a /u, /g or /ch route identifier (username, slug or public_id) to its internal room — the only entry point that ever turns a public route into a room UUID',
  })
  @ApiParam({ name: 'type', enum: ['direct', 'group', 'channel'] })
  async resolveRoute(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Param('type') type: string,
    @Param('identifier') identifier: string,
    @CurrentUser('id') userId: string,
  ) {
    if (type === 'direct') {
      const target = await this.usersService.findPublic(identifier);
      const room = await this.roomService.createRoom(groupId, userId, {
        type: ChatRoomType.DIRECT,
        targetUserId: target.id,
      });
      return {
        roomId: room.id,
        type: room.type,
        slug: room.slug ?? null,
        publicId: room.publicId,
      };
    }
    return this.roomService.resolveRoomIdentifier(identifier, userId);
  }

  /**
   * Create a direct chat, group or channel with no group involved — the
   * JWT identifies the owner and that is the whole authorisation check. This
   * is the route the chat UI uses; the group-scoped POST above only exists
   * for rooms that genuinely belong to a group.
   */
  @Post('chat/rooms')
  @ApiOperation({
    summary: 'Create a chat room (direct/group/channel) without a group',
  })
  createStandaloneRoom(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChatRoomDto,
  ) {
    return this.roomService.createRoom(null, userId, dto);
  }

  @Get('chat/rooms/:roomId')
  @ApiOperation({ summary: 'Get chat room' })
  getRoom(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.roomService.getRoom(roomId, userId);
  }

  @Get('chat/rooms/:roomId/members')
  @ApiOperation({ summary: 'List room members (search + paginated)' })
  listRoomMembers(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Query('q') q = '',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.listMembers(
      roomId,
      userId,
      q,
      Number(page) || 1,
      Number(limit) || 30,
    );
  }

  @Get('chat/presence')
  @ApiOperation({
    summary:
      'Bulk presence lookup (status + last-seen fallback) for a set of user ids — DMs can be cross-group, so this is not group-scoped',
  })
  async getPresenceBulk(@Query('ids') ids: string) {
    const userIds = (ids || '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 200);
    const [statuses, lastSeenById] = await Promise.all([
      this.presenceService.getPresenceBulk(userIds),
      this.usersService.getLastSeenBulk(userIds),
    ]);
    return userIds.reduce(
      (acc, id) => {
        acc[id] = {
          status: statuses[id] ?? PresenceStatus.OFFLINE,
          lastSeenAt: lastSeenById[id] ?? null,
        };
        return acc;
      },
      {} as Record<
        string,
        { status: PresenceStatus; lastSeenAt: string | null }
      >,
    );
  }

  @Get('chat/rooms/:roomId/read-receipts')
  @ApiOperation({
    summary: "Other active members' read position (last_read_seq) in a room",
  })
  getReadReceipts(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.memberService.getReadReceipts(roomId, userId);
  }

  @Get('chat/rooms/:roomId/shared')
  @ApiOperation({
    summary: 'List shared media/files/links/music/voice in a room',
  })
  listRoomShared(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Query('kind') kind: 'media' | 'files' | 'links' | 'music' | 'voice',
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.shared(
      roomId,
      userId,
      kind,
      cursor,
      Number(limit) || 30,
    );
  }

  @Get('chat/rooms/:roomId/messages')
  @ApiOperation({ summary: 'List messages (paginated by sequence or offset)' })
  listMessages(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.messageService.listMessages(
      roomId,
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
      cursor ? parseInt(cursor, 10) : undefined,
    );
  }

  @Post('chat/rooms/:roomId/messages')
  @SkipThrottle()
  @ApiOperation({ summary: 'Send message (REST fallback)' })
  async sendMessage(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    await this.assertMessageRateLimit(userId);
    const saved = await this.messageService.sendMessage(roomId, userId, dto);
    // The socket path broadcasts by itself; this one used to reach nobody.
    this.events.emit('chat.message_created', saved);
    return saved;
  }

  @Delete('chat/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete message' })
  async deleteMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.messageService.deleteMessage(messageId, userId);
  }

  @Get('chat/rooms/:roomId/pins')
  @ApiOperation({ summary: 'Pinned messages, newest first' })
  listPinned(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messageService.listPinned(roomId, userId);
  }

  @Post('chat/messages/:messageId/pin')
  @ApiOperation({ summary: 'Pin a message (DM: either member; else admins)' })
  pinMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messageService.setPinned(messageId, userId, true);
  }

  @Delete('chat/messages/:messageId/pin')
  @ApiOperation({ summary: 'Unpin a message' })
  unpinMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messageService.setPinned(messageId, userId, false);
  }

  @Patch('chat/messages/:messageId')
  @ApiOperation({ summary: 'Edit message' })
  updateMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messageService.updateMessage(messageId, userId, dto);
  }

  @Get('chat/messages/:messageId/thread')
  @ApiOperation({
    summary: 'Get a message’s Slack-style thread (root + replies)',
  })
  getThread(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messageService.getThread(messageId, userId);
  }

  @Post('chat/messages/:messageId/thread')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Post a reply into a message’s thread (REST fallback — prefer the socket event)',
  })
  async sendThreadReply(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    await this.assertMessageRateLimit(userId);
    return this.messageService.sendThreadReply(messageId, userId, dto);
  }

  @Post('chat/messages/:messageId/reactions')
  @ApiOperation({ summary: 'Add reaction' })
  addReaction(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddReactionDto,
  ) {
    return this.reactionService.addReaction(messageId, userId, dto);
  }

  @Delete('chat/messages/:messageId/reactions/:emoji')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove own reaction' })
  async removeReaction(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.reactionService.removeReaction(
      messageId,
      userId,
      decodeURIComponent(emoji),
    );
  }

  // ── Views ─────────────────────────────────────────────────────────────────

  /**
   * Reports messages the caller has seen. Batched by the client and buffered
   * in Redis here, so this stays a single round-trip no matter how fast the
   * timeline scrolls.
   */
  @Post('chat/rooms/:roomId/views')
  @HttpCode(HttpStatus.ACCEPTED)
  @SkipThrottle()
  @ApiOperation({ summary: 'Mark messages as viewed (buffered, batched)' })
  @ApiParam({ name: 'roomId' })
  recordViews(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: RecordViewsDto,
  ) {
    return this.viewService.recordViews(roomId, userId, dto.messageIds);
  }

  @Get('chat/messages/:messageId/views')
  @ApiOperation({
    summary:
      'Who read a message — the full list for the author in a group, a bare count in a channel',
  })
  @ApiParam({ name: 'messageId' })
  listMessageViewers(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.viewService.listViewers(messageId, userId);
  }

  // ── Channel settings ──────────────────────────────────────────────────────

  /**
   * Members get the subset that describes the room's rules to them;
   * moderators and above get the full configuration. `canAdminister` tells the
   * client which it received, so it never has to guess from missing keys.
   */
  @Get('chat/rooms/:roomId/settings')
  @ApiOperation({ summary: 'Read channel settings (scoped to the caller)' })
  @ApiParam({ name: 'roomId' })
  getChannelSettings(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelSettings.getForUser(roomId, userId);
  }

  @Patch('chat/rooms/:roomId/settings')
  @ApiOperation({
    summary: 'Update channel settings — admins and owners only, fully audited',
  })
  @ApiParam({ name: 'roomId' })
  updateChannelSettings(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateChannelSettingsDto,
  ) {
    return this.channelSettings.update(roomId, userId, dto);
  }

  @Get('chat/rooms/:roomId/settings/stats')
  @ApiOperation({
    summary: 'Channel analytics — subscribers, views, reach, top posts, growth',
  })
  @ApiParam({ name: 'roomId' })
  getChannelStats(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelSettings.getStats(roomId, userId);
  }

  @Get('chat/rooms/:roomId/settings/audit')
  @ApiOperation({ summary: 'Who changed which setting, most recent first' })
  @ApiParam({ name: 'roomId' })
  getChannelSettingsAudit(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Query('limit') limit = '50',
  ) {
    return this.channelSettings.listAudit(roomId, userId, Number(limit) || 50);
  }

  @Patch('chat/rooms/:roomId/members/:memberId/role')
  @ApiOperation({ summary: 'Promote or demote a member (admin/moderator)' })
  @ApiParam({ name: 'roomId' })
  @ApiParam({ name: 'memberId' })
  setMemberRole(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SetMemberRoleDto,
  ) {
    return this.channelSettings.setMemberRole(
      roomId,
      userId,
      memberId,
      dto.role,
    );
  }

  // ── Moderation: remove / ban / unban ──────────────────────────────────────
  // Admins and above, and never on someone at or above their own level.

  @Delete('chat/rooms/:roomId/members/:memberId')
  @ApiOperation({
    summary: 'Remove a member from the room — they may rejoin normally',
  })
  @ApiParam({ name: 'roomId', format: 'uuid' })
  @ApiParam({ name: 'memberId', format: 'uuid' })
  removeMember(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelSettings.removeMember(roomId, userId, memberId);
  }

  @Post('chat/rooms/:roomId/members/:memberId/ban')
  @ApiOperation({
    summary: 'Remove a member and keep them out (optionally until a date)',
  })
  @ApiParam({ name: 'roomId', format: 'uuid' })
  @ApiParam({ name: 'memberId', format: 'uuid' })
  banMember(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: BanMemberDto,
  ) {
    return this.channelSettings.banMember(
      roomId,
      userId,
      memberId,
      dto.until ? new Date(dto.until) : null,
    );
  }

  @Delete('chat/rooms/:roomId/members/:memberId/ban')
  @ApiOperation({
    summary: 'Lift a ban — does not put them back in the room',
  })
  @ApiParam({ name: 'roomId', format: 'uuid' })
  @ApiParam({ name: 'memberId', format: 'uuid' })
  unbanMember(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.channelSettings.unbanMember(roomId, userId, memberId);
  }

  @Post('chat/rooms/:roomId/transfer-ownership')
  @ApiOperation({ summary: 'Hand the room to another member — owner only' })
  @ApiParam({ name: 'roomId' })
  transferOwnership(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.channelSettings.transferOwnership(roomId, userId, dto.userId);
  }

  /**
   * Platform-wide search for public channels and groups. Group-less by
   * design — a channel opened from chat belongs to no group, so the
   * group-scoped listing below could never surface it.
   */
  @Get('chat/discover')
  @ApiOperation({
    summary: 'Search public channels and groups the caller has not joined',
  })
  @ApiQuery({ name: 'q', required: true, description: 'At least 2 characters' })
  @ApiQuery({ name: 'limit', required: false })
  discoverRooms(
    @CurrentUser('id') userId: string,
    @Query('q') q = '',
    @Query('limit') limit = '20',
  ) {
    return this.roomService.discoverRooms(userId, q, Number(limit) || 20);
  }

  @Get('groups/:groupId/chat/public-rooms')
  @ApiOperation({ summary: 'List public rooms the user has not joined' })
  listPublicRooms(
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.roomService.listPublicRooms(groupId, userId);
  }

  @Post('chat/rooms/:roomId/join')
  @ApiOperation({ summary: 'Join a public room' })
  joinPublicRoom(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.roomService.joinPublicRoom(roomId, userId);
  }

  @Post('chat/rooms/:roomId/invite-code')
  @ApiOperation({
    summary: '(legacy) Generate / retrieve a single unlimited room invite link',
    description:
      'Kept for backward compatibility. New clients should use POST /chat/rooms/:roomId/invites for full control (max uses, expiry, multiple links).',
  })
  async getInviteCode(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    const invites = await this.roomInviteService.list(roomId, userId);
    const existing = invites.find(
      (i) => i.isActive && i.maxUses === null && !i.expiresAt,
    );
    if (existing) return { code: existing.code };
    const created = await this.roomInviteService.create(roomId, userId, {});
    return { code: created.code };
  }

  @Delete('chat/rooms/:roomId/invite-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: '(legacy) Revoke the single unlimited room invite link',
  })
  async revokeInviteCode(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    const invites = await this.roomInviteService.list(roomId, userId);
    const actives = invites.filter(
      (i) => i.isActive && i.maxUses === null && !i.expiresAt,
    );
    for (const inv of actives) {
      await this.roomInviteService.revoke(roomId, inv.id, userId);
    }
  }

  // ── Room invites (chat_room_invites, full management) ──────────────
  @Post('chat/rooms/:roomId/invites')
  @ApiOperation({
    summary: 'Create a room invite link (optionally limited uses / expiry)',
  })
  createRoomInvite(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRoomInviteDto,
  ) {
    return this.roomInviteService.create(roomId, userId, dto);
  }

  @Get('chat/rooms/:roomId/invites')
  @ApiOperation({
    summary: 'List invite links for a room (creator or lead+ only)',
  })
  listRoomInvites(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.roomInviteService.list(roomId, userId);
  }

  @Delete('chat/rooms/:roomId/invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific room invite link' })
  async revokeRoomInvite(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Param('inviteId', ParseUUIDPipe) inviteId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.roomInviteService.revoke(roomId, inviteId, userId);
  }

  @Post('chat/join/:code')
  @UseGuards(IpRateLimitGuard)
  @ApiOperation({ summary: 'Join room by invite code' })
  joinByCode(@Param('code') code: string, @CurrentUser('id') userId: string) {
    return this.roomInviteService.joinByCode(code, userId);
  }

  /**
   * The room resource itself — name, description, avatar, wallpaper, slug,
   * visibility. Deliberately NOT `/settings`: that path belongs to
   * updateChannelSettings above, and declaring both on it meant only the
   * first-registered handler was ever reachable (see UpdateRoomSettingsDto).
   */
  @Patch('chat/rooms/:roomId')
  @ApiOperation({
    summary:
      'Update room identity/appearance (name, description, avatar, background, slug, scope) — owner/admin only',
  })
  @ApiParam({ name: 'roomId', format: 'uuid' })
  updateRoomSettings(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateRoomSettingsDto,
  ) {
    return this.roomService.updateRoomSettings(roomId, userId, dto);
  }

  @Get('chat/rooms/:roomId/appearance')
  @ApiOperation({
    summary: 'Get the caller’s personal appearance override for a room',
  })
  getChatAppearance(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.roomService.getUserChatSettings(roomId, userId);
  }

  @Patch('chat/rooms/:roomId/appearance')
  @ApiOperation({
    summary:
      'Update the caller’s personal wallpaper/theme/font-size/compact-mode/animation for a room',
  })
  updateChatAppearance(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body()
    dto: {
      backgroundUrl?: string | null;
      backgroundType?:
        'DEFAULT' | 'IMAGE' | 'COLOR' | 'GRADIENT' | 'PATTERN' | null;
      theme?: string | null;
      fontSize?: number | null;
      compactMode?: boolean;
      animationEnabled?: boolean;
    },
  ) {
    return this.roomService.upsertUserChatSettings(roomId, userId, dto);
  }

  @Get('chat/rooms/:roomId/draft')
  @ApiOperation({
    summary: 'Get the caller’s unsent draft text for a room (Telegram-style)',
  })
  getDraft(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.messageService.getDraft(roomId, userId);
  }

  @Patch('chat/rooms/:roomId/draft')
  @ApiOperation({
    summary: 'Save (or, if empty, clear) the caller’s draft text for a room',
  })
  saveDraft(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body('content') content: string,
  ) {
    return this.messageService.saveDraft(roomId, userId, content ?? '');
  }

  @Patch('chat/rooms/:roomId/mute')
  @ApiOperation({
    summary: 'Mute/unmute notifications for a room (caller only)',
  })
  setRoomMuted(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: { muted: boolean },
  ) {
    return this.memberService.setMuted(roomId, userId, dto.muted);
  }

  @Post('chat/rooms/:roomId/leave')
  @ApiOperation({
    summary: 'Leave a group/channel (the room stays for everyone else)',
  })
  leaveRoom(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.roomService.leaveRoom(roomId, userId);
  }

  @Delete('chat/rooms/:roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a chat room (DM or group if creator)' })
  async deleteRoom(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.roomService.deleteRoom(roomId, userId);
  }

  @Post('chat/ai')
  @Throttle({
    short: { limit: 2, ttl: 1000 },
    standard: { limit: 18, ttl: 90000 },
  })
  @ApiOperation({ summary: 'AI assistant chat response' })
  async aiReply(@Body() dto: AiRequestDto, @CurrentUser('id') userId: string) {
    return this.aiService.generateAiReply(
      dto.message,
      dto.history ?? [],
      userId,
    );
  }

  // ── Media attachment upload ────────────────────────────────────────────────
  /**
   * POST /chat/rooms/:roomId/attachments/presign
   *
   * Returns a presigned R2 PUT URL. Upload flow:
   *  1. Client calls this → gets { uploadUrl, storageKey, storageUrl, expiresIn }
   *  2. Client PUTs raw file bytes to `uploadUrl` with header Content-Type: <mimeType>
   *  3. Client includes { storageKey, storageUrl, fileName, fileSize, mimeType }
   *     in the `attachments[]` array of the send-message payload
   *
   * Allowed: images, audio/voice, video, pdf, zip, apk, office docs — up to 100 MB.
   */
  @Post('chat/rooms/:roomId/attachments/presign')
  @ApiOperation({ summary: 'Get R2 presigned PUT URL for a chat attachment' })
  async presignAttachment(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: PresignAttachmentDto,
  ) {
    // Ensure user is in the room before handing out upload credentials
    await this.memberService.assertRoomMember(roomId, userId);
    return this.storageService.getPresignedUploadUrl(
      'attachments',
      userId,
      dto.fileName,
      dto.mimeType,
      dto.fileSize,
    );
  }

  @Post('chat/rooms/:roomId/attachments/audio')
  @ApiOperation({ summary: 'Upload a recorded voice message' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  async uploadAudio(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    await this.memberService.assertRoomMember(roomId, userId);
    const mimeType = file?.mimetype?.split(';')[0];
    const allowed = new Set([
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
    ]);
    if (!file?.buffer || !mimeType || !allowed.has(mimeType)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'A valid audio recording is required',
      });
    }
    return this.storageService.uploadChatAudio(file.buffer, userId, mimeType);
  }

  @Post('chat/rooms/:roomId/attachments/file')
  @ApiOperation({ summary: 'Upload a chat file through the API' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }),
  )
  async uploadFile(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile()
    file?: {
      buffer: Buffer;
      mimetype: string;
      size: number;
      originalname: string;
    },
  ) {
    await this.memberService.assertRoomMember(roomId, userId);
    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'A valid file is required',
      });
    }
    const mimeType = file.mimetype?.split(';')[0] || 'application/octet-stream';
    return this.storageService.uploadChatAttachment(
      file.buffer,
      userId,
      file.originalname,
      mimeType,
    );
  }

  // ── Chat Invite Accept / Decline ──────────────────────────────────────────

  @Get('chat/invites/pending')
  @ApiOperation({
    summary: 'List all pending chat invites for the current user',
  })
  listPendingChatInvites(@CurrentUser('id') userId: string) {
    return this.memberService.listPendingInvites(userId);
  }

  @Post('chat/rooms/:roomId/invite/accept')
  @ApiOperation({ summary: 'Accept a pending DM / room invite' })
  acceptChatInvite(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.memberService.acceptChatInvite(roomId, userId);
  }

  @Post('chat/rooms/:roomId/invite/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a pending DM / room invite' })
  declineChatInvite(
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.memberService.declineChatInvite(roomId, userId);
  }
}
