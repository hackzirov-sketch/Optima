import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { MemberRole } from '../../../common/enums';

export const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(MemberRole),
});

export class UpdateMemberRoleDto extends createZodDto(updateMemberRoleSchema) {}
