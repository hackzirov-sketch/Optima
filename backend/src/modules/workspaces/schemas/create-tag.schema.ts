import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const createTagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'color must be a hex color like #6B7280')
    .optional(),
});

export class CreateTagDto extends createZodDto(createTagSchema) {}
