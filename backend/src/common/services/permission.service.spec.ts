import { ForbiddenException } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { WorkspaceRole } from '../enums';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';

const member = (userId: string, role: WorkspaceRole) =>
  ({ userId, role }) as WorkspaceMember;

describe('PermissionService.assertOutranksTarget', () => {
  const permission = new PermissionService();

  it('stops an admin from acting on a fellow admin', () => {
    // assertCanChangeRoleTo only vets the role being handed out, so demoting
    // a peer admin to 'member' passed it. One admin could then strip every
    // other admin and be left sole manager of the workspace.
    expect(() =>
      permission.assertOutranksTarget(
        member('a', WorkspaceRole.ADMIN),
        member('b', WorkspaceRole.ADMIN),
      ),
    ).toThrow(ForbiddenException);
  });

  it('stops an admin from acting on the owner', () => {
    expect(() =>
      permission.assertOutranksTarget(
        member('a', WorkspaceRole.ADMIN),
        member('b', WorkspaceRole.OWNER),
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets an admin act on someone below them', () => {
    expect(() =>
      permission.assertOutranksTarget(
        member('a', WorkspaceRole.ADMIN),
        member('b', WorkspaceRole.LEAD),
      ),
    ).not.toThrow();
  });

  it('lets the owner act on an admin', () => {
    expect(() =>
      permission.assertOutranksTarget(
        member('a', WorkspaceRole.OWNER),
        member('b', WorkspaceRole.ADMIN),
      ),
    ).not.toThrow();
  });

  it('always allows acting on yourself, so leaving still works', () => {
    // remove() routes self-removal through here too; an admin must not be
    // locked out of leaving their own workspace by the peer-admin rule.
    expect(() =>
      permission.assertOutranksTarget(
        member('a', WorkspaceRole.ADMIN),
        member('a', WorkspaceRole.ADMIN),
      ),
    ).not.toThrow();
  });
});
