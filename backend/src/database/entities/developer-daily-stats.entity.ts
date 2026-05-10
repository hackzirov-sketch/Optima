import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Project } from './project.entity';
import { Workspace } from './workspace.entity';

@Entity('developer_daily_stats')
@Unique(['userId', 'projectId', 'date'])
export class DeveloperDailyStats {
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

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ type: 'date' })
  date: string;

  @Column({ name: 'commits_count', default: 0 })
  commitsCount: number;

  @Column({ name: 'tasks_completed', default: 0 })
  tasksCompleted: number;

  @Column({ name: 'pushes_submitted', default: 0 })
  pushesSubmitted: number;

  @Column({ name: 'pushes_approved', default: 0 })
  pushesApproved: number;

  @Column({ name: 'added_lines', default: 0 })
  addedLines: number;

  @Column({ name: 'removed_lines', default: 0 })
  removedLines: number;

  @Column({ name: 'active_minutes', default: 0 })
  activeMinutes: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
