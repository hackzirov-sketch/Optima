import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateAvatarSchema = z.object({
  avatarUrl: z
    .string()
    .max(2048)
    .regex(
      /^https?:\/\/(cdn\.upz\.dev|localhost(:\d+)?|r2\.upz\.dev)\//,
      'avatarUrl must be from the authorized CDN domain',
    ),
});

export class UpdateAvatarDto extends createZodDto(updateAvatarSchema) {}
