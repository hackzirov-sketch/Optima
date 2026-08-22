import { MemberRole } from '../../common/enums';
import { Group } from './group.entity';
import { User } from './user.entity';

export interface GroupInvitation {
  id: string;

  groupId: string;

  group: Group;

  invitedById: string;

  invitedBy: User;

  email: string;

  role: MemberRole;

  token: string;

  expiresAt: Date;

  acceptedAt: Date | null;

  declinedAt: Date | null;

  createdAt: Date;
}
