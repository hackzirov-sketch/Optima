import { User } from './user.entity';
import { Project } from './project.entity';

export interface DeveloperProjectStats {
  id: string;

  userId: string;

  user: User;

  projectId: string;

  project: Project;

  commitsCount: number;

  pushesCount: number;

  approvedPushes: number;

  rejectedPushes: number;

  tasksCompleted: number;

  tasksInProgress: number;

  addedLines: number;

  removedLines: number;

  reviewScore: number;

  reviewCount: number;

  updatedAt: Date;
}
