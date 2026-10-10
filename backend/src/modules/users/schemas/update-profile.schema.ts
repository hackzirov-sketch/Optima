import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { UserTheme, UserLanguage, UserOccupation } from '../../../common/enums';

export const updateProfileSchema = z.object({
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  username: z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value.trim().replace(/^@+/, '') || null
        : value,
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{3,50}$/)
      .nullable()
      .optional(),
  ),
  nickname: z.string().trim().min(1).max(50).nullable().optional(),
  avatarUrl: z.string().url().optional(),
  nameEmoji: z
    .string()
    .regex(/^(?:p[1-4]|[aw]\d{3})-\d{4}$/)
    .nullable()
    .optional(),
  language: z.nativeEnum(UserLanguage).optional(),
  timezone: z.string().optional(),
  theme: z.nativeEnum(UserTheme).optional(),
  phoneNumber: z.coerce
    .number()
    .min(10000000000)
    .max(999999999999999)
    .optional(),
  occupation: z.nativeEnum(UserOccupation).optional(),
  /** A line about yourself, shown on the profile (Telegram's 70-140 chars). */
  bio: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() || null : value),
    z.string().max(140).nullable().optional(),
  ),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return (
        !Number.isNaN(+date) &&
        date < new Date() &&
        date.getUTCFullYear() >= 1900
      );
    }, 'Invalid birthday')
    .nullable()
    .optional(),
});

export class UpdateProfileDto extends createZodDto(updateProfileSchema) {}
