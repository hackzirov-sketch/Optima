import { ProjectStatus, PriorityLevel } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { Group } from './group.entity';
import { Repository } from './repository.entity';
import { User } from './user.entity';
import { ProjectColumn } from './project-column.entity';

export interface Project {
  id: string;

  workspaceId: string;

  workspace: Workspace;

  groupId: string;

  group: Group;

  repositoryId: string;

  repository: Repository;

  name: string;

  slug: string;

  description: string | null;

  coverUrl: string | null;

  status: ProjectStatus;

  priority: PriorityLevel;

  progress: number;

  startDate: string | null;

  deadline: string | null;

  completedAt: Date | null;

  createdById: string;

  createdBy: User;

  updatedById: string;

  updatedBy: User;

  createdAt: Date;

  updatedAt: Date;

  deletedAt: Date | null;

  deletedBy: string | null;

  // Relations
  columns: ProjectColumn[];
}
