import { WorkspaceRole } from '../enums';

export const ROLE_LEVEL: Record<WorkspaceRole, number> = {
  [WorkspaceRole.OWNER]: 7,
  [WorkspaceRole.ADMIN]: 6,
  [WorkspaceRole.LEAD]: 5,
  [WorkspaceRole.SENIOR]: 4,
  [WorkspaceRole.MIDDLE]: 3,
  [WorkspaceRole.JUNIOR]: 2,
  [WorkspaceRole.GUEST]: 1,
};
