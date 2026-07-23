import { DependencyType } from '../../common/enums';
import { Task } from './task.entity';
import { User } from './user.entity';

export interface TaskDependency {
  id: string;

  taskId: string;

  task: Task;

  dependsOnId: string;

  dependsOn: Task;

  type: DependencyType;

  createdById: string;

  createdBy: User;

  createdAt: Date;
}
