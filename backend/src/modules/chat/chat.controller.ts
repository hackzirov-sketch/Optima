import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

import { ChatRoomService } from './services/room.service';
import { ChatMessageService } from './services/message.service';
import { ChatReactionService } from './services/reaction.service';
import { ChatAiService } from './services/ai.service';
import { ChatRoomInviteService } from './services/room-invite.service';
import { ChatMemberService } from './services/member.service';
import { CommunityService } from './services/community.service';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { CreateRoomInviteDto } from './dto/create-room-invite.dto';
import { PresignAttachmentDto } from './dto/presing-attachment.dto';
import { AiRequestDto } from './dto/ai-request.dto';
import { IpRateLimitGuard } from '../moderation/guards/ip-rate-limit.guard';
import { RoomScope } from '../../common/enums';

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
  ) {}

  // ── OTIMA community (ported from main) ────────────────────────────────────
  @Get('chat/community')
  @ApiOperation({ summary: 'Get mandatory OTIMA community channel and discussion group' })
  community(@CurrentUser('id') userId: string) {
    return this.communityService.overview(userId);
  }

  @Get('chat/community/:roomId/members')
  @ApiOperation({ summary: 'List community room members' })
  communityMembers(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Query('query') query = '',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.listMembers(roomId, userId, query, Number(page) || 1, Number(limit) || 30);
  }

  @Get('chat/community/:roomId/shared/:kind')
  @ApiOperation({ summary: 'List shared media/files/links/music/voice in a community room' })
  communityShared(
    @Param('roomId') roomId: string,
    @Param('kind') kind: 'media' | 'files' | 'links' | 'music' | 'voice',
    @CurrentUser('id') userId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.shared(roomId, userId, kind, cursor, Number(limit) || 30);
  }

  @Post('chat/community/posts/:messageId/discussion')
  @ApiOperation({ summary: 'Get or create the discussion-group thread for a channel post' })
  communityDiscussion(@Param('messageId') messageId: string, @CurrentUser('id') userId: string) {
    return this.communityService.getOrCreateDiscussion(messageId, userId);
  }

  @Patch('chat/community/:roomId/members/:username/role')
  @ApiOperation({ summary: 'Promote/demote a community member (admin/owner only)' })
  communityUpdateMemberRole(
    @Param('roomId') roomId: string,
    @Param('username') username: string,
    @Body('role') role: 'member' | 'admin',
    @CurrentUser('id') userId: string,
  ) {
    return this.communityService.updateMemberRole(roomId, username, role, userId);
  }

  @Get('workspaces/:workspaceId/chat/rooms')
  @ApiOperation({ summary: 'List chat rooms for workspace (membership)' })
  @ApiParam({ name: 'workspaceId' })
  listWorkspaceRooms(@Param('workspaceId') workspaceId: string, @CurrentUser('id') userId: string) {
    return this.roomService.listRooms(workspaceId, userId);
  }

  @Post('workspaces/:workspaceId/chat/rooms')
  @ApiOperation({ summary: 'Create chat room in a workspace' })
  createRoom(@Param('workspaceId') workspaceId: string, @CurrentUser('id') userId: string, @Body() dto: CreateChatRoomDto) {
    return this.roomService.createRoom(workspaceId, userId, dto);
  }

  @Post('chat/rooms')
  @ApiOperation({ summary: 'Create a standalone chat room (private/public, no workspace)' })
  createStandaloneRoom(@CurrentUser('id') userId: string, @Body() dto: CreateChatRoomDto) {
    return this.roomService.createRoom(null, userId, dto);
  }

  @Get('chat/rooms/:roomId')
  @ApiOperation({ summary: 'Get chat room' })
  getRoom(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    return this.roomService.getRoom(roomId, userId);
  }

  @Get('chat/rooms/:roomId/members')
  @ApiOperation({ summary: 'List room members (search + paginated)' })
  listRoomMembers(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Query('q') q = '',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.listMembers(roomId, userId, q, Number(page) || 1, Number(limit) || 30);
  }

  @Get('chat/rooms/:roomId/shared')
  @ApiOperation({ summary: 'List shared media/files/links/music/voice in a room' })
  listRoomShared(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Query('kind') kind: 'media' | 'files' | 'links' | 'music' | 'voice',
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.communityService.shared(roomId, userId, kind, cursor, Number(limit) || 30);
  }

  @Get('chat/rooms/:roomId/messages')
  @ApiOperation({ summary: 'List messages (paginated by sequence or offset)' })
  listMessages(
    @Param('roomId') roomId: string,
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
  sendMessage(@Param('roomId') roomId: string, @CurrentUser('id') userId: string, @Body() dto: SendMessageDto) {
    return this.messageService.sendMessage(roomId, userId, dto);
  }

  @Delete('chat/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete message' })
  async deleteMessage(@Param('messageId') messageId: string, @CurrentUser('id') userId: string) {
    await this.messageService.deleteMessage(messageId, userId);
  }

  @Patch('chat/messages/:messageId')
  @ApiOperation({ summary: 'Edit message' })
  updateMessage(@Param('messageId') messageId: string, @CurrentUser('id') userId: string, @Body() dto: UpdateMessageDto) {
    return this.messageService.updateMessage(messageId, userId, dto);
  }

  @Get('chat/messages/:messageId/thread')
  @ApiOperation({ summary: 'Get a message’s Slack-style thread (root + replies)' })
  getThread(@Param('messageId') messageId: string, @CurrentUser('id') userId: string) {
    return this.messageService.getThread(messageId, userId);
  }

  @Post('chat/messages/:messageId/thread')
  @SkipThrottle()
  @ApiOperation({ summary: 'Post a reply into a message’s thread (REST fallback — prefer the socket event)' })
  sendThreadReply(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messageService.sendThreadReply(messageId, userId, dto);
  }

  @Post('chat/messages/:messageId/reactions')
  @ApiOperation({ summary: 'Add reaction' })
  addReaction(@Param('messageId') messageId: string, @CurrentUser('id') userId: string, @Body() dto: AddReactionDto) {
    return this.reactionService.addReaction(messageId, userId, dto);
  }

  @Delete('chat/messages/:messageId/reactions/:emoji')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove own reaction' })
  async removeReaction(@Param('messageId') messageId: string, @Param('emoji') emoji: string, @CurrentUser('id') userId: string) {
    await this.reactionService.removeReaction(messageId, userId, decodeURIComponent(emoji));
  }

  @Get('workspaces/:workspaceId/chat/public-rooms')
  @ApiOperation({ summary: 'List public rooms the user has not joined' })
  listPublicRooms(@Param('workspaceId') workspaceId: string, @CurrentUser('id') userId: string) {
    return this.roomService.listPublicRooms(workspaceId, userId);
  }

  @Post('chat/rooms/:roomId/join')
  @ApiOperation({ summary: 'Join a public room' })
  joinPublicRoom(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    return this.roomService.joinPublicRoom(roomId, userId);
  }

  @Post('chat/rooms/:roomId/invite-code')
  @ApiOperation({
    summary: '(legacy) Generate / retrieve a single unlimited room invite link',
    description: 'Kept for backward compatibility. New clients should use POST /chat/rooms/:roomId/invites for full control (max uses, expiry, multiple links).',
  })
  async getInviteCode(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    const invites = await this.roomInviteService.list(roomId, userId);
    const existing = invites.find((i) => i.isActive && i.maxUses === null && !i.expiresAt);
    if (existing) return { code: existing.code };
    const created = await this.roomInviteService.create(roomId, userId, {});
    return { code: created.code };
  }

  @Delete('chat/rooms/:roomId/invite-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '(legacy) Revoke the single unlimited room invite link' })
  async revokeInviteCode(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    const invites = await this.roomInviteService.list(roomId, userId);
    const actives = invites.filter((i) => i.isActive && i.maxUses === null && !i.expiresAt);
    for (const inv of actives) {
      await this.roomInviteService.revoke(roomId, inv.id, userId);
    }
  }

  // ── Room invites (chat_room_invites, full management) ──────────────
  @Post('chat/rooms/:roomId/invites')
  @ApiOperation({ summary: 'Create a room invite link (optionally limited uses / expiry)' })
  createRoomInvite(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateRoomInviteDto,
  ) {
    return this.roomInviteService.create(roomId, userId, dto);
  }

  @Get('chat/rooms/:roomId/invites')
  @ApiOperation({ summary: 'List invite links for a room (creator or lead+ only)' })
  listRoomInvites(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    return this.roomInviteService.list(roomId, userId);
  }

  @Delete('chat/rooms/:roomId/invites/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a specific room invite link' })
  async revokeRoomInvite(
    @Param('roomId') roomId: string,
    @Param('inviteId') inviteId: string,
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

  @Patch('chat/rooms/:roomId/settings')
  @ApiOperation({
    summary:
      'Update room settings (scope, name, description; background changes require owner/admin)',
  })
  updateRoomSettings(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Body()
    dto: {
      scope?: RoomScope;
      name?: string;
      description?: string;
      backgroundUrl?: string | null;
      backgroundType?: 'DEFAULT' | 'IMAGE' | 'COLOR' | 'GRADIENT' | 'PATTERN';
    },
  ) {
    return this.roomService.updateRoomSettings(roomId, userId, dto);
  }

  @Get('chat/rooms/:roomId/appearance')
  @ApiOperation({
    summary: 'Get the caller’s personal appearance override for a room',
  })
  getChatAppearance(
    @Param('roomId') roomId: string,
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
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Body()
    dto: {
      backgroundUrl?: string | null;
      backgroundType?: 'DEFAULT' | 'IMAGE' | 'COLOR' | 'GRADIENT' | 'PATTERN' | null;
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
  getDraft(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    return this.messageService.getDraft(roomId, userId);
  }

  @Patch('chat/rooms/:roomId/draft')
  @ApiOperation({
    summary: 'Save (or, if empty, clear) the caller’s draft text for a room',
  })
  saveDraft(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Body('content') content: string,
  ) {
    return this.messageService.saveDraft(roomId, userId, content ?? '');
  }

  @Patch('chat/rooms/:roomId/mute')
  @ApiOperation({ summary: 'Mute/unmute notifications for a room (caller only)' })
  setRoomMuted(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: { muted: boolean },
  ) {
    return this.memberService.setMuted(roomId, userId, dto.muted);
  }

  @Delete('chat/rooms/:roomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a chat room (DM or group if creator)' })
  async deleteRoom(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.roomService.deleteRoom(roomId, userId);
  }

  @Post('chat/ai')
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 12, ttl: 60000 } })
  @ApiOperation({ summary: 'AI assistant chat response' })
  async aiReply(
    @Body() dto: AiRequestDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.aiService.generateAiReply(dto.message, dto.history ?? [], userId);
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
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: PresignAttachmentDto,
  ) {
    // Ensure user is in the room before handing out upload credentials
    await this.memberService.assertRoomMember(roomId, userId);
    return this.storageService.getPresignedUploadUrl('attachments', userId, dto.fileName, dto.mimeType, dto.fileSize);
  }

  @Post('chat/rooms/:roomId/attachments/audio')
  @ApiOperation({ summary: 'Upload a recorded voice message' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async uploadAudio(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    await this.memberService.assertRoomMember(roomId, userId);
    const mimeType = file?.mimetype?.split(';')[0];
    const allowed = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']);
    if (!file?.buffer || !mimeType || !allowed.has(mimeType)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A valid audio recording is required' });
    }
    return this.storageService.uploadChatAudio(file.buffer, userId, mimeType);
  }

  @Post('chat/rooms/:roomId/attachments/file')
  @ApiOperation({ summary: 'Upload a chat file through the API' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 100 * 1024 * 1024 } }))
  async uploadFile(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ) {
    await this.memberService.assertRoomMember(roomId, userId);
    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A valid file is required' });
    }
    const mimeType = file.mimetype?.split(';')[0] || 'application/octet-stream';
    return this.storageService.uploadChatAttachment(file.buffer, userId, file.originalname, mimeType);
  }

  // ── Chat Invite Accept / Decline ──────────────────────────────────────────

  @Get('chat/invites/pending')
  @ApiOperation({ summary: 'List all pending chat invites for the current user' })
  listPendingChatInvites(@CurrentUser('id') userId: string) {
    return this.memberService.listPendingInvites(userId);
  }

  @Post('chat/rooms/:roomId/invite/accept')
  @ApiOperation({ summary: 'Accept a pending DM / room invite' })
  acceptChatInvite(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    return this.memberService.acceptChatInvite(roomId, userId);
  }

  @Post('chat/rooms/:roomId/invite/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a pending DM / room invite' })
  declineChatInvite(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    return this.memberService.declineChatInvite(roomId, userId);
  }
}
