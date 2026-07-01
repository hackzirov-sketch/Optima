import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Workspace } from './workspace.entity';

@Entity('repositories')
export class Repository {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'github_repo_id', type: 'bigint', unique: true })
  githubRepoId: number;

  @Column({ length: 255 })
  name: string;

  @Column({ name: 'full_name', length: 255 })
  fullName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ default: false })
  private: boolean;

  @Column({ name: 'default_branch', length: 100, default: 'main' })
  defaultBranch: string;

  @Column({ name: 'clone_url', type: 'text', nullable: true })
  cloneUrl: string | null;

  @Column({ name: 'html_url', type: 'text', nullable: true })
  htmlUrl: string | null;

  @Column({ name: 'require_review', default: true })
  requireReview: boolean;

  @Column({
    name: 'protected_branches',
    type: 'text',
    array: true,
    default: ['main', 'master', 'develop'],
  })
  protectedBranches: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
