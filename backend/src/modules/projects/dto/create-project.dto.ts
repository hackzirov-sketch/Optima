import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { ProjectStatus, PriorityLevel } from '../../../common/enums';

export class CreateProjectDto {
  @ApiProperty({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId: string;

  @ApiProperty({
    required: false,
    example: '3a954c01-34a1-40e3-a927-ad8e96d8e615',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiProperty({ example: 'UPZ Backend Refactoring' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'upz-backend-refactoring', required: false })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiProperty({
    required: false,
    example: 'Complete rewrite of the UPZ backend',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: ProjectStatus,
    default: ProjectStatus.PLANNING,
    required: false,
  })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiProperty({
    enum: PriorityLevel,
    default: PriorityLevel.MEDIUM,
    required: false,
  })
  @IsOptional()
  @IsEnum(PriorityLevel)
  priority?: PriorityLevel;

  @ApiProperty({ required: false, example: '2026-05-15' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}
