export const USER_COLUMNS_SQL = `
  id, public_id::text AS "publicId", first_name AS "firstName", last_name AS "lastName", username, nickname, email,
  phone_number AS "phoneNumber",
  avatar_url AS "avatarUrl", name_emoji AS "nameEmoji", background_url AS "backgroundUrl", language, timezone, theme, occupation,
  account_visibility AS "accountVisibility", bio, birthday::text AS "birthday",
  is_active AS "isActive", is_verified AS "isVerified", providers,
  needs_password_setup AS "needsPasswordSetup", last_seen AS "lastSeen",
  created_at AS "createdAt", updated_at AS "updatedAt",
  deleted_at AS "deletedAt", deleted_by AS "deletedBy"
`;

export const USER_AUTH_COLUMNS_SQL = `
  id, public_id::text AS "publicId", email, password_hash AS "passwordHash", is_verified AS "isVerified",
  is_active AS "isActive", deleted_at AS "deletedAt", providers,
  needs_password_setup AS "needsPasswordSetup", first_name AS "firstName",
  last_name AS "lastName", username, nickname, avatar_url AS "avatarUrl", name_emoji AS "nameEmoji"
`;

/**
 * `providers` is stored as a comma-joined string (TypeORM's `simple-array` column type,
 * kept as-is by the migrations). Raw SQL reads/writes it as plain text, so every row
 * coming back from a `users` query needs this applied before the value is treated as
 * `string[]` elsewhere in the app.
 */
export function mapUserRow<T extends { providers: unknown }>(row: T): T {
  if (typeof row.providers === 'string') {
    (row as any).providers = row.providers.length
      ? row.providers.split(',')
      : [];
  }
  return row;
}

export function mapUserRows<T extends { providers: unknown }>(rows: T[]): T[] {
  return rows.map(mapUserRow);
}

export function serializeProviders(
  providers: string[] | undefined,
): string | undefined {
  if (providers === undefined) return undefined;
  return providers.join(',');
}
