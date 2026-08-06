/**
 * Usernames are `[a-zA-Z0-9_-]{3,50}` (see register.schema.ts), so a mention
 * is that same shape behind an `@`.
 *
 * The leading group is what stops `someone@example.com` from reading as a
 * mention of `example`: the `@` has to start the string or follow something
 * that isn't part of a username. It is a capture rather than a lookbehind
 * because lookbehind support is still uneven across the runtimes this may be
 * bundled for, and the cost is one unused group.
 */
const MENTION_PATTERN = /(^|[^a-zA-Z0-9_-])@([a-zA-Z0-9_-]{3,50})/g;

/**
 * The most people one message may mention.
 *
 * Without a cap, `@a @b @c ...` is an amplification primitive: each name is a
 * notification row, a WebSocket push and — at MENTION's HIGH priority — an
 * SMS or Telegram message. One message could bill for hundreds. Ten covers
 * every honest use of a mention; past that the sender wants the room, not
 * individuals, and the unread badge already tells the room.
 */
export const MAX_MENTIONS_PER_MESSAGE = 10;

/**
 * Pulls the mentioned usernames out of message text.
 *
 * Returns them lowercased and de-duplicated, in the order first written, and
 * never more than MAX_MENTIONS_PER_MESSAGE. Lowercase because usernames are
 * compared case-insensitively everywhere else (see users.service's
 * `lower(username) = lower($1)`), so `@Alice` and `@alice` are one person and
 * must not produce two notifications.
 *
 * This only reads text. Whether a name belongs to a real user, and whether
 * that user is in the room, is decided against the database by the caller —
 * anyone can type any name.
 */
export function extractMentions(content: string | null | undefined): string[] {
  if (!content) return [];

  const seen = new Set<string>();
  for (const match of content.matchAll(MENTION_PATTERN)) {
    seen.add(match[2].toLowerCase());
    if (seen.size >= MAX_MENTIONS_PER_MESSAGE) break;
  }
  return [...seen];
}
