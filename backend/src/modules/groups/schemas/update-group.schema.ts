import { createZodDto } from 'nestjs-zod';
import { createGroupSchema } from './create-group.schema';

export const updateGroupSchema = createGroupSchema
  .omit({ workspaceId: true })
  .partial();

export class UpdateGroupDto extends createZodDto(updateGroupSchema) {}
