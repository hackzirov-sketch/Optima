import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateBackgroundSchema = z.object({
  backgroundUrl: z
    .string()
    .max(2048)
    .nullable()
    .refine(
      (value) => value === null || /^https?:\/\/(cdn\.upz\.dev|localhost(:\d+)?|r2\.upz\.dev)\//.test(value),
      'backgroundUrl must be from the authorized CDN domain',
    ),
});

export class UpdateBackgroundDto extends createZodDto(updateBackgroundSchema) {}
