import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Project } from './project.entity';
import { User } from './user.entity';

export type ProjectMemberRole = 'manager' | 'member';
export type ProjectMemberStatus = 'pending' | 'accepted' | 'declined';

@Entity('project_members')
@Unique(['projectId', 'userId'])
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ length: 20, default: 'member' })
  role!: ProjectMemberRole;

  @Column({ length: 20, default: 'pending' })
  status!: ProjectMemberStatus;

  @Column({ name: 'invited_by', nullable: true })
  invitedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'invited_by' })
  inviter!: User | null;

  @CreateDateColumn({ name: 'invited_at', type: 'timestamptz' })
  invitedAt!: Date;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt!: Date | null;
}
