import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from './user.entity';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  workspaceId: string | null;

  @ManyToOne(() => Workspace, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_id' })
  actor: User;

  @Column({ length: 100 })
  action: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 50, nullable: true })
  entityType: string | null;

  @Column({ name: 'entity_id', type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue: any;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue: any;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
