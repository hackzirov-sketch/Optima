import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  OneToMany,
} from 'typeorm';
import { ProjectStatus, PriorityLevel } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { Group } from './group.entity';
import { Repository } from './repository.entity';
import { User } from './user.entity';
import { ProjectColumn } from './project-column.entity';

@Entity('projects')
@Unique(['workspaceId', 'slug'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'group_id', nullable: true })
  groupId: string;

  @ManyToOne(() => Group, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'group_id' })
  group: Group;

  @Column({ name: 'repository_id', nullable: true })
  repositoryId: string;

  @ManyToOne(() => Repository, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'repository_id' })
  repository: Repository;

  @Column({ length: 200 })
  name: string;

  @Column({ length: 200 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'cover_url', type: 'text', nullable: true })
  coverUrl: string | null;

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.PLANNING,
  })
  status: ProjectStatus;

  @Column({
    type: 'enum',
    enum: PriorityLevel,
    default: PriorityLevel.MEDIUM,
  })
  priority: PriorityLevel;

  @Column({ type: 'smallint', default: 0 })
  progress: number;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', nullable: true })
  deadline: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'created_by' })
  createdById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'updated_by', nullable: true })
  updatedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedBy: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;

  // Relations
  @OneToMany(() => ProjectColumn, (column) => column.project)
  columns: ProjectColumn[];
}
