import { TaskType, PriorityLevel, TaskStatus } from '../../common/enums';
import { Project } from './project.entity';
import { Group } from './group.entity';
import { ProjectColumn } from './project-column.entity';
import { User } from './user.entity';
import { TaskTag } from './task-tag.entity';
import { TaskWatcher } from './task-watcher.entity';

export interface Task {
  id: string;

  projectId: string;

  project: Project;

  groupId: string;

  group: Group;

  columnId: string | null;

  column: ProjectColumn | null;

  parentTaskId: string | null;

  parentTask: Task | null;

  subtasks: Task[];

  taskTags: TaskTag[];

  watchers: TaskWatcher[];

  taskNumber: number;

  creatorId: string;

  creator: User;

  assigneeId: string | null;

  assignee: User | null;

  reviewerId: string | null;

  reviewer: User | null;

  title: string;

  description: string | null;

  type: TaskType;

  priority: PriorityLevel;

  status: TaskStatus;

  storyPoints: number | null;

  estimatedHours: number | null;

  spentHours: number;

  startDate: string | null;

  dueDate: string | null;

  startedAt: Date | null;

  completedAt: Date | null;

  completionNote: string | null;

  githubPrNumber: number | null;

  githubPrUrl: string | null;

  position: number;

  createdAt: Date;

  updatedAt: Date;

  deletedAt: Date | null;

  deletedBy: string | null;
}
