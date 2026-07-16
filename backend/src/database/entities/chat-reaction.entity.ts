import { ChatMessage } from './chat-message.entity';
import { User } from './user.entity';

export interface ChatReaction {
  id: string;

  messageId: string;

  message: ChatMessage;

  userId: string;

  user: User;

  emoji: string;

  createdAt: Date;
}
