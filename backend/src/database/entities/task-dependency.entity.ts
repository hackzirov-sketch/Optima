import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Check,
} from 'typeorm';
import { DependencyType } from '../../common/enums';
import { Task } from './task.entity';
import { User } from './user.entity';

@Entity('task_dependencies')
@Unique(['taskId', 'dependsOnId'])
@Check(`"task_id" != "depends_on_id"`)
export class TaskDependency {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id' })
  taskId: string;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @Column({ name: 'depends_on_id' })
  dependsOnId: string;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depends_on_id' })
  dependsOn: Task;

  @Column({
    type: 'enum',
    enum: DependencyType,
    default: DependencyType.BLOCKS,
  })
  type: DependencyType;

  @Column({ name: 'created_by' })
  createdById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
