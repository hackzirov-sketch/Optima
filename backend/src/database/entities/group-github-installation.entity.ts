import { Group } from './group.entity';

export interface GroupGithubInstallation {
  id: string;

  groupId: string;

  group: Group;

  githubInstallationId: number;

  githubOrgName: string;

  githubOrgAvatarUrl: string | null;

  createdAt: Date;

  updatedAt: Date;
}
