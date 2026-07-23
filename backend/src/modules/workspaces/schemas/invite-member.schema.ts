import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkspaceRole } from '../../../common/enums';

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(WorkspaceRole),
});

export class InviteMemberDto extends createZodDto(inviteMemberSchema) {}
