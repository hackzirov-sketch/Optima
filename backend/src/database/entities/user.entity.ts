import { Exclude } from 'class-transformer';
import { UserTheme, UserLanguage, UserOccupation } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { WorkspaceMember } from './workspace-member.entity';
import { UserSettings } from './user-settings.entity';

export interface User {
  id: string;

  firstName: string;

  lastName: string;

  username: string;

  email: string;

  phoneNumber: number | null;

  passwordHash: string | null;

  avatarUrl: string | null;

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
  ownedWorkspaces: Workspace[];

  workspaceMemberships: WorkspaceMember[];

  settings: UserSettings;
}
