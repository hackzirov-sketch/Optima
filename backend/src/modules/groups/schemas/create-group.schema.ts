import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { GroupVisibility } from '../../../common/enums';

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().optional(),
  visibility: z.nativeEnum(GroupVisibility).optional(),
  maxMembers: z.coerce.number().int().min(1).optional(),
  maxProjects: z.coerce.number().int().min(1).optional(),
});

export class CreateGroupDto extends createZodDto(createGroupSchema) {}
