import { ChatRoom } from './chat-room.entity';
import { User } from './user.entity';

/**
 * Link-based room invite. Doesn't require email (unlike group_invitations).
 * Multiple active invites per room are allowed (e.g. one unlimited link for the
 * room description, one short-lived single-use link for a specific person).
 */
export interface ChatRoomInvite {
  id: string;

  roomId: string;

  room: ChatRoom;

  createdById: string;

  createdBy: User;

  code: string;

  /** null = unlimited uses */
  maxUses: number | null;

  usesCount: number;

  /** null = never expires */
  expiresAt: Date | null;

  revokedAt: Date | null;

  createdAt: Date;
}
