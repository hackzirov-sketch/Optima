import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { WorkspaceRole } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

@Entity('workspace_invitations')
export class WorkspaceInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'invited_by' })
  invitedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'invited_by' })
  invitedBy: User;

  @Column({ length: 255 })
  email: string;

  @Column({
    type: 'enum',
    enum: WorkspaceRole,
    default: WorkspaceRole.JUNIOR,
  })
  role: WorkspaceRole;

  @Column({ length: 64, unique: true })
  token: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ name: 'declined_at', type: 'timestamptz', nullable: true })
  declinedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
