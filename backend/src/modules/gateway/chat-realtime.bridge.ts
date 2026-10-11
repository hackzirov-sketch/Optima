import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventsGateway } from './events.gateway';
import { DatabaseService } from '../../database/database.service';

/**
 * Turns chat domain events into socket broadcasts.
 *
 * Chat services must not depend on the gateway — the gateway already depends
 * on them, and closing that loop with a forwardRef makes the dependency
 * bidirectional for no benefit. They emit through EventEmitter2 instead and
 * this bridge, which lives on the gateway's side, does the fan-out.
 *
 * Every event here closes a REST path that previously changed state without
 * telling anyone: editing, deleting, un-reacting, being added to a room,
 * joining, leaving, a role change, a settings change. All of them were visible
 * only to the person who performed them until someone reloaded.
 */
@Injectable()
export class ChatRealtimeBridge {
  private readonly logger = new Logger(ChatRealtimeBridge.name);

  constructor(
    private readonly gateway: EventsGateway,
    private readonly dataSource: DatabaseService,
  ) {}

  private toRoom(roomId: string, event: string, payload: unknown) {
    try {
      this.gateway.server?.to(`room:${roomId}`).emit(event, payload);
    } catch (err) {
      // A broadcast failure must never fail the write that triggered it.
      this.logger.warn(
        `Failed to broadcast ${event}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent('chat.message_updated')
  onMessageUpdated(payload: {
    roomId: string;
    messageId: string;
    senderId: string;
    content: string | null;
    e2ee: unknown;
    isEdited: boolean;
    editedAt: Date;
  }) {
    this.toRoom(payload.roomId, 'message_updated', payload);
  }

  /** A message sent over the REST fallback — the socket path broadcasts its own. */
  @OnEvent('chat.message_created')
  async onMessageCreated(saved: { roomId: string }) {
    try {
      await this.gateway.broadcastNewMessage(saved);
    } catch (err) {
      this.logger.warn(
        `Failed to broadcast new_message: ${(err as Error).message}`,
      );
    }
  }

  /**
   * A member device published a new room key. Every member's client drops
   * its cached key state for the room and picks the new epoch up on demand.
   */
  @OnEvent('chat.e2ee_rotated')
  async onE2eeRotated(payload: { roomId: string; epoch: number }) {
    try {
      await this.gateway.broadcastToRoomMembers(
        payload.roomId,
        'room_key_rotated',
        payload,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to broadcast room_key_rotated: ${(err as Error).message}`,
      );
    }
  }

  /**
   * A member registered a new device. In every E2EE room they belong to,
   * the members' clients refetch key state, which re-wraps the keys that
   * device is entitled to (e2ee.ts → shareHistory).
   */
  @OnEvent('chat.e2ee_device_added')
  async onE2eeDeviceAdded(payload: { userId: string; deviceId: string }) {
    try {
      const rooms = await this.dataSource.query<{ roomId: string }>(
        `SELECT r.id AS "roomId"
           FROM chat_members m
           JOIN chat_rooms r ON r.id = m.room_id
          WHERE m.user_id = $1 AND m.left_at IS NULL AND m.status = 'active'
            AND r.e2ee_epoch > 0
            AND (r.type = 'direct' OR r.scope <> 'public')`,
        [payload.userId],
      );
      for (const { roomId } of rooms) {
        this.toRoomMembers(roomId, 'room_keys_requested', { roomId });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to request room keys: ${(err as Error).message}`,
      );
    }
  }

  /** Keys were re-wrapped for these users' devices — they can reopen locked messages. */
  @OnEvent('chat.e2ee_keys_shared')
  onE2eeKeysShared(payload: { roomId: string; userIds: string[] }) {
    for (const userId of payload.userIds) {
      this.gateway.server
        ?.to(`user:${userId}`)
        .emit('room_keys_shared', { roomId: payload.roomId });
    }
  }

  private toRoomMembers(roomId: string, event: string, payload: unknown) {
    this.gateway
      .broadcastToRoomMembers(roomId, event, payload)
      .catch((err: Error) =>
        this.logger.warn(`Failed to broadcast ${event}: ${err.message}`),
      );
  }

  /** A draft changed: tell every device of its owner (only them). */
  @OnEvent('chat.draft_updated')
  onDraftUpdated(payload: { userId: string; roomId: string }) {
    const { userId, ...draft } = payload;
    this.gateway.server?.to(`user:${userId}`).emit('draft_updated', draft);
  }

  @OnEvent('chat.message_pinned')
  onMessagePinned(payload: {
    roomId: string;
    messageId: string;
    pinned: boolean;
    pinnedBy: string;
  }) {
    this.toRoomMembers(payload.roomId, 'message_pinned', payload);
  }

  @OnEvent('chat.message_deleted')
  onMessageDeleted(payload: {
    roomId: string;
    messageId: string;
    deletedBy: string;
  }) {
    this.toRoom(payload.roomId, 'message_deleted', payload);
  }

  @OnEvent('chat.reaction_updated')
  onReactionUpdated(payload: {
    roomId: string;
    messageId: string;
    userId: string;
    emoji: string;
    action: 'added' | 'removed';
  }) {
    this.toRoom(payload.roomId, 'reaction_updated', payload);
  }

  @OnEvent('chat.member_changed')
  onMemberChanged(payload: {
    roomId: string;
    userId: string;
    action: 'joined' | 'left' | 'role_changed' | 'ownership_transferred';
    role?: string;
  }) {
    this.toRoom(payload.roomId, 'room_member_changed', payload);
    // The affected member may not be in the room channel yet (they just joined)
    // or may have already left it, so tell them directly as well.
    this.gateway.server
      ?.to(`user:${payload.userId}`)
      .emit('room_member_changed', payload);
    // A removed or banned member must stop receiving the room's broadcasts on
    // sockets that joined the channel while they were still a member.
    if (payload.action === 'left') {
      this.gateway.server
        ?.in(`user:${payload.userId}`)
        .socketsLeave(`room:${payload.roomId}`);
    }
  }

  @OnEvent('group.member_removed')
  onGroupMemberRemoved(payload: { groupId: string; userId: string }) {
    this.gateway.server
      ?.in(`user:${payload.userId}`)
      .socketsLeave(`group:${payload.groupId}`);
  }

  @OnEvent('chat.settings_updated')
  onSettingsUpdated(payload: {
    roomId: string;
    changedBy: string;
    changes: string[];
  }) {
    this.toRoom(payload.roomId, 'room_settings_updated', payload);
  }

  /**
   * A room the recipient isn't in a socket channel for yet — addressed to
   * their personal channel so a new DM or group invite appears immediately.
   */
  @OnEvent('chat.room_created')
  onRoomCreated(payload: {
    roomId: string;
    memberIds: string[];
    createdBy: string;
  }) {
    for (const userId of payload.memberIds) {
      this.gateway.server?.to(`user:${userId}`).emit('room_created', {
        roomId: payload.roomId,
        createdBy: payload.createdBy,
      });
    }
  }

  /** View counts, pushed after each 10-second flush rather than polled. */
  @OnEvent('chat.views_updated')
  onViewsUpdated(payload: { messageIds: string[] }) {
    this.gateway.server?.emit('message_views_updated', payload);
  }
}
