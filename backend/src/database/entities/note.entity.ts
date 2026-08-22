import { Group } from './group.entity';
import { Project } from './project.entity';
import { Task } from './task.entity';
import { User } from './user.entity';

/**
 * A note can be scoped as broadly or narrowly as needed:
 *  - group_id + project_id + task_id all set  -> a note on one task
 *  - group_id + project_id set, task_id null   -> a note on a project
 *  - only group_id set                          -> a group-wide note
 *  - all three null                                 -> a fully global/personal note
 */
export interface Note {
  id: string;

  groupId: string | null;

  group: Group | null;

  projectId: string | null;

  project: Project | null;

  taskId: string | null;

  task: Task | null;

  creatorId: string;

  creator: User;

  title: string;

  content: string;

  createdAt: Date;

  updatedAt: Date;

  deletedAt: Date | null;

  deletedBy: string | null;
}
