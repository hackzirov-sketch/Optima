import { ChatRoom } from './chat-room.entity';
import { User } from './user.entity';

export interface ChatMessage {
  id: string;

  roomId: string;

  room: ChatRoom;

  senderId: string;

  sender: User;

  replyToId: string | null;

  replyTo: ChatMessage | null;

  content: string | null;

  contentJson: { iv: string; data: string; v: number } | null;

  contentType: string;

  isEdited: boolean;

  editedAt: Date | null;

  deletedAt: Date | null;

  isSystem: boolean;

  systemMetadata: any;

  createdAt: Date;

  updatedAt: Date;

  sequence: number;

  clientMessageId: string | null;

  metadata: any;
}
