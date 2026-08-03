import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const transferOwnershipSchema = z.object({
  newOwnerUserId: z.string().uuid(),
});

export class TransferOwnershipDto extends createZodDto(
  transferOwnershipSchema,
) {}
