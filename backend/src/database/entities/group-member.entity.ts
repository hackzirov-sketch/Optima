import { MemberRole } from '../../common/enums';
import { Group } from './group.entity';
import { User } from './user.entity';

export interface GroupMember {
  id: string;

  groupId: string;

  group: Group;

  userId: string;

  user: User;

  role: MemberRole;

  joinedAt: Date;

  createdAt: Date;

  updatedAt: Date;
}
