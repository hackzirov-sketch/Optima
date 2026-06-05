import type { ApiUser } from '@/lib/api';
import type { Experience, Goal, Profession, UserProfile } from '@/types';

const DEFAULT_PROFESSION: Profession = 'developer';
const DEFAULT_GOAL: Goal = 'build_portfolio';
const DEFAULT_EXPERIENCE: Experience = 'intermediate';

/** Merge API user with saved local onboarding fields (profession, goal, experience). */
export function mapApiUserToProfile(
  apiUser: ApiUser,
  existing?: UserProfile | null,
): UserProfile {
  const name =
    `${apiUser.firstName ?? ''} ${apiUser.lastName ?? ''}`.trim() ||
    apiUser.username ||
    apiUser.email;

  return {
    name,
    email: apiUser.email,
    username: apiUser.username,
    profession: existing?.profession ?? DEFAULT_PROFESSION,
    goal: existing?.goal ?? DEFAULT_GOAL,
    experience: existing?.experience ?? DEFAULT_EXPERIENCE,
    joinedAt: existing?.joinedAt
      ?? (apiUser.createdAt ? new Date(apiUser.createdAt).getTime() : Date.now()),
    authProvider: existing?.authProvider ?? 'email',
    role: apiUser.role ?? existing?.role,
  };
}

export { getUserDisplayName, getUserFirstName } from './displayUser';
