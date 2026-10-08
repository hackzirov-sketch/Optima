import { createZodDto } from 'nestjs-zod';
import { createGroupSchema } from './create-group.schema';

export const updateGroupSchema = createGroupSchema.partial();

export class UpdateGroupDto extends createZodDto(updateGroupSchema) {}
