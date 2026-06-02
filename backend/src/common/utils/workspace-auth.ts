import { ConflictException } from '@nestjs/common';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { WorkspaceRole } from '../enums';
import { ErrorCode } from '../enums/error-code.enum';

/**
 * Workspace billing owner (`workspace.ownerId`) or member with OWNER/ADMIN role.
 */
export function assertWorkspaceManager(
  workspace: Workspace,
  userId: string,
  member: WorkspaceMember | null,
): void {
  if (workspace.ownerId === userId) return;

  if (
    member &&
    (member.role === WorkspaceRole.OWNER || member.role === WorkspaceRole.ADMIN)
  ) {
    return;
  }

  throw new ConflictException({
    code: ErrorCode.INSUFFICIENT_PERMISSIONS,
    message: 'Not allowed to manage this workspace',
  });
}

/**
 * Only the workspace billing owner may permanently soft-delete the workspace.
 * ADMIN members cannot delete the workspace (by design).
 */
export function assertWorkspaceBillingOwner(
  workspace: Workspace,
  userId: string,
): void {
  if (workspace.ownerId !== userId) {
    throw new ConflictException({
      code: ErrorCode.INSUFFICIENT_PERMISSIONS,
      message: 'Only the workspace billing owner can delete the workspace',
    });
  }
}
