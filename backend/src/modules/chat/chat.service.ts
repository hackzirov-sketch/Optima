import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In, MoreThan } from 'typeorm';
import { GoogleGenerativeAI } from '@google/generative-ai';

import { ChatRoom } from '../../database/entities/chat-room.entity';
import { ChatMember } from '../../database/entities/chat-member.entity';
import { ChatMessage } from '../../database/entities/chat-message.entity';
import { ChatReaction } from '../../database/entities/chat-reaction.entity';
import { Group } from '../../database/entities/group.entity';
import { Project } from '../../database/entities/project.entity';
import { MembersService } from '../workspaces/members.service';
import { ContentFilterService } from '../moderation/services/content-filter.service';

import { CreateChatRoomDto } from './dto/create-chat-room.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { AddReactionDto } from './dto/add-reaction.dto';
import { applySoftDelete } from '../../common/utils/soft-delete';
import { ChatRoomType } from '../../common/enums';
import { ErrorCode } from '../../common/enums/error-code.enum';

export interface ChatRoomDto {
  id: string;
  workspaceId: string;
  type: ChatRoomType;
  name: string | null;
  avatarUrl: string | null;
  description: string | null;
  isArchived: boolean;
  isReadOnly: boolean;
  groupId: string | null;
  projectId: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  memberIds: string[];
  memberCount: number;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    senderName: string | null;
    createdAt: Date;
  } | null;
  unreadCount: number;
}

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatRoom)
    private readonly roomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatMember)
    private readonly memberRepo: Repository<ChatMember>,
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatReaction)
    private readonly reactionRepo: Repository<ChatReaction>,
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly membersService: MembersService,
    private readonly contentFilter: ContentFilterService,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.gemini = new GoogleGenerativeAI(apiKey);
      this.logger.log('Gemini AI initialized');
    } else {
      this.logger.warn('GEMINI_API_KEY not set — AI assistant will use fallback responses');
    }
  }

  private readonly logger = new Logger(ChatService.name);
  private gemini: GoogleGenerativeAI | null = null;

  private async assertRoomMember(
    roomId: string,
    userId: string,
  ): Promise<ChatMember> {
    const cm = await this.memberRepo.findOne({
      where: { roomId, userId, leftAt: IsNull() },
    });
    if (!cm) throw new ForbiddenException({ code: ErrorCode.NOT_ROOM_MEMBER, message: 'Not a member of this chat room' });
    return cm;
  }

  /** Group flat reactions into { emoji, userIds }[] */
  private groupReactions(
    reactions: ChatReaction[],
  ): { emoji: string; userIds: string[] }[] {
    const map = new Map<string, string[]>();
    for (const r of reactions) {
      if (!map.has(r.emoji)) map.set(r.emoji, []);
      map.get(r.emoji)!.push(r.userId);
    }
    return Array.from(map.entries()).map(([emoji, userIds]) => ({
      emoji,
      userIds,
    }));
  }

  /** Build enriched room response shape that matches ApiChatRoom on the frontend */
  private async enrichRoom(room: ChatRoom, userId: string): Promise<ChatRoomDto> {
    const members = await this.memberRepo.find({
      where: { roomId: room.id, leftAt: IsNull() },
      select: ['userId', 'lastReadAt'],
    });

    const myMembership = members.find((m) => m.userId === userId);
    let unreadCount = 0;
    if (myMembership?.lastReadAt) {
      unreadCount = await this.messageRepo.count({
        where: {
          roomId: room.id,
          isDeleted: false,
          createdAt: MoreThan(myMembership.lastReadAt),
        },
      });
    }

    let lastMessage: ChatRoomDto['lastMessage'] = null;
    if (room.lastMessageId) {
      const msg = await this.messageRepo.findOne({
        where: { id: room.lastMessageId },
        relations: ['sender'],
      });
      if (msg) {
        lastMessage = {
          id: msg.id,
          content: msg.content,
          senderId: msg.senderId,
          senderName: msg.sender
            ? `${msg.sender.firstName ?? ''} ${msg.sender.lastName ?? ''}`.trim()
            : null,
          createdAt: msg.createdAt,
        };
      }
    }

    return {
      id: room.id,
      workspaceId: room.workspaceId,
      type: room.type,
      name: room.name ?? null,
      avatarUrl: room.avatarUrl ?? null,
      description: room.description ?? null,
      isArchived: room.isArchived,
      isReadOnly: room.isReadOnly,
      groupId: room.groupId ?? null,
      projectId: room.projectId ?? null,
      createdById: room.createdById,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      memberIds: members.map((m) => m.userId),
      memberCount: members.length,
      lastMessage,
      unreadCount,
    };
  }

  async listRooms(workspaceId: string, userId: string) {
    await this.membersService.assertMember(workspaceId, userId);

    const memberships = await this.memberRepo.find({
      where: { userId, leftAt: IsNull() },
      relations: ['room'],
    });

    const myRooms = memberships
      .map((m) => m.room)
      .filter((r) => r && r.workspaceId === workspaceId);

    if (myRooms.length === 0) return [];

    const roomIds = myRooms.map((r) => r.id);

    // Batch: all active members across all rooms
    const allMembers = await this.memberRepo.find({
      where: { roomId: In(roomIds), leftAt: IsNull() },
      select: ['roomId', 'userId', 'lastReadAt'],
    });

    const membersByRoom = new Map<
      string,
      { userId: string; lastReadAt: Date | null }[]
    >();
    for (const m of allMembers) {
      if (!membersByRoom.has(m.roomId)) membersByRoom.set(m.roomId, []);
      membersByRoom
        .get(m.roomId)!
        .push({ userId: m.userId, lastReadAt: m.lastReadAt });
    }

    // Batch: last messages for rooms that have one
    const lastMsgIds = myRooms
      .map((r) => r.lastMessageId)
      .filter(Boolean) as string[];

    const lastMessages =
      lastMsgIds.length > 0
        ? await this.messageRepo.find({
            where: { id: In(lastMsgIds) },
            relations: ['sender'],
          })
        : [];
    const lastMsgMap = new Map(lastMessages.map((m) => [m.id, m]));

    // Batch: unread counts — one JOIN query for all rooms
    const unreadRows: { room_id: string; cnt: string }[] = await this.messageRepo.manager.query(
      `SELECT cm.room_id, COUNT(m.id)::int AS cnt
       FROM chat_members cm
       JOIN chat_messages m ON m.room_id = cm.room_id
         AND m.created_at > cm.last_read_at
         AND m.is_deleted = false
       WHERE cm.user_id = $1
         AND cm.room_id = ANY($2)
         AND cm.last_read_at IS NOT NULL
         AND cm.left_at IS NULL
       GROUP BY cm.room_id`,
      [userId, roomIds],
    );
    const unreadMap = new Map(unreadRows.map((r) => [r.room_id, Number(r.cnt)]));

    return myRooms.map((room) => {
      const roomMembers = membersByRoom.get(room.id) ?? [];

      const lastMsg = room.lastMessageId
        ? lastMsgMap.get(room.lastMessageId)
        : null;

      return {
        id: room.id,
        workspaceId: room.workspaceId,
        type: room.type,
        name: room.name ?? null,
        avatarUrl: room.avatarUrl ?? null,
        description: room.description ?? null,
        isArchived: room.isArchived,
        isReadOnly: room.isReadOnly,
        groupId: room.groupId ?? null,
        projectId: room.projectId ?? null,
        createdById: room.createdById,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        memberIds: roomMembers.map((m) => m.userId),
        memberCount: roomMembers.length,
        lastMessage: lastMsg
          ? {
              id: lastMsg.id,
              content: lastMsg.content,
              senderId: lastMsg.senderId,
              senderName: lastMsg.sender
                ? `${lastMsg.sender.firstName ?? ''} ${lastMsg.sender.lastName ?? ''}`.trim()
                : null,
              createdAt: lastMsg.createdAt,
            }
          : null,
        unreadCount: unreadMap.get(room.id) ?? 0,
      };
    });
  }

  async createRoom(
    workspaceId: string,
    userId: string,
    dto: CreateChatRoomDto,
  ) {
    await this.membersService.assertMember(workspaceId, userId);

    // DM: prevent duplicates and ensure targetUserId is provided
    if (dto.type === ChatRoomType.DIRECT) {
      if (!dto.targetUserId) {
        throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'targetUserId is required for direct rooms' });
      }
      if (dto.targetUserId === userId) {
        throw new BadRequestException({ code: ErrorCode.DM_WITH_SELF, message: 'Cannot create a DM with yourself' });
      }
      await this.membersService.assertMember(workspaceId, dto.targetUserId);

      // Check if DM room already exists between these two users
      const existing = await this.roomRepo
        .createQueryBuilder('r')
        .innerJoin('chat_members', 'cm1', 'cm1.room_id = r.id AND cm1.user_id = :userId AND cm1.left_at IS NULL', { userId })
        .innerJoin('chat_members', 'cm2', 'cm2.room_id = r.id AND cm2.user_id = :targetId AND cm2.left_at IS NULL', { targetId: dto.targetUserId })
        .where('r.workspace_id = :workspaceId', { workspaceId })
        .andWhere('r.type = :type', { type: ChatRoomType.DIRECT })
        .getOne();

      if (existing) {
        return this.enrichRoom(existing, userId);
      }
    }

    if (dto.groupId) {
      const g = await this.groupRepo.findOne({
        where: { id: dto.groupId, workspaceId },
      });
      if (!g) throw new BadRequestException({ code: ErrorCode.GROUP_NOT_FOUND, message: 'Group not in this workspace' });
    }
    if (dto.projectId) {
      const p = await this.projectRepo.findOne({
        where: { id: dto.projectId, workspaceId },
      });
      if (!p) throw new BadRequestException({ code: ErrorCode.PROJECT_NOT_FOUND, message: 'Project not in this workspace' });
    }

    const room = this.roomRepo.create({
      workspaceId,
      type: dto.type,
      name: dto.name,
      groupId: dto.groupId,
      projectId: dto.projectId,
      createdById: userId,
    });
    const saved = await this.roomRepo.save(room);

    // Add creator
    await this.memberRepo.save(
      this.memberRepo.create({ roomId: saved.id, userId }),
    );

    // Add second participant for DMs
    if (dto.type === ChatRoomType.DIRECT && dto.targetUserId) {
      await this.memberRepo.save(
        this.memberRepo.create({ roomId: saved.id, userId: dto.targetUserId }),
      );
    }

    // Add extra members for group/project/workspace rooms
    if (dto.type !== ChatRoomType.DIRECT && dto.memberIds?.length) {
      const others = dto.memberIds.filter((id) => id !== userId);
      if (others.length) {
        await this.memberRepo.save(
          others.map((id) => this.memberRepo.create({ roomId: saved.id, userId: id })),
        );
      }
    }

    return this.enrichRoom(saved, userId);
  }

  async getRoom(roomId: string, userId: string) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });
    await this.assertRoomMember(roomId, userId);
    return this.enrichRoom(room, userId);
  }

  async listMessages(roomId: string, userId: string, page = 1, limit = 50) {
    await this.assertRoomMember(roomId, userId);

    const p = Number(page) || 1;
    const l = Number(limit) || 50;
    const [messages, total] = await this.messageRepo.findAndCount({
      where: { roomId, isDeleted: false },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      skip: (p - 1) * l,
      take: l,
    });

    if (messages.length === 0) {
      return { data: [], total, page: p, limit: l };
    }

    // Batch load all reactions for these messages
    const msgIds = messages.map((m) => m.id);
    const reactions = await this.reactionRepo.find({
      where: { messageId: In(msgIds) },
    });

    const reactionsByMsg = new Map<string, ChatReaction[]>();
    for (const r of reactions) {
      if (!reactionsByMsg.has(r.messageId))
        reactionsByMsg.set(r.messageId, []);
      reactionsByMsg.get(r.messageId)!.push(r);
    }

    const data = messages.map((msg) => ({
      id: msg.id,
      roomId: msg.roomId,
      senderId: msg.senderId,
      sender: msg.sender
        ? {
            id: msg.sender.id,
            firstName: msg.sender.firstName,
            lastName: msg.sender.lastName,
            avatarUrl: msg.sender.avatarUrl,
          }
        : null,
      content: msg.content,
      contentType: msg.contentType,
      replyToId: msg.replyToId ?? null,
      isEdited: msg.isEdited,
      isSystem: msg.isSystem,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
      reactions: this.groupReactions(reactionsByMsg.get(msg.id) ?? []),
    }));

    return { data, total, page: p, limit: l };
  }

  async sendMessage(roomId: string, userId: string, dto: SendMessageDto) {
    const room = await this.roomRepo.findOne({ where: { id: roomId } });
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' });
    await this.assertRoomMember(roomId, userId);
    if (room.isReadOnly) throw new ForbiddenException({ code: ErrorCode.ROOM_READ_ONLY, message: 'Room is read-only' });

    if (!dto.content?.trim()) {
      throw new BadRequestException({ code: ErrorCode.MESSAGE_EMPTY, message: 'Message content is required' });
    }

    await this.contentFilter.filterText(dto.content, userId, 'chat');

    const msg = this.messageRepo.create({
      roomId,
      senderId: userId,
      content: dto.content.trim(),
      replyToId: dto.replyToId,
    });
    const saved = await this.messageRepo.save(msg);

    await this.roomRepo.update(roomId, {
      lastMessageId: saved.id,
      lastMessageAt: saved.createdAt,
    });

    return saved;
  }

  async deleteMessage(messageId: string, userId: string) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.assertRoomMember(msg.roomId, userId);
    if (msg.senderId !== userId)
      throw new ForbiddenException({ code: ErrorCode.CANNOT_DELETE_MESSAGE, message: 'You can only delete your own messages' });
    applySoftDelete(msg);
    await this.messageRepo.save(msg);
  }

  async updateMessage(
    messageId: string,
    userId: string,
    dto: UpdateMessageDto,
  ) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.assertRoomMember(msg.roomId, userId);
    if (msg.senderId !== userId)
      throw new ForbiddenException({ code: ErrorCode.CANNOT_EDIT_MESSAGE, message: 'You can only edit your own messages' });
    msg.content = dto.content;
    msg.isEdited = true;
    return this.messageRepo.save(msg);
  }

  async addReaction(messageId: string, userId: string, dto: AddReactionDto) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.assertRoomMember(msg.roomId, userId);

    const existing = await this.reactionRepo.findOne({
      where: { messageId, userId, emoji: dto.emoji },
    });
    if (existing) return existing;

    return this.reactionRepo.save(
      this.reactionRepo.create({ messageId, userId, emoji: dto.emoji }),
    );
  }

  async removeReaction(messageId: string, userId: string, emoji: string) {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.reactionRepo.delete({ messageId, userId, emoji });
  }

  /** Toggle reaction for WebSocket clients */
  async toggleReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<'added' | 'removed'> {
    const msg = await this.messageRepo.findOne({ where: { id: messageId } });
    if (!msg || msg.isDeleted) throw new NotFoundException({ code: ErrorCode.MESSAGE_NOT_FOUND, message: 'Message not found' });
    await this.assertRoomMember(msg.roomId, userId);

    const existing = await this.reactionRepo.findOne({
      where: { messageId, userId, emoji },
    });
    if (existing) {
      await this.reactionRepo.delete({ messageId, userId, emoji });
      return 'removed';
    }

    await this.reactionRepo.save(
      this.reactionRepo.create({ messageId, userId, emoji }),
    );
    return 'added';
  }

  async generateAiReply(
    message: string,
    history: { role: 'user' | 'model'; text: string }[],
    _userId: string,
  ): Promise<{ reply: string }> {
    const text = (message ?? '').trim();
    if (!text) {
      return { reply: "Men tayyorman. Savol, vazifa yoki matn yozing — yordam beraman." };
    }

    if (this.gemini) {
      try {
        // gemini-1.5-flash is on v1, not v1beta
        const model = this.gemini.getGenerativeModel(
          { model: 'gemini-1.5-flash' },
          { apiVersion: 'v1' },
        );

        const systemInstruction = `Sen UPZ — aqlli jamoa boshqaruv platformasining AI yordamchisisisan.
Foydalanuvchilarga vazifalar, loyihalar, jamoa boshqaruvi, xabarlar va ish samaradorligi bo'yicha yordam berasan.
Qisqa, aniq va foydali javob ber. Uzbek tilida gapir (agar foydalanuvchi boshqa tilda yozsa, o'sha tilda javob ber).`;

        const geminiHistory = history
          .filter((h) => h.text?.trim())
          .map((h) => ({ role: h.role, parts: [{ text: h.text }] }));

        const chat = model.startChat({
          systemInstruction: { role: 'user', parts: [{ text: systemInstruction }] },
          history: geminiHistory,
        });

        const result = await chat.sendMessage(text);
        const reply = result.response.text().trim();
        if (reply) return { reply };
      } catch (err) {
        this.logger.warn(`Gemini request failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    // Fallback
    const lower = text.toLowerCase();
    if (/salom|hello|hi\b|hey\b/i.test(lower)) {
      return { reply: "Salom! Men UPZ AI yordamchisiman. Vazifa, loyiha yoki jamoa boshqaruvi bo'yicha yordam bera olaman." };
    }
    if (/task|vazifa/i.test(lower)) {
      return { reply: `Vazifa yaratish uchun Projects sahifasiga o'ting va "+" tugmasini bosing. Sarlavha, prioritet va muddat belgilang.` };
    }
    return { reply: `"${text}" — bu bo'yicha yordam berish uchun to'liqroq savol yozing.` };
  }
}
