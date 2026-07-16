import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { WorkspaceVisibility } from '../../../common/enums';

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(100),
  description: z.string().optional(),
  visibility: z.nativeEnum(WorkspaceVisibility).optional(),
  maxMembers: z.coerce.number().int().min(1).optional(),
  maxProjects: z.coerce.number().int().min(1).optional(),
});

export class CreateWorkspaceDto extends createZodDto(createWorkspaceSchema) {}
