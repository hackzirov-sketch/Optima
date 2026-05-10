import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Project } from './project.entity';

@Entity('developer_project_stats')
@Unique(['userId', 'projectId'])
export class DeveloperProjectStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'commits_count', default: 0 })
  commitsCount: number;

  @Column({ name: 'pushes_count', default: 0 })
  pushesCount: number;

  @Column({ name: 'approved_pushes', default: 0 })
  approvedPushes: number;

  @Column({ name: 'rejected_pushes', default: 0 })
  rejectedPushes: number;

  @Column({ name: 'tasks_completed', default: 0 })
  tasksCompleted: number;

  @Column({ name: 'tasks_in_progress', default: 0 })
  tasksInProgress: number;

  @Column({ name: 'added_lines', type: 'bigint', default: 0 })
  addedLines: number;

  @Column({ name: 'removed_lines', type: 'bigint', default: 0 })
  removedLines: number;

  @Column({
    name: 'review_score',
    type: 'decimal',
    precision: 3,
    scale: 2,
    default: 0,
  })
  reviewScore: number;

  @Column({ name: 'review_count', default: 0 })
  reviewCount: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
