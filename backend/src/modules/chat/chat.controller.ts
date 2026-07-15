import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';

import { ChatRoomService } from './services/room.service';
import { ChatMessageService } from './services/message.service';
import { ChatReactionService } from './services/reaction.service';
import { ChatAiService } from './services/ai.service';
import { ChatRoomInviteService } from './services/room-invite.service';
import { ChatMemberService } from './services/member.service';
import { StorageService } from '../storage/storage.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { CreateRoomInviteDto } from './dto/create-room-invite.dto';
import { PresignAttachmentDto } from './dto/presing-attachment.dto';
import { IpRateLimitGuard } from '../moderation/guards/ip-rate-limit.guard';

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
  ) {}

  @Get('workspaces/:workspaceId/chat/rooms')
  @ApiOperation({ summary: 'List chat rooms for workspace (membership)' })
  @ApiParam({ name: 'workspaceId' })
  listWorkspaceRooms(@Param('workspaceId') workspaceId: string, @CurrentUser('id') userId: string) {
    return this.roomService.listRooms(workspaceId, userId);
  }

  @Post('workspaces/:workspaceId/chat/rooms')
  @ApiOperation({ summary: 'Create chat room' })
  createRoom(@Param('workspaceId') workspaceId: string, @CurrentUser('id') userId: string, @Body() dto: CreateChatRoomDto) {
    return this.roomService.createRoom(workspaceId, userId, dto);
  }

  @Get('chat/rooms')
  @ApiOperation({ summary: 'List all rooms the current user belongs to, across every workspace and independent of one' })
  listMyRooms(@CurrentUser('id') userId: string) {
    return this.roomService.listAllRoomsForUser(userId);
  }

  @Post('chat/rooms')
  @ApiOperation({ summary: 'Create a chat room with no workspace context (direct message or standalone chat)' })
  createIndependentRoom(@CurrentUser('id') userId: string, @Body() dto: CreateChatRoomDto) {
    return this.roomService.createRoom(null, userId, dto);
  }

  @Get('chat/rooms/:roomId')
  @ApiOperation({ summary: 'Get chat room' })
  getRoom(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    return this.roomService.getRoom(roomId, userId);
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
  @ApiOperation({ summary: 'Update room settings (isPublic, name, description)' })
  updateRoomSettings(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: { isPublic?: boolean; name?: string; description?: string },
  ) {
    return this.roomService.updateRoomSettings(roomId, userId, dto);
  }

  @Post('chat/ai')
  @ApiOperation({ summary: 'AI assistant chat response' })
  async aiReply(
    @Body('message') message: string,
    @Body('history') history: { role: 'user' | 'model'; text: string }[] | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.aiService.generateAiReply(message, history ?? [], userId);
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
} 