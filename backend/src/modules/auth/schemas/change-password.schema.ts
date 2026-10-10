import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const passwordMessage =
  'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character';

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(32).regex(passwordRegex, passwordMessage),
});

export class ChangePasswordDto extends createZodDto(changePasswordSchema) {}
