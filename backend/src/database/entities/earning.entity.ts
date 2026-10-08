import { Group } from './group.entity';
import { User } from './user.entity';

export interface Earning {
  id: string;

  groupId: string;

  group: Group;

  userId: string;

  user: User;

  amount: number;

  currency: string;

  description: string | null;

  date: string;

  sourceType: string | null;

  sourceId: string | null;

  createdAt: Date;

  updatedAt: Date;
}
