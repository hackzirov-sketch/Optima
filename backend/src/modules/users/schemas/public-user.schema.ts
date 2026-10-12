/** Response-only shape (not a validated input) — used to type the columns
 * selected by findPublicById's raw SQL query. */
export interface PublicUserDto {
  /** Public channels this person runs — shown on their profile, Telegram-style. */
  channels?: Array<{ id: string; name: string; slug: string | null; avatarUrl: string | null; memberCount: number }>;
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  nameEmoji: string | null;
  bio?: string | null;
  lastSeen: Date | null;
  /** 'private': the card hides the username from others. */
  accountVisibility?: 'public' | 'private';
}
