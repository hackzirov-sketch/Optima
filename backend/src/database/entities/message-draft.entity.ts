/**
 * Telegram-style unsent-message text, persisted per (user, room) so it
 * survives switching chats / reloading. See SYSTEM_DESIGN.md §14.12.
 */
export interface MessageDraft {
  id: string;

  userId: string;

  roomId: string;

  /** Plaintext rooms; empty for end-to-end encrypted ones. */
  content: string;

  /** E2EE rooms: the draft encrypted on the device with the room key. */
  e2ee: Record<string, unknown> | null;

  updatedAt: Date;
}
