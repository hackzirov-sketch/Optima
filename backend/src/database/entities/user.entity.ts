import { UserTheme, UserLanguage } from '../../common/enums';
import { Group } from './group.entity';
import { GroupMember } from './group-member.entity';
import { UserSettings } from './user-settings.entity';

export interface User {
  id: string;

  /** Random 6-digit public identifier — safe to expose (see public_user_id_registry, ported from main). */
  publicId: string;

  firstName: string;

  lastName: string;

  username: string | null;

  nickname: string | null;

  email: string;

  phoneNumber: number | null;

  passwordHash: string | null;

  avatarUrl: string | null;

  bio?: string | null;

  /** YYYY-MM-DD. */
  birthday?: string | null;

  /** Optional custom emoji rendered before the public display name. */
  nameEmoji: string | null;

  /** Profile-level default chat wallpaper — fallback background when a room has no per-user override. */
  backgroundUrl: string | null;

  /** 'public' shows up in fuzzy user search; 'private' only via exact @username/public_id. */
  accountVisibility: 'public' | 'private';

  language: UserLanguage;

  timezone: string;

  theme: UserTheme;

  isActive: boolean;

  isVerified: boolean;

  occupation: string | null;

  providers: string[];

  needsPasswordSetup: boolean;

  lastSeen: Date | null;

  createdAt: Date;

  updatedAt: Date;

  deletedAt: Date | null;

  deletedBy: string | null;

  // Relations
  ownedGroups: Group[];

  groupMemberships: GroupMember[];

  settings: UserSettings;
}
