import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsInt, Min, IsEnum } from 'class-validator';
import { TaskStatus } from '../../../common/enums';

export class MoveTaskDto {
  @ApiProperty({ required: false, description: 'Target column ID' })
  @IsOptional()
  @IsUUID()
  columnId?: string;

  @ApiProperty({ required: false, description: 'New position index within column (0-based)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiProperty({ required: false, enum: TaskStatus, description: 'Status override on move' })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
