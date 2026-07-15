import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsOptional,
  IsInt,
  IsBoolean,
  MaxLength,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { MeetingVisibility } from '../../../common/enums';

export class CreateMeetingDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2025-06-15T10:00:00Z' })
  @IsDateString()
  startTime: string;

  @ApiPropertyOptional({ example: '2025-06-15T11:00:00Z' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(500)
  maxParticipants?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agenda?: string;

  @ApiPropertyOptional({ enum: MeetingVisibility, default: MeetingVisibility.PRIVATE })
  @IsOptional()
  @IsEnum(MeetingVisibility)
  visibility?: MeetingVisibility;
}
