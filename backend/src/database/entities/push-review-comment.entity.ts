import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { TaskPush } from './task-push.entity';
import { User } from './user.entity';

@Entity('push_review_comments')
export class PushReviewComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'push_id' })
  pushId: string;

  @ManyToOne(() => TaskPush, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'push_id' })
  push: TaskPush;

  @Column({ name: 'author_id' })
  authorId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'parent_id', nullable: true })
  parentId: string;

  @ManyToOne(() => PushReviewComment, (comment) => comment.replies, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'parent_id' })
  parent: PushReviewComment;

  @OneToMany(() => PushReviewComment, (comment) => comment.parent)
  replies: PushReviewComment[];

  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'file_path', length: 500, nullable: true })
  filePath: string;

  @Column({ name: 'line_number', nullable: true })
  lineNumber: number;

  @Column({ name: 'line_type', length: 10, nullable: true })
  lineType: string;

  @Column({ name: 'is_resolved', default: false })
  isResolved: boolean;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolved_by' })
  resolvedBy: User;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
