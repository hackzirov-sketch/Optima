/**
 * Telegram-style unsent-message text, persisted per (user, room) so it
 * survives switching chats / reloading. See SYSTEM_DESIGN.md §14.12.
 */
export interface MessageDraft {
  id: string;

  userId: string;

  roomId: string;

  content: string;

  updatedAt: Date;
}
