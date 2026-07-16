import { Task } from './task.entity';
import { User } from './user.entity';

export interface TaskWatcher {
  taskId: string;

  task: Task;

  userId: string;

  user: User;

  createdAt: Date;
}
