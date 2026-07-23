import { Task } from './task.entity';
import { User } from './user.entity';

export interface TaskActivity {
  id: string;

  taskId: string;

  task: Task;

  userId: string;

  user: User;

  type: string;

  description: string | null;

  metadata: any;

  createdAt: Date;
}
