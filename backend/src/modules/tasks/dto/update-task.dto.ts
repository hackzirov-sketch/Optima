import { PartialType, OmitType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(
  OmitType(CreateTaskDto, ['projectId', 'groupId'] as const),
) {
  @ApiPropertyOptional({
    description: 'Note about what was accomplished (shown on completion)',
  })
  @IsOptional()
  @IsString()
  completionNote?: string | null;
}
