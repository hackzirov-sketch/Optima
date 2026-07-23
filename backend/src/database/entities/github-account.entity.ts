import { User } from './user.entity';

export interface GithubAccount {
  id: string;

  userId: string;

  user: User;

  githubUserId: number;

  username: string;

  avatarUrl: string | null;

  email: string;

  accessTokenEncrypted: string;

  refreshTokenEncrypted: string | null;

  tokenExpiresAt: Date | null;

  connectedAt: Date;

  createdAt: Date;

  updatedAt: Date;
}
