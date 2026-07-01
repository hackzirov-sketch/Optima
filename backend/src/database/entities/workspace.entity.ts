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
import { WorkspaceVisibility } from '../../common/enums';
import { User } from './user.entity';
import { WorkspaceMember } from './workspace-member.entity';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @ManyToOne(() => User, (user) => user.ownedWorkspaces)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({ length: 100 })
  name: string;

  @Column({ unique: true, length: 100 })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({
    type: 'enum',
    enum: WorkspaceVisibility,
    default: WorkspaceVisibility.PRIVATE,
  })
  visibility: WorkspaceVisibility;

  @Column({ name: 'max_members', default: 10 })
  maxMembers: number;

  @Column({ name: 'max_projects', default: 20 })
  maxProjects: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;

  // Relations
  @OneToMany(() => WorkspaceMember, (member) => member.workspace)
  members: WorkspaceMember[];
}
