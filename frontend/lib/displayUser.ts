import type { UserProfile } from '@/types';

export function getUserDisplayName(
  user: UserProfile | null | undefined,
  fallback = '',
): string {
  return user?.name?.trim() || fallback;
}

export function getUserFirstName(
  user: UserProfile | null | undefined,
  fallback = 'there',
): string {
  const full = getUserDisplayName(user);
  if (!full) return fallback;
  return full.split(/\s+/)[0] || fallback;
}
