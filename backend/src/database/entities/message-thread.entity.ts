/**
 * Slack-style thread metadata cache for a root message — see SYSTEM_DESIGN.md §14.13.
 * The actual reply messages live in `chat_messages` (reply_to_id = root, is_thread_reply = true);
 * this row just caches the count/last-activity so the "N replies" pill on the root
 * message doesn't need a COUNT() on every room load.
 */
export interface MessageThread {
  id: string;

  roomId: string;

  rootMessageId: string;

  replyCount: number;

  lastReplyAt: Date | null;

  createdAt: Date;
}
