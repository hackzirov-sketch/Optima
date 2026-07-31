import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsDateString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsEnum,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import {
  MeetingStatus,
  MeetingJoinPolicy,
} from '../../../common/enums/meeting.enum';
import { RoomScope } from '../../../common/enums';

export class UpdateMeetingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({ enum: MeetingStatus })
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ enum: RoomScope })
  @IsOptional()
  @IsEnum(RoomScope)
  scope?: RoomScope;

  @ApiPropertyOptional({ enum: MeetingJoinPolicy })
  @IsOptional()
  @IsEnum(MeetingJoinPolicy)
  joinPolicy?: MeetingJoinPolicy;
}
