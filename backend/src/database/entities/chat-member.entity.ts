import { ChatRoom } from './chat-room.entity';
import { User } from './user.entity';

export interface ChatMember {
  id: string;

  roomId: string;

  room: ChatRoom;

  userId: string;

  user: User;

  /** Ported from main (OTIMA community moderation). */
  role: 'member' | 'admin' | 'owner';

  isBanned: boolean;

  bannedUntil: Date | null;

  status: 'pending' | 'active';

  isMuted: boolean;

  mutedUntil: Date | null;

  lastReadAt: Date | null;

  lastReadMessageId: string;

  lastReadSeq: number;

  joinedAt: Date;

  leftAt: Date | null;
}
