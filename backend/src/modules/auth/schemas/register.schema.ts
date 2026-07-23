import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const passwordMessage =
  'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character';

export const registerSchema = z.object({
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores and hyphens'),
  email: z.string().email(),
  password: z.string().min(8).max(32).regex(passwordRegex, passwordMessage),
  phoneNumber: z.coerce.number().min(10000000000).max(999999999999999).optional(),
  occupation: z.string().max(100).optional(),
});

export class RegisterDto extends createZodDto(registerSchema) {}
