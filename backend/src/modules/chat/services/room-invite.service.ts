import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'

import { ChatRoom } from '../../../database/entities/chat-room.entity'
import { WorkspaceMember } from '../../../database/entities/workspace-member.entity'
import { ErrorCode } from '../../../common/enums/error-code.enum'
import { PermissionService } from '../../../common/services/permission.service'
import { MembersService } from '../../workspaces/members.service'
import { ChatMemberService } from './member.service'
import { ChatRoomService } from './room.service'
import { CreateRoomInviteDto } from '../dto/create-room-invite.dto'
import { CHAT_ROOM_COLUMNS_SQL, CHAT_ROOM_INVITE_COLUMNS_SQL } from '../chat.sql'

export interface RoomInviteDto {
  id: string
  roomId: string
  code: string
  createdById: string
  maxUses: number | null
  usesCount: number
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  isActive: boolean
}

interface ChatRoomInviteRow {
  id: string
  roomId: string
  createdById: string
  code: string
  maxUses: number | null
  usesCount: number
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

@Injectable()
export class ChatRoomInviteService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly permission: PermissionService,
    private readonly wsMembersService: MembersService,
    private readonly chatMemberService: ChatMemberService,
    private readonly roomService: ChatRoomService,
  ) { }

  private toDto(invite: ChatRoomInviteRow): RoomInviteDto {
    const now = new Date()
    const isActive =
      !invite.revokedAt &&
      (!invite.expiresAt || invite.expiresAt > now) &&
      (invite.maxUses === null || invite.usesCount < invite.maxUses)

    return {
      id: invite.id,
      roomId: invite.roomId,
      code: invite.code,
      createdById: invite.createdById,
      maxUses: invite.maxUses,
      usesCount: invite.usesCount,
      expiresAt: invite.expiresAt,
      revokedAt: invite.revokedAt,
      createdAt: invite.createdAt,
      isActive,
    }
  }

  private async findRoomById(roomId: string): Promise<ChatRoom | null> {
    const rows: ChatRoom[] = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_COLUMNS_SQL} FROM chat_rooms WHERE id = $1`,
      [roomId],
    )
    return rows[0] ?? null
  }

  private getRequiredWorkspaceId(room: ChatRoom): string {
    if (!room.workspaceId) {
      throw new BadRequestException({
        code: ErrorCode.ROOM_NOT_FOUND,
        message: 'Room is not attached to a workspace',
      })
    }

    return room.workspaceId
  }

  /**
   * Generatsiya ruxsati: assertCanCreateChatRoom darajasi (lead+) yoki room
   * creator. Aks holda → ROOM_INVITE_FORBIDDEN (system design v2 §4.1).
   */
  private async assertCanManageInvites(room: ChatRoom, userId: string): Promise<void> {
    if (room.createdById === userId) return

    const workspaceId = this.getRequiredWorkspaceId(room)
    const rows: WorkspaceMember[] = await this.dataSource.query(
      `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, userId],
    )
    const wsMember = rows[0]
    if (!wsMember) {
      throw new ForbiddenException({ code: ErrorCode.NOT_WORKSPACE_MEMBER, message: 'Not a workspace member' })
    }
    try {
      this.permission.assertCanCreateChatRoom(wsMember)
    } catch {
      throw new ForbiddenException({
        code: ErrorCode.ROOM_INVITE_FORBIDDEN,
        message: 'Only the room creator or a lead/admin/owner can manage invite links',
      })
    }
  }

  private async generateUniqueCode(): Promise<string> {
    const { randomBytes } = await import('crypto')
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomBytes(6).toString('base64url').slice(0, 8)
      const existing = await this.dataSource.query(`SELECT id FROM chat_room_invites WHERE code = $1`, [code])
      if (!existing[0]) return code
    }
    throw new BadRequestException({ code: ErrorCode.INTERNAL_ERROR, message: 'Could not generate a unique invite code, try again' })
  }

  async create(roomId: string, userId: string, dto: CreateRoomInviteDto): Promise<RoomInviteDto> {
    const room = await this.findRoomById(roomId)
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' })

    await this.chatMemberService.assertRoomMember(roomId, userId)
    await this.assertCanManageInvites(room, userId)

    const code = await this.generateUniqueCode()
    let expiresAt: Date | null = null
    if (dto.expiresInHours) {
      expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + dto.expiresInHours)
    }

    const rows: ChatRoomInviteRow[] = await this.dataSource.query(
      `INSERT INTO chat_room_invites (room_id, created_by, code, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${CHAT_ROOM_INVITE_COLUMNS_SQL}`,
      [roomId, userId, code, dto.maxUses ?? null, expiresAt],
    )
    return this.toDto(rows[0])
  }

  async list(roomId: string, userId: string): Promise<RoomInviteDto[]> {
    const room = await this.findRoomById(roomId)
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' })

    await this.assertCanManageInvites(room, userId)

    const invites: ChatRoomInviteRow[] = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_INVITE_COLUMNS_SQL} FROM chat_room_invites
       WHERE room_id = $1 ORDER BY created_at DESC`,
      [roomId],
    )
    return invites.map((i) => this.toDto(i))
  }

  async revoke(roomId: string, inviteId: string, userId: string): Promise<void> {
    const room = await this.findRoomById(roomId)
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' })

    await this.assertCanManageInvites(room, userId)

    const rows: ChatRoomInviteRow[] = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_INVITE_COLUMNS_SQL} FROM chat_room_invites WHERE id = $1 AND room_id = $2`,
      [inviteId, roomId],
    )
    const invite = rows[0]
    if (!invite) throw new NotFoundException({ code: ErrorCode.ROOM_INVITE_NOT_FOUND, message: 'Invite not found' })
    if (invite.revokedAt) return

    await this.dataSource.query(`UPDATE chat_room_invites SET revoked_at = now() WHERE id = $1`, [inviteId])
  }

  async joinByCode(code: string, userId: string) {
    const inviteRows: ChatRoomInviteRow[] = await this.dataSource.query(
      `SELECT ${CHAT_ROOM_INVITE_COLUMNS_SQL} FROM chat_room_invites WHERE code = $1 AND revoked_at IS NULL`,
      [code],
    )
    const invite = inviteRows[0]
    if (!invite) {
      throw new NotFoundException({ code: ErrorCode.INVITE_CODE_INVALID, message: 'Invalid invite link' })
    }
    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      throw new BadRequestException({ code: ErrorCode.INVITE_CODE_EXPIRED, message: 'This invite link has expired' })
    }
    if (invite.maxUses !== null && invite.usesCount >= invite.maxUses) {
      throw new BadRequestException({ code: ErrorCode.INVITE_CODE_EXHAUSTED, message: 'This invite link has reached its usage limit' })
    }

    const room = await this.findRoomById(invite.roomId)
    if (!room) throw new NotFoundException({ code: ErrorCode.ROOM_NOT_FOUND, message: 'Room not found' })

    const existingRows = await this.dataSource.query(
      `SELECT id FROM chat_members WHERE room_id = $1 AND user_id = $2 AND left_at IS NULL`,
      [room.id, userId],
    )
    if (existingRows[0]) return this.roomService.enrichRoom(room, userId)

    // Joining a room requires workspace membership; chat invites don't bypass
    // workspace access control, only room-level access within the workspace.
    const workspaceId = this.getRequiredWorkspaceId(room)
    await this.wsMembersService.assertMember(workspaceId, userId)

    await this.dataSource.query(`INSERT INTO chat_members (room_id, user_id) VALUES ($1, $2)`, [room.id, userId])

    // Atomic increment to avoid race conditions on concurrent joins.
    await this.dataSource.query(`UPDATE chat_room_invites SET uses_count = uses_count + 1 WHERE id = $1`, [invite.id])

    return this.roomService.enrichRoom(room, userId)
  }
}
