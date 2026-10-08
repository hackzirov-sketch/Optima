import { createZodDto } from 'nestjs-zod';
import { createTagSchema } from './create-tag.schema';

export const updateTagSchema = createTagSchema.partial();

export class UpdateTagDto extends createZodDto(updateTagSchema) {}
