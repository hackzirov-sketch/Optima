import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('github_accounts')
export class GithubAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @OneToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'github_user_id', type: 'bigint', unique: true })
  githubUserId: number;

  @Column({ length: 100 })
  username: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({ length: 255, nullable: true })
  email: string;

  @Column({ name: 'access_token_encrypted', type: 'text' })
  accessTokenEncrypted: string;

  @Column({ name: 'refresh_token_encrypted', type: 'text', nullable: true })
  refreshTokenEncrypted: string | null;

  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ name: 'connected_at', type: 'timestamptz', default: () => 'NOW()' })
  connectedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
