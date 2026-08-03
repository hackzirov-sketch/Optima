import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserTheme, UserLanguage, UserOccupation } from '../../../common/enums';

export const updateProfileSchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  avatarUrl: z.string().url().optional(),
  language: z.nativeEnum(UserLanguage).optional(),
  timezone: z.string().optional(),
  theme: z.nativeEnum(UserTheme).optional(),
  phoneNumber: z.coerce
    .number()
    .min(10000000000)
    .max(999999999999999)
    .optional(),
  occupation: z.nativeEnum(UserOccupation).optional(),
});

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
