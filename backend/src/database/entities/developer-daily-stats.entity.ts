import { User } from './user.entity';
import { Project } from './project.entity';
import { Group } from './group.entity';

export interface DeveloperDailyStats {
  id: string;

  userId: string;

  user: User;

  projectId: string;

  project: Project;

  groupId: string;

  group: Group;

  date: string;

  commitsCount: number;

  tasksCompleted: number;

  pushesSubmitted: number;

  pushesApproved: number;

  addedLines: number;

  removedLines: number;

  activeMinutes: number;

  createdAt: Date;
}
