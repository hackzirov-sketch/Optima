/** Response-only shape (not a validated input) — used to type the columns
 * selected by findPublicById's raw SQL query. */
export interface PublicUserDto {
  id: string;
  publicId: string;
  firstName: string;
  lastName: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  nameEmoji: string | null;
  lastSeen: Date | null;
}
