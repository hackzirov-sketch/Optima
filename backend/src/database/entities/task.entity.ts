import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import {
  TaskType,
  PriorityLevel,
  TaskStatus,
} from '../../common/enums';
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';
import { Group } from './group.entity';
import { ProjectColumn } from './project-column.entity';
import { User } from './user.entity';

@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ name: 'group_id', nullable: true })
  groupId: string;

  @ManyToOne(() => Group, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ name: 'column_id', nullable: true })
  columnId: string;

  @ManyToOne(() => ProjectColumn, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'column_id' })
  column: ProjectColumn;

  @Column({ name: 'parent_task_id', nullable: true })
  parentTaskId: string;

  @ManyToOne(() => Task, (task) => task.subtasks, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'parent_task_id' })
  parentTask: Task;

  @OneToMany(() => Task, (task) => task.parentTask)
  subtasks: Task[];

  @Column({ name: 'task_number' })
  taskNumber: number;

  @Column({ name: 'creator_id' })
  creatorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_id' })
  creator: User;

  @Column({ name: 'assignee_id', nullable: true })
  assigneeId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee: User;

  @Column({ name: 'reviewer_id', nullable: true })
  reviewerId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @Column({ length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: TaskType,
    default: TaskType.FEATURE,
  })
  type: TaskType;

  @Column({
    type: 'enum',
    enum: PriorityLevel,
    default: PriorityLevel.MEDIUM,
  })
  priority: PriorityLevel;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.BACKLOG,
  })
  status: TaskStatus;

  @Column({ name: 'story_points', type: 'smallint', nullable: true })
  storyPoints: number;

  @Column({
    name: 'estimated_hours',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  estimatedHours: number;

  @Column({
    name: 'spent_hours',
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 0,
  })
  spentHours: number;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate: string;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date;

  @Column({ name: 'github_pr_number', nullable: true })
  githubPrNumber: number;

  @Column({ name: 'github_pr_url', type: 'text', nullable: true })
  githubPrUrl: string;

  @Column({ default: 0 })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string;
}
