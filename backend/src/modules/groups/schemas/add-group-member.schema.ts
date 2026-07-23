import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkspaceRole } from '../../../common/enums';

export const addGroupMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(WorkspaceRole).optional(),
});

export class AddGroupMemberDto extends createZodDto(addGroupMemberSchema) {}
