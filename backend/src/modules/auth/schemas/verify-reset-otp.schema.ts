import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const verifyResetOtpSchema = z.object({
  resetToken: z.string().min(1),
  otp: z.string().length(6, 'OTP must be exactly 6 digits'),
});

export class VerifyResetOtpDto extends createZodDto(verifyResetOtpSchema) {}
