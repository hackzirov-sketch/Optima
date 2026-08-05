import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventsGateway } from './events.gateway';

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

  constructor(private readonly gateway: EventsGateway) {}

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
    content: string;
    isEdited: boolean;
    editedAt: Date;
  }) {
    this.toRoom(payload.roomId, 'message_updated', payload);
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
