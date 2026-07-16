import { User } from './user.entity';
import { Project } from './project.entity';
import { Workspace } from './workspace.entity';

export interface DeveloperDailyStats {
  id: string;

  userId: string;

  user: User;

  projectId: string;

  project: Project;

  workspaceId: string;

  workspace: Workspace;

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
