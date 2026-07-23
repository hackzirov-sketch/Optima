import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export class ResendVerificationDto extends createZodDto(resendVerificationSchema) {}
