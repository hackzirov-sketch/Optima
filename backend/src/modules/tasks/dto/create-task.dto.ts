import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsInt,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { TaskType, TaskStatus, PriorityLevel } from '../../../common/enums';

export class CreateTaskDto {
  @ApiProperty({ example: 'uuid-of-project' })
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @ApiProperty({ example: 'uuid-of-workspace' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId: string;

  @ApiProperty({ required: false, example: 'uuid-of-column' })
  @IsOptional()
  @IsUUID()
  columnId?: string;

  @ApiProperty({
    required: false,
    example: 'uuid-of-parent-task (for subtasks)',
  })
  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  @ApiProperty({ required: false, example: 'uuid-of-assignee' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiProperty({ required: false, example: 'uuid-of-reviewer' })
  @IsOptional()
  @IsUUID()
  reviewerId?: string;

  @ApiProperty({ example: 'Implement JWT auth refresh flow' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  title: string;

  @ApiProperty({ required: false, example: 'Detailed description...' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TaskType, default: TaskType.FEATURE, required: false })
  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @ApiProperty({
    enum: PriorityLevel,
    default: PriorityLevel.MEDIUM,
    required: false,
  })
  @IsOptional()
  @IsEnum(PriorityLevel)
  priority?: PriorityLevel;

  @ApiProperty({
    enum: TaskStatus,
    default: TaskStatus.BACKLOG,
    required: false,
  })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiProperty({ required: false, example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  storyPoints?: number;

  @ApiProperty({ required: false, example: 8.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedHours?: number;

  @ApiProperty({ required: false, example: '2026-05-15' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
