import { ForbiddenException, Injectable } from '@nestjs/common';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { WorkspaceRole } from '../enums';
import { ErrorCode } from '../enums/error-code.enum';
import { ROLE_LEVEL } from '../constants/role-levels';

@Injectable()
export class PermissionService {
  isAtLeast(member: WorkspaceMember, role: WorkspaceRole): boolean {
    return ROLE_LEVEL[member.role] >= ROLE_LEVEL[role];
  }

  // OWNER or ADMIN
  assertCanManageWorkspace(member: WorkspaceMember): void {
    if (!this.isAtLeast(member, WorkspaceRole.ADMIN)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Workspace manager (owner or admin) required',
      });
    }
  }

  // OWNER, ADMIN, or LEAD
  assertCanManageProject(member: WorkspaceMember): void {
    if (!this.isAtLeast(member, WorkspaceRole.LEAD)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Lead, admin or owner required to manage projects',
      });
    }
  }

  // OWNER, ADMIN, or LEAD (task delete)
  assertCanDeleteTask(member: WorkspaceMember): void {
    if (!this.isAtLeast(member, WorkspaceRole.LEAD)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Lead, admin or owner required to delete tasks',
      });
    }
  }

  // OWNER, ADMIN, LEAD, SENIOR (code review)
  assertCanReviewPush(member: WorkspaceMember): void {
    if (!this.isAtLeast(member, WorkspaceRole.SENIOR)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Senior or above required to review pushes',
      });
    }
  }

  // OWNER, ADMIN, or LEAD (push approve)
  assertCanApprovePush(member: WorkspaceMember): void {
    if (!this.isAtLeast(member, WorkspaceRole.LEAD)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Lead, admin or owner required to approve pushes',
      });
    }
  }

  // OWNER, ADMIN, or LEAD (create chat room)
  assertCanCreateChatRoom(member: WorkspaceMember): void {
    if (!this.isAtLeast(member, WorkspaceRole.LEAD)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Lead, admin or owner required to create chat rooms',
      });
    }
  }

  // Role assignment rules:
  //   OWNER target role → never assignable here, must go through transferOwnership()
  //   OWNER (requester) → can assign any non-OWNER role
  //   ADMIN (requester) → can only assign ≤ LEAD (cannot grant ADMIN or OWNER)
  //   Others → cannot change roles at all
  assertCanChangeRoleTo(
    requester: WorkspaceMember,
    targetRole: WorkspaceRole,
  ): void {
    if (targetRole === WorkspaceRole.OWNER) {
      throw new ForbiddenException({
        code: ErrorCode.OWNERSHIP_TRANSFER_REQUIRED,
        message: 'Use the ownership transfer flow to grant the OWNER role',
      });
    }

    if (!this.isAtLeast(requester, WorkspaceRole.ADMIN)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Admin or owner required to change roles',
      });
    }

    if (
      requester.role === WorkspaceRole.ADMIN &&
      ROLE_LEVEL[targetRole] >= ROLE_LEVEL[WorkspaceRole.ADMIN]
    ) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Admins can only assign roles up to Lead',
      });
    }
  }

  // Only the exact OWNER role may delete the workspace (level-based check is
  // not enough — ADMIN must NOT be able to delete, even though it's "close" to OWNER).
  assertCanDeleteWorkspace(member: WorkspaceMember): void {
    if (member.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_WORKSPACE_OWNER,
        message: 'Only the workspace owner can delete the workspace',
      });
    }
  }
}
