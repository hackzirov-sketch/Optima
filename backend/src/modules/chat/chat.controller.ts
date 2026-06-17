import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';

@ApiTags('Chat')
@ApiBearerAuth('access-token')
@Controller()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('workspaces/:workspaceId/chat/rooms')
  @ApiOperation({ summary: 'List chat rooms for workspace (membership)' })
  @ApiParam({ name: 'workspaceId' })
  listWorkspaceRooms(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.listRooms(workspaceId, userId);
  }

  @Post('workspaces/:workspaceId/chat/rooms')
  @ApiOperation({ summary: 'Create chat room' })
  createRoom(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateChatRoomDto,
  ) {
    return this.chatService.createRoom(workspaceId, userId, dto);
  }

  @Get('chat/rooms/:roomId')
  @ApiOperation({ summary: 'Get chat room' })
  getRoom(@Param('roomId') roomId: string, @CurrentUser('id') userId: string) {
    return this.chatService.getRoom(roomId, userId);
  }

  @Get('chat/rooms/:roomId/messages')
  @ApiOperation({ summary: 'List messages (paginated)' })
  listMessages(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.listMessages(
      roomId,
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('chat/rooms/:roomId/messages')
  @ApiOperation({ summary: 'Send message (REST fallback)' })
  sendMessage(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(roomId, userId, dto);
  }

  @Delete('chat/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete message' })
  async deleteMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.chatService.deleteMessage(messageId, userId);
  }

  @Patch('chat/messages/:messageId')
  @ApiOperation({ summary: 'Edit message' })
  updateMessage(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.chatService.updateMessage(messageId, userId, dto);
  }

  @Post('chat/messages/:messageId/reactions')
  @ApiOperation({ summary: 'Add reaction' })
  addReaction(
    @Param('messageId') messageId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AddReactionDto,
  ) {
    return this.chatService.addReaction(messageId, userId, dto);
  }

  @Delete('chat/messages/:messageId/reactions/:emoji')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove own reaction' })
  async removeReaction(
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.chatService.removeReaction(
      messageId,
      userId,
      decodeURIComponent(emoji),
    );
  }

  // ─── Group invite / public room endpoints ─────────────────

  @Get('workspaces/:workspaceId/chat/public-rooms')
  @ApiOperation({ summary: 'List public rooms the user has not joined' })
  listPublicRooms(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.listPublicRooms(workspaceId, userId);
  }

  @Post('chat/rooms/:roomId/join')
  @ApiOperation({ summary: 'Join a public room' })
  joinPublicRoom(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.joinPublicRoom(roomId, userId);
  }

  @Post('chat/rooms/:roomId/invite-code')
  @ApiOperation({ summary: 'Generate / retrieve room invite link' })
  getInviteCode(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.getOrCreateInviteCode(roomId, userId);
  }

  @Delete('chat/rooms/:roomId/invite-code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke room invite link' })
  async revokeInviteCode(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
  ) {
    await this.chatService.revokeInviteCode(roomId, userId);
  }

  @Post('chat/join/:code')
  @ApiOperation({ summary: 'Join room by invite code' })
  joinByCode(
    @Param('code') code: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.joinByInviteCode(code, userId);
  }

  @Patch('chat/rooms/:roomId/settings')
  @ApiOperation({ summary: 'Update room settings (isPublic, name, description)' })
  updateRoomSettings(
    @Param('roomId') roomId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: { isPublic?: boolean; name?: string; description?: string },
  ) {
    return this.chatService.updateRoomSettings(roomId, userId, dto);
  }

  // ─── AI ───────────────────────────────────────────────────

  @Post('chat/ai')
  @ApiOperation({ summary: 'AI assistant chat response' })
  async aiReply(
    @Body('message') message: string,
    @Body('history') history: { role: 'user' | 'model'; text: string }[] | undefined,
    @CurrentUser('id') userId: string,
  ) {
    return this.chatService.generateAiReply(message, history ?? [], userId);
  }
}
