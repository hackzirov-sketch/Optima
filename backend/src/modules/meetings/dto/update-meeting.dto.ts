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
import { MeetingJoinPolicy } from '../../../common/enums/meeting.enum';
import { RoomScope } from '../../../common/enums';
import { SFU_MAX_PARTICIPANTS } from '../meetings.constants';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(SFU_MAX_PARTICIPANTS)
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

  // ── Host controls: what participants other than hosts may do ──
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowScreenShare?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowReactions?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowMicrophone?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowVideo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowChat?: boolean;
}
