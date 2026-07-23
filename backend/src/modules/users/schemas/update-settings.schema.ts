import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const updateSettingsSchema = z.object({
  notificationsEnabled: z.boolean().optional(),
  emailNotifications: z.boolean().optional(),
  pushNotifications: z.boolean().optional(),
  notifyTaskAssigned: z.boolean().optional(),
  notifyPushReviewed: z.boolean().optional(),
  notifyPrEvents: z.boolean().optional(),
  notifyMentions: z.boolean().optional(),
});

export class UpdateSettingsDto extends createZodDto(updateSettingsSchema) {}
