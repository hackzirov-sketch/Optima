import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const passwordMessage =
  'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character';

export const resetPasswordSchema = z.object({
  confirmedToken: z.string().min(1),
  password: z.string().min(8).max(32).regex(passwordRegex, passwordMessage),
});

export class ResetPasswordDto extends createZodDto(resetPasswordSchema) {}
