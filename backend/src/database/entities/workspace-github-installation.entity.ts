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

@Entity('workspace_github_installations')
export class WorkspaceGithubInstallation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'github_installation_id', type: 'bigint', unique: true })
  githubInstallationId: number;

  @Column({ name: 'github_org_name', length: 100, nullable: true })
  githubOrgName: string;

  @Column({ name: 'github_org_avatar_url', type: 'text', nullable: true })
  githubOrgAvatarUrl: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
