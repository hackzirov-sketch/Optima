import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkspaceRole } from '../../../common/enums';

export const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(WorkspaceRole),
});

export class UpdateMemberRoleDto extends createZodDto(updateMemberRoleSchema) {}
