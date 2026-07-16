import { ChatRoom } from './chat-room.entity';
import { User } from './user.entity';

export interface ChatMember {
  id: string;

  roomId: string;

  room: ChatRoom;

  userId: string;

  user: User;

  isMuted: boolean;

  mutedUntil: Date | null;

  lastReadAt: Date | null;

  lastReadMessageId: string;

  lastReadSeq: number;

  joinedAt: Date;

  leftAt: Date | null;
}
