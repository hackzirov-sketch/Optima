import { PushType, PushStatus } from '../../common/enums';
import { Task } from './task.entity';
import { User } from './user.entity';
import { Repository } from './repository.entity';

export interface TaskPush {
  id: string;

  taskId: string;

  task: Task;

  userId: string;

  user: User;

  repositoryId: string | null;

  repository: Repository | null;

  branchName: string;

  type: PushType;

  status: PushStatus;

  commitMessage: string;

  commitSha: string;

  commitsCount: number;

  filesChanged: number;

  addedLines: number;

  removedLines: number;

  storageProvider: string;

  storageUrl: string | null;

  storageKey: string | null;

  githubCommitSha: string;

  githubPrUrl: string | null;

  githubPrNumber: number;

  expiresAt: Date | null;

  reviewedById: string;

  reviewedBy: User;

  reviewedAt: Date | null;

  rejectedReason: string | null;

  cliVersion: string;

  createdAt: Date;

  updatedAt: Date;

  deletedAt: Date | null;
}
