import { ForbiddenException, Injectable } from '@nestjs/common';
import { MemberRole } from '../enums';
import { ErrorCode } from '../enums/error-code.enum';
import { ROLE_LEVEL } from '../constants/role-levels';

/**
 * Everything here decides on a role, and assertOutranksTarget also needs to
 * know who the member is. Taking those two fields rather than the full
 * GroupMember entity means a caller can pass whatever shape it already
 * has — including the narrow record MembersService.assertMember caches, which
 * deliberately omits the relations and timestamps nothing here reads.
 */
export interface RoleBearer {
  userId: string;
  role: MemberRole;
}

@Injectable()
export class PermissionService {
  isAtLeast(member: Pick<RoleBearer, 'role'>, role: MemberRole): boolean {
    return ROLE_LEVEL[member.role] >= ROLE_LEVEL[role];
  }

  // OWNER or ADMIN
  assertCanManageGroup(member: Pick<RoleBearer, 'role'>): void {
    if (!this.isAtLeast(member, MemberRole.ADMIN)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Group manager (owner or admin) required',
      });
    }
  }

  // OWNER, ADMIN, or LEAD
  assertCanManageProject(member: Pick<RoleBearer, 'role'>): void {
    if (!this.isAtLeast(member, MemberRole.LEAD)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Lead, admin or owner required to manage projects',
      });
    }
  }

  // OWNER, ADMIN, or LEAD (task delete)
  assertCanDeleteTask(member: Pick<RoleBearer, 'role'>): void {
    if (!this.isAtLeast(member, MemberRole.LEAD)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Lead, admin or owner required to delete tasks',
      });
    }
  }

  // OWNER, ADMIN, LEAD, SENIOR (code review)
  assertCanReviewPush(member: Pick<RoleBearer, 'role'>): void {
    if (!this.isAtLeast(member, MemberRole.SENIOR)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Senior or above required to review pushes',
      });
    }
  }

  // OWNER, ADMIN, or LEAD (push approve)
  assertCanApprovePush(member: Pick<RoleBearer, 'role'>): void {
    if (!this.isAtLeast(member, MemberRole.LEAD)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Lead, admin or owner required to approve pushes',
      });
    }
  }

  // OWNER, ADMIN, or LEAD (create chat room)
  assertCanCreateChatRoom(member: Pick<RoleBearer, 'role'>): void {
    if (!this.isAtLeast(member, MemberRole.LEAD)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Lead, admin or owner required to create chat rooms',
      });
    }
  }

  /**
   * Guards the *other* half of a role change: who the target currently is.
   *
   * assertCanChangeRoleTo only inspects the role being handed out, so an admin
   * assigning `member` passed it — including when the person on the receiving
   * end was a fellow admin. One admin could therefore demote every other admin
   * (and, via the same gap in remove(), eject them), leaving a group with a
   * single self-appointed manager. Only the owner outranks an admin, so only
   * the owner may act on one.
   */
  assertOutranksTarget(requester: RoleBearer, target: RoleBearer): void {
    if (requester.userId === target.userId) return;
    if (ROLE_LEVEL[requester.role] <= ROLE_LEVEL[target.role]) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'You cannot act on a member at or above your own role',
      });
    }
  }

  // Role assignment rules:
  //   OWNER target role → never assignable here, must go through transferOwnership()
  //   OWNER (requester) → can assign any non-OWNER role
  //   ADMIN (requester) → can only assign ≤ LEAD (cannot grant ADMIN or OWNER)
  //   Others → cannot change roles at all
  assertCanChangeRoleTo(requester: RoleBearer, targetRole: MemberRole): void {
    if (targetRole === MemberRole.OWNER) {
      throw new ForbiddenException({
        code: ErrorCode.OWNERSHIP_TRANSFER_REQUIRED,
        message: 'Use the ownership transfer flow to grant the OWNER role',
      });
    }

    if (!this.isAtLeast(requester, MemberRole.ADMIN)) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Admin or owner required to change roles',
      });
    }

    if (
      requester.role === MemberRole.ADMIN &&
      ROLE_LEVEL[targetRole] >= ROLE_LEVEL[MemberRole.ADMIN]
    ) {
      throw new ForbiddenException({
        code: ErrorCode.INSUFFICIENT_PERMISSIONS,
        message: 'Admins can only assign roles up to Lead',
      });
    }
  }

  // Only the exact OWNER role may delete the group (level-based check is
  // not enough — ADMIN must NOT be able to delete, even though it's "close" to OWNER).
  assertCanDeleteGroup(member: Pick<RoleBearer, 'role'>): void {
    if (member.role !== MemberRole.OWNER) {
      throw new ForbiddenException({
        code: ErrorCode.NOT_GROUP_OWNER,
        message: 'Only the group owner can delete the group',
      });
    }
  }
}
