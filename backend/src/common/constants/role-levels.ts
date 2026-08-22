import { MemberRole } from '../enums';

export const ROLE_LEVEL: Record<MemberRole, number> = {
  [MemberRole.OWNER]: 7,
  [MemberRole.ADMIN]: 6,
  [MemberRole.LEAD]: 5,
  [MemberRole.SENIOR]: 4,
  [MemberRole.MIDDLE]: 3,
  [MemberRole.JUNIOR]: 2,
  [MemberRole.GUEST]: 1,
};
