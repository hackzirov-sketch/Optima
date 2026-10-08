import { Group } from './group.entity';

export interface Repository {
  id: string;

  groupId: string;

  group: Group;

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
