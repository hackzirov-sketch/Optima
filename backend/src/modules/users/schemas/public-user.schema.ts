/** Response-only shape (not a validated input) — used to type the columns
 * selected by findPublicById's raw SQL query. */
export interface PublicUserDto {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  avatarUrl: string | null;
  lastSeen: Date | null;
}
