import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PushType, PushStatus } from '../../common/enums';
import { Task } from './task.entity';
import { User } from './user.entity';
import { Repository } from './repository.entity';

@Entity('task_pushes')
export class TaskPush {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'task_id' })
  taskId: string;

  @ManyToOne(() => Task, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task: Task;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'repository_id', type: 'uuid', nullable: true })
  repositoryId: string | null;

  @ManyToOne(() => Repository, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'repository_id' })
  repository: Repository | null;

  @Column({ name: 'branch_name', length: 255 })
  branchName: string;

  @Column({
    type: 'enum',
    enum: PushType,
    default: PushType.UPZ_REVIEW,
  })
  type: PushType;

  @Column({
    type: 'enum',
    enum: PushStatus,
    default: PushStatus.PENDING,
  })
  status: PushStatus;

  @Column({ name: 'commit_message', type: 'text' })
  commitMessage: string;

  @Column({ name: 'commit_sha', length: 40, nullable: true })
  commitSha: string;

  @Column({ name: 'commits_count', default: 1 })
  commitsCount: number;

  @Column({ name: 'files_changed', nullable: true })
  filesChanged: number;

  @Column({ name: 'added_lines', nullable: true })
  addedLines: number;

  @Column({ name: 'removed_lines', nullable: true })
  removedLines: number;

  @Column({ name: 'storage_provider', length: 20, default: 'r2' })
  storageProvider: string;

  @Column({ name: 'storage_url', type: 'text', nullable: true })
  storageUrl: string | null;

  @Column({ name: 'storage_key', type: 'text', nullable: true })
  storageKey: string | null;

  @Column({ name: 'github_commit_sha', length: 40, nullable: true })
  githubCommitSha: string;

  @Column({ name: 'github_pr_url', type: 'text', nullable: true })
  githubPrUrl: string | null;

  @Column({ name: 'github_pr_number', nullable: true })
  githubPrNumber: number;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'reviewed_by', nullable: true })
  reviewedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewedBy: User;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ name: 'rejected_reason', type: 'text', nullable: true })
  rejectedReason: string | null;

  @Column({ name: 'cli_version', length: 20, nullable: true })
  cliVersion: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
