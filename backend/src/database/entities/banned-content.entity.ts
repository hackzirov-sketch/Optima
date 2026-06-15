import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('banned_content')
@Index(['active', 'type'])
export class BannedContent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  pattern: string;

  @Column({ length: 20 })
  type: string; // 'word' | 'phrase' | 'regex'

  @Column({ length: 50, nullable: true })
  category: string | null; // 'hate' | 'violence' | 'sexual' | 'spam'

  @Column({ length: 20, default: 'medium' })
  severity: string; // 'low' | 'medium' | 'high' | 'critical'

  @Column({ name: 'is_regex', default: false })
  isRegex: boolean;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
