import { Workspace } from './workspace.entity';

export interface WorkspaceGithubInstallation {
  id: string;

  workspaceId: string;

  workspace: Workspace;

  githubInstallationId: number;

  githubOrgName: string;

  githubOrgAvatarUrl: string | null;

  createdAt: Date;

  updatedAt: Date;
}
