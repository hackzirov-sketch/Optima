import { Task } from './task.entity';
import { Tag } from './tag.entity';

export interface TaskTag {
  taskId: string;

  task: Task;

  tagId: string;

  tag: Tag;

  createdAt: Date;
}
