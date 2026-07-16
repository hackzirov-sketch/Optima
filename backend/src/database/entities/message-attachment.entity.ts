import { ChatMessage } from './chat-message.entity';
import { User } from './user.entity';

export interface MessageAttachment {
  id: string;

  messageId: string;

  message: ChatMessage;

  uploaderId: string;

  uploader: User;

  fileName: string;

  fileSize: number;

  mimeType: string;

  storageKey: string;

  storageUrl: string;

  width: number | null;

  height: number | null;

  createdAt: Date;
}
