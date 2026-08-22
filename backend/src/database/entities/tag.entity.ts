import { Group } from './group.entity';
import { User } from './user.entity';

export interface Tag {
  id: string;

  groupId: string;

  group: Group;

  name: string;

  color: string;

  createdById: string;

  createdBy: User;

  createdAt: Date;
}
