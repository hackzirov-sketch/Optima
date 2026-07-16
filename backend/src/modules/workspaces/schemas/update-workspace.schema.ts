import { createZodDto } from 'nestjs-zod';
import { createWorkspaceSchema } from './create-workspace.schema';

export const updateWorkspaceSchema = createWorkspaceSchema.partial();

export class UpdateWorkspaceDto extends createZodDto(updateWorkspaceSchema) {}
