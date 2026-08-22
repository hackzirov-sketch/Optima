import { ForbiddenException } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { MemberRole } from '../enums';
import { GroupMember } from '../../database/entities/group-member.entity';

const member = (userId: string, role: MemberRole) =>
  ({ userId, role }) as GroupMember;

describe('PermissionService.assertOutranksTarget', () => {
  const permission = new PermissionService();

  it('stops an admin from acting on a fellow admin', () => {
    // assertCanChangeRoleTo only vets the role being handed out, so demoting
    // a peer admin to 'member' passed it. One admin could then strip every
    // other admin and be left sole manager of the group.
    expect(() =>
      permission.assertOutranksTarget(
        member('a', MemberRole.ADMIN),
        member('b', MemberRole.ADMIN),
      ),
    ).toThrow(ForbiddenException);
  });

  it('stops an admin from acting on the owner', () => {
    expect(() =>
      permission.assertOutranksTarget(
        member('a', MemberRole.ADMIN),
        member('b', MemberRole.OWNER),
      ),
    ).toThrow(ForbiddenException);
  });

  it('lets an admin act on someone below them', () => {
    expect(() =>
      permission.assertOutranksTarget(
        member('a', MemberRole.ADMIN),
        member('b', MemberRole.LEAD),
      ),
    ).not.toThrow();
  });

  it('lets the owner act on an admin', () => {
    expect(() =>
      permission.assertOutranksTarget(
        member('a', MemberRole.OWNER),
        member('b', MemberRole.ADMIN),
      ),
    ).not.toThrow();
  });

  it('always allows acting on yourself, so leaving still works', () => {
    // remove() routes self-removal through here too; an admin must not be
    // locked out of leaving their own group by the peer-admin rule.
    expect(() =>
      permission.assertOutranksTarget(
        member('a', MemberRole.ADMIN),
        member('a', MemberRole.ADMIN),
      ),
    ).not.toThrow();
  });
});
