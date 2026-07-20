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

  /** OTIMA community discussion-thread fields (ported from main). */
  sourceChannelMessageId: string | null;

  discussionRootMessageId: string | null;

  isPinned: boolean;

  viewCount: number;

  /** Slack-style threads (§14.13) — true for replies posted into a message's thread panel. */
  isThreadReply: boolean;

  /** Only populated on root messages that have a thread, via the message_threads LEFT JOIN. */
  threadReplyCount?: number;

  threadLastReplyAt?: Date | null;
}
