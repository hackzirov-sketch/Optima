/**
 * Optima's super admins: user ids from SUPER_ADMIN_USER_IDS (comma
 * separated) in the server environment — never stored in or granted through
 * the database, so no request can make someone one.
 *
 * What they may do (enforced where each check lives): join any meeting as a
 * co-host, join any group or channel (private ones too — visibly, as a
 * member), manage those rooms as an owner, and use the admin API to block
 * accounts and rooms and see the platform's state. Not direct chats.
 */
let cache: { raw: string; ids: Set<string> } | null = null;

function ids(): Set<string> {
  const raw = process.env.SUPER_ADMIN_USER_IDS ?? '';
  if (cache?.raw !== raw)
    cache = {
      raw,
      ids: new Set(
        raw
          .split(',')
          .map((id) => id.trim().toLowerCase())
          .filter((id) => /^[0-9a-f-]{36}$/.test(id)),
      ),
    };
  return cache.ids;
}

export function isSuperAdmin(userId: string | null | undefined): boolean {
  return !!userId && ids().has(userId.toLowerCase());
}
