import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MemberRole } from '../../../common/enums';

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(MemberRole),
});

export class InviteMemberDto extends createZodDto(inviteMemberSchema) {}
