import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ip_rate_limits')
@Index(['ip', 'actionType'], { unique: true })
export class IpRateLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 45 })
  ip: string;

  @Column({ name: 'action_type', length: 100 })
  actionType: string;

  @Column({ default: 1 })
  count: number;

  @Column({ name: 'window_start', type: 'timestamptz' })
  windowStart: Date;

  @Column({ name: 'blocked_until', type: 'timestamptz', nullable: true })
  blockedUntil: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
