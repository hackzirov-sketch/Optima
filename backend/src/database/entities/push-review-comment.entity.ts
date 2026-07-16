import { TaskPush } from './task-push.entity';
import { User } from './user.entity';

export interface PushReviewComment {
  id: string;

  pushId: string;

  push: TaskPush;

  authorId: string;

  author: User;

  parentId: string;

  parent: PushReviewComment;

  replies: PushReviewComment[];

  content: string;

  filePath: string;

  lineNumber: number;

  lineType: string;

  isResolved: boolean;

  resolvedById: string | null;

  resolvedBy: User;

  resolvedAt: Date | null;

  createdAt: Date;

  updatedAt: Date;
}
