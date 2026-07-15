import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { ChatRoom } from '../../../database/entities/chat-room.entity'
import { ErrorCode } from '../../../common/enums/error-code.enum'
import { ChatEncryptionService } from '../chat-encryption.service'
import { ChatMemberService } from './member.service'
import { MembersService } from '../../workspaces/members.service'
import { CreateChatRoomDto } from '../dto/create-chat-room.dto'
import { CHAT_ROOM_COLUMNS_SQL, CHAT_ROOM_COLUMNS_SQL_R } from '../chat.sql'
import { buildUpdateSet, normalizeReturning } from '../../../common/utils/sql.util'

export interface ChatRoomDto {
  id: string
  workspaceId: string | null
  /**
   * Derived, not stored — chat_rooms has no `type` column anymore (a real
   * column could silently drift from the actual relations). Computed here
   * purely so the existing frontend (which still expects this field) keeps
   * working: 'project' | 'group' | 'direct' | 'workspace'.
   */
  type: string
  name: string | null
  avatarUrl: string | null
  description: string | null
  isArchived: boolean
  isReadOnly: boolean
  isPublic: boolean
  inviteCode: string | null
  isMember: boolean
  groupId: string | null
  projectId: string | null
  createdById: string
  createdAt: Date
  updatedAt: Date
  memberIds: string[]
  memberCount: number
  lastMessage: {
    id: string
    content: string
    senderId: string
    senderName: string | null
    createdAt: Date
  } | null
  unreadCount: number
}

@Injectable()
export class ChatRoomService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly wsMembersService: MembersService,
    private readonly chatMemberService: ChatMemberService,
    private readonly chatEncryption: ChatEncryptionService,
  ) { }

  private async findRoomById(roomId: string): Promise<ChatRoom | null> {
    const rows: ChatRoom[] = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE id = $1`,
      [roomId],
    )
    return rows[0] ?? null
  }

  private async fetchLastMessage(lastMessageId: string) {
    const rows: any[] = await this.dataSource.query(
      `SELECT m.id, m.content, m.content_json AS "contentJson", m.sender_id AS "senderId",
              m.created_at AS "createdAt",
              u.first_name AS "senderFirstName", u.last_name AS "senderLastName"
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.id = $1`,
      [lastMessageId],
    )
    const msg = rows[0]
    if (!msg) return null
    return {
      id: msg.id,
      content: this.chatEncryption.safeDecrypt(msg.contentJson, msg.content ?? ''),
      senderId: msg.senderId,
      senderName: msg.senderFirstName
        ? `${msg.senderFirstName ?? ''} ${msg.senderLastName ?? ''}`.trim()
        : null,
      createdAt: msg.createdAt,
    }
  }

  /**
   * Derives the legacy `type` string from relations + member count, since
   * chat_rooms no longer stores it. `memberCount` must include the room's
   * own creator/participants (left_at IS NULL rows).
   */
  private deriveRoomType(room: { projectId: string | null; groupId: string | null; workspaceId: string | null; isPublic: boolean }, memberCount: number): string {
    if (room.projectId) return 'project'
    if (room.groupId) return 'group'
    if (!room.projectId && !room.groupId && memberCount === 2) return 'direct'
    if (room.workspaceId && room.isPublic) return 'workspace'
    return 'group'
  }

  async enrichRoom(room: ChatRoom, userId: string): Promise<ChatRoomDto> {
    const members: Array<{ userId: string; lastReadSeq: number }> = await this.dataSource.query(
      `SELECT user_id AS "userId", last_read_seq AS "lastReadSeq"
       FROM chat_members WHERE room_id = $1 AND left_at IS NULL`,
      [room.id],
    )

    const myMembership = members.find((m) => m.userId === userId)
    let unreadCount = 0
    if (myMembership) {
      unreadCount = Math.max(0, room.messageSeq - myMembership.lastReadSeq)
    }

    const lastMessage = room.lastMessageId ? await this.fetchLastMessage(room.lastMessageId) : null

    return {
      id: room.id,
      workspaceId: room.workspaceId,
      type: this.deriveRoomType(room, members.length),
      name: room.name ?? null,
      avatarUrl: room.avatarUrl ?? null,
      description: room.description ?? null,
      isArchived: room.isArchived,
      isReadOnly: room.isReadOnly,
      isPublic: room.isPublic,
      inviteCode: room.inviteCode ?? null,
      groupId: room.groupId ?? null,
      projectId: room.projectId ?? null,
      createdById: room.createdById,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      memberIds: members.map((m) => m.userId),
      memberCount: members.length,
      lastMessage,
      unreadCount,
      isMember: true,
    }
  }

  async listRooms(workspaceId: string, userId: string) {
    await this.wsMembersService.assertMember(workspaceId, userId)

    const myRooms: Array<ChatRoom & { myLastReadSeq: number }> = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL_R}, cm.last_read_seq AS "myLastReadSeq"
       FROM chat_rooms r
       JOIN chat_members cm ON cm.room_id = r.id AND cm.user_id = $2 AND cm.left_at IS NULL
       WHERE r.workspace_id = $1`,
      [workspaceId, userId],
    )

    if (myRooms.length === 0) return []

    const roomIds = myRooms.map((r) => r.id)

    const allMembers: Array<{ roomId: string; userId: string }> = await this.dataSource.query(
      `SELECT room_id AS "roomId", user_id AS "userId" FROM chat_members
       WHERE room_id = ANY($1::uuid[]) AND left_at IS NULL`,
      [roomIds],
    )

    const membersByRoom = new Map<string, string[]>()
    for (const m of allMembers) {
      if (!membersByRoom.has(m.roomId)) membersByRoom.set(m.roomId, [])
      membersByRoom.get(m.roomId)!.push(m.userId)
    }

    const lastMsgIds = myRooms.map((r) => r.lastMessageId).filter(Boolean) as string[]

    const lastMessages: any[] =
      lastMsgIds.length > 0
        ? await this.dataSource.query(
          `SELECT m.id, m.content, m.content_json AS "contentJson", m.sender_id AS "senderId",
                    m.created_at AS "createdAt",
                    u.first_name AS "senderFirstName", u.last_name AS "senderLastName"
             FROM chat_messages m
             LEFT JOIN users u ON u.id = m.sender_id
             WHERE m.id = ANY($1::uuid[])`,
          [lastMsgIds],
        )
        : []
    const lastMsgMap = new Map(lastMessages.map((m) => [m.id, m]))

    return myRooms.map((room) => {
      const roomMemberIds = membersByRoom.get(room.id) ?? []
      const unreadCount = Math.max(0, room.messageSeq - room.myLastReadSeq)
      const lastMsg = room.lastMessageId ? lastMsgMap.get(room.lastMessageId) : null

      return {
        id: room.id,
        workspaceId: room.workspaceId,
        type: this.deriveRoomType(room, roomMemberIds.length),
        name: room.name ?? null,
        avatarUrl: room.avatarUrl ?? null,
        description: room.description ?? null,
        isArchived: room.isArchived,
        isReadOnly: room.isReadOnly,
        isPublic: room.isPublic,
        inviteCode: room.inviteCode ?? null,
        groupId: room.groupId ?? null,
        projectId: room.projectId ?? null,
        createdById: room.createdById,
        createdAt: room.createdAt,
        updatedAt: room.updatedAt,
        memberIds: roomMemberIds,
        memberCount: roomMemberIds.length,
        lastMessage: lastMsg
          ? {
            id: lastMsg.id,
            content: this.chatEncryption.safeDecrypt(lastMsg.contentJson, lastMsg.content ?? ''),
            senderId: lastMsg.senderId,
            senderName: lastMsg.senderFirstName
              ? `${lastMsg.senderFirstName ?? ''} ${lastMsg.senderLastName ?? ''}`.trim()
              : null,
            createdAt: lastMsg.createdAt,
          }
          : null,
        unreadCount,
        isMember: true,
      }
    })
  }

  async listPublicRooms(workspaceId: string, userId: string) {
    await this.wsMembersService.assertMember(workspaceId, userId)

    const memberRoomIds: string[] = (
      await this.dataSource.query(
        `SELECT room_id AS "roomId" FROM chat_members WHERE user_id = $1 AND left_at IS NULL`,
        [userId],
      )
    ).map((m: any) => m.roomId)

    const publicRooms: ChatRoom[] = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms
       WHERE workspace_id = $1 AND is_public = true AND is_archived = false`,
      [workspaceId],
    )

    const nonMemberRooms = publicRooms.filter((r) => !memberRoomIds.includes(r.id))
    return nonMemberRooms.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      type: r.projectId ? 'project' : r.groupId ? 'group' : 'workspace',
      name: r.name ?? null,
      avatarUrl: r.avatarUrl ?? null,
      description: r.description ?? null,
      isPublic: true,
      isArchived: false,
      isReadOnly: r.isReadOnly,
      groupId: r.groupId ?? null,
      projectId: r.projectId ?? null,
      createdById: r.createdById,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      memberIds: [],
      memberCount: 0,
      lastMessage: null,
      unreadCount: 0,
      isMember: false,
    }))
  }

  async joinPublicRoom(roomId: string, userId: string) {
    const room = await this.findRoomById(roomId)
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' })
    if (!room.isPublic) throw new ForbiddenException({ code: ErrorCode.ROOM_NOT_PUBLIC, message: 'Room is not public' })

    const existingRows = await this.dataSource.query(
      `SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [roomId, userId],
    )
    if (existingRows[0]) throw new BadRequestException({ code: ErrorCode.ALREADY_ROOM_MEMBER, message: 'Already a member' })

    await this.dataSource.query(`INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2)`, [roomId, userId])
    return this.enrichRoom(room, userId)
  }

  async updateRoomSettings(roomId: string, userId: string, dto: { isPublic?: boolean; name?: string; description?: string }) {
    const room = await this.findRoomById(roomId)
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' })
    await this.chatMemberService.assertRoomMember(roomId, userId)
    if (room.createdById !== userId)
      throw new ForbiddenException({ code: ErrorCode.ROOM_INVITE_FORBIDDEN, message: 'Only the creator can update room settings' })

    const { setClause, values } = buildUpdateSet(dto as Record<string, unknown>, 2)
    let updated = room
    if (setClause) {
      const rows: ChatRoom[] = normalizeReturning(
        await this.dataSource.query(
          `UPDATE chat_rooms SET ${setClause} WHERE id = $1 RETURNING ${CHAT_ROOM_COLUMNS_SQL}`,
          [roomId, ...values],
        ),
      )
      updated = rows[0]
    }
    return this.enrichRoom(updated, userId)
  }

  /**
   * @param workspaceId Pass null to create an independent room with no
   *   workspace context (a direct message between two users, or any other
   *   standalone chat). groupId/projectId require a workspace and are
   *   rejected when workspaceId is null.
   */
  async createRoom(workspaceId: string | null, userId: string, dto: CreateChatRoomDto) {
    if (workspaceId) {
      await this.wsMembersService.assertMember(workspaceId, userId)
    } else if (dto.groupId || dto.projectId) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'groupId/projectId require a workspace-scoped room',
      })
    }

    const isDirect = !!dto.targetUserId

    if (isDirect) {
      if (dto.targetUserId === userId) throw new BadRequestException({ code: ErrorCode.DM_WITH_SELF, message: 'Cannot create a DM with yourself' })
      // Allow direct messages to be created with any user (not restricted to workspace membership)

      // A "direct" room is identified structurally: no group/project scope,
      // exactly these two active members, same workspace context (or both
      // independent of any workspace).
      const existingRows: ChatRoom[] = await this.dataSource.query(
        `SELECT ${CHAT_ROOM_COLUMNS_SQL_R}
         FROM chat_rooms r
         JOIN chat_members cm1 ON cm1.room_id = r.id AND cm1.user_id = $1 AND cm1.left_at IS NULL
         JOIN chat_members cm2 ON cm2.room_id = r.id AND cm2.user_id = $2 AND cm2.left_at IS NULL
         WHERE r.group_id IS NULL AND r.project_id IS NULL
           AND ${workspaceId ? 'r.workspace_id = $3' : 'r.workspace_id IS NULL'}
           AND (SELECT COUNT(*) FROM chat_members cm WHERE cm.room_id = r.id AND cm.left_at IS NULL) = 2`,
        workspaceId ? [userId, dto.targetUserId, workspaceId] : [userId, dto.targetUserId],
      )
      if (existingRows[0]) return this.enrichRoom(existingRows[0], userId)
    }

    if (dto.groupId) {
      const g = await this.dataSource.query(`SELECT id FROM groups WHERE id = $1 AND workspace_id = $2`, [dto.groupId, workspaceId])
      if (!g[0]) throw new BadRequestException({ code: ErrorCode.GROUP_NOT_FOUND, message: 'Group not in this workspace' })
    }
    if (dto.projectId) {
      const p = await this.dataSource.query(`SELECT id FROM projects WHERE id = $1 AND workspace_id = $2`, [dto.projectId, workspaceId])
      if (!p[0]) throw new BadRequestException({ code: ErrorCode.PROJECT_NOT_FOUND, message: 'Project not in this workspace' })
    }

    const savedRows: ChatRoom[] = await this.dataSource.query(
      `INSERT INTO chat_rooms (workspace_id, name, group_id, project_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CHAT_ROOM_COLUMNS_SQL}`,
      [workspaceId, dto.name ?? null, dto.groupId ?? null, dto.projectId ?? null, userId],
    )
    const saved = savedRows[0]

    const memberIds = new Set<string>([userId])
    if (isDirect && dto.targetUserId) {
      memberIds.add(dto.targetUserId)
    }
    if (!isDirect && dto.memberIds?.length) {
      dto.memberIds.filter((id) => id !== userId).forEach((id) => memberIds.add(id))
    }

    const values: string[] = []
    const params: unknown[] = []
    Array.from(memberIds).forEach((id, i) => {
      values.push(`($${i * 2 + 1}, $${i * 2 + 2})`)
      params.push(saved.id, id)
    })
    await this.dataSource.query(
      `INSERT INTO chat_members (room_id, user_id) VALUES ${values.join(', ')}`,
      params,
    )

    return this.enrichRoom(saved, userId)
  }

  /** All rooms the user is a member of, across every workspace and independent of one. */
  async listAllRoomsForUser(userId: string) {
    const myRooms: Array<ChatRoom & { myLastReadSeq: number }> = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL_R}, cm.last_read_seq AS "myLastReadSeq"
       FROM chat_rooms r
       JOIN chat_members cm ON cm.room_id = r.id AND cm.user_id = $1 AND cm.left_at IS NULL`,
      [userId],
    )
    return Promise.all(myRooms.map((room) => this.enrichRoom(room, userId)))
  }

  async getRoom(roomId: string, userId: string) {
    const room = await this.findRoomById(roomId)
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' })
    await this.chatMemberService.assertRoomMember(roomId, userId)
    return this.enrichRoom(room, userId)
  }
}
