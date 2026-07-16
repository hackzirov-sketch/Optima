import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { GroupType } from '../../../common/enums';

export const createGroupSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  slug: z.string().optional(),
  type: z.nativeEnum(GroupType).optional(),
});

export class CreateGroupDto extends createZodDto(createGroupSchema) {}
