import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { UserTheme, UserLanguage, UserOccupation } from '../../common/enums';
import { Workspace } from './workspace.entity';
import { WorkspaceMember } from './workspace-member.entity';
import { UserSettings } from './user-settings.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'first_name', length: 50 })
  firstName: string;

  @Column({ name: 'last_name', length: 50 })
  lastName: string;

  @Column({ unique: true, length: 50 })
  username: string;

  @Column({ unique: true, length: 255 })
  email: string;

  @Column({ name: 'phone_number', type: 'bigint', nullable: true })
  phoneNumber: number | null;

  @Column({ name: 'password_hash', type: 'varchar', nullable: true })
  @Exclude()
  passwordHash: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({
    type: 'enum',
    enum: UserLanguage,
    default: UserLanguage.EN,
  })
  language: UserLanguage;

  @Column({ length: 50, default: 'UTC' })
  timezone: string;

  @Column({
    type: 'enum',
    enum: UserTheme,
    default: UserTheme.SYSTEM,
  })
  theme: UserTheme;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({
    type: 'enum',
    enum: UserOccupation,
    nullable: true,
  })
  occupation: UserOccupation | null;

  @Column({ type: 'simple-array', default: 'local' })
  providers: string[];

  @Column({ name: 'needs_password_setup', default: false })
  needsPasswordSetup: boolean;

  @Column({ name: 'last_seen', type: 'timestamptz', nullable: true })
  lastSeen: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @Column({ name: 'deleted_by', type: 'uuid', nullable: true })
  deletedBy: string | null;

  // Virtual getter for backward compatibility
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`.trim();
  }

  // Relations
  @OneToMany(() => Workspace, (workspace) => workspace.owner)
  ownedWorkspaces: Workspace[];

  @OneToMany(() => WorkspaceMember, (member) => member.user)
  workspaceMemberships: WorkspaceMember[];

  @OneToOne(() => UserSettings, (settings) => settings.user)
  settings: UserSettings;
}
