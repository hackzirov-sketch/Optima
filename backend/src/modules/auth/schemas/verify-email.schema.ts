import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const verifyEmailSchema = z.object({
  verifyToken: z.string().min(32).max(128),
  code: z.coerce.string().length(6),
});

export class VerifyEmailDto extends createZodDto(verifyEmailSchema) {}
