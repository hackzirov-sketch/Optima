import { Workspace } from './workspace.entity';

export interface Repository {
  id: string;

  workspaceId: string;

  workspace: Workspace;

  githubRepoId: number;

  name: string;

  fullName: string;

  description: string | null;

  private: boolean;

  defaultBranch: string;

  cloneUrl: string | null;

  htmlUrl: string | null;

  requireReview: boolean;

  protectedBranches: string[];

  createdAt: Date;

  updatedAt: Date;
}
