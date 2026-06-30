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
  Index,
} from 'typeorm';
import { TaskType, PriorityLevel, TaskStatus } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { Project } from './project.entity';
import { Group } from './group.entity';
import { ProjectColumn } from './project-column.entity';
import { User } from './user.entity';
import { TaskTag } from './task-tag.entity';
import { TaskWatcher } from './task-watcher.entity';

@Index(['workspaceId', 'projectId', 'deletedAt'])
@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @Column({ name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ name: 'group_id', nullable: true })
  groupId!: string | null;

  @ManyToOne(() => Group, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'group_id' })
  group!: Group | null;

  @Column({ name: 'column_id', type: 'uuid', nullable: true })
  columnId!: string | null;

  @ManyToOne(() => ProjectColumn, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'column_id' })
  column!: ProjectColumn | null;

  @Column({ name: 'parent_task_id', nullable: true })
  parentTaskId!: string | null;

  @ManyToOne(() => Task, (task) => task.subtasks, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'parent_task_id' })
  parentTask!: Task | null;

  @OneToMany(() => Task, (task) => task.parentTask)
  subtasks!: Task[];

  @OneToMany(() => TaskTag, (tt) => tt.task)
  taskTags!: TaskTag[];

  @OneToMany(() => TaskWatcher, (tw) => tw.task)
  watchers!: TaskWatcher[];

  @Column({ name: 'task_number' })
  taskNumber!: number;

  @Column({ name: 'creator_id' })
  creatorId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'creator_id' })
  creator!: User;

  @Column({ name: 'assignee_id', nullable: true })
  assigneeId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee!: User | null;

  @Column({ name: 'reviewer_id', nullable: true })
  reviewerId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer!: User | null;

  @Column({ length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: TaskType,
    default: TaskType.FEATURE,
  })
  type!: TaskType;

  @Column({
    type: 'enum',
    enum: PriorityLevel,
    default: PriorityLevel.MEDIUM,
  })
  priority!: PriorityLevel;

  @Column({
    type: 'enum',
    enum: TaskStatus,
    default: TaskStatus.BACKLOG,
  })
  status!: TaskStatus;

  @Column({ name: 'story_points', type: 'smallint', nullable: true })
  storyPoints!: number | null;

  @Column({
    name: 'estimated_hours',
    type: 'decimal',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  estimatedHours!: number | null;

  @Column({
    name: 'spent_hours',
    type: 'decimal',
    precision: 6,
    scale: 2,
    default: 0,
  })
  spentHours!: number;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'completion_note', type: 'text', nullable: true })
  completionNote!: string | null;

  @Column({ name: 'github_pr_number', type: 'integer', nullable: true })
  githubPrNumber!: number | null;

  @Column({ name: 'github_pr_url', type: 'text', nullable: true })
  githubPrUrl!: string | null;

  @Column({ default: 0 })
  position!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy!: string | null;
}
