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
import { RoomScope } from '../../../common/enums';
import { MeetingJoinPolicy } from '../../../common/enums/meeting.enum';
import { SFU_MAX_PARTICIPANTS } from '../meetings.constants';

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

  @ApiPropertyOptional({ enum: RoomScope, default: RoomScope.GROUP_ONLY })
  @IsOptional()
  @IsEnum(RoomScope)
  scope?: RoomScope;

  @ApiPropertyOptional({
    enum: MeetingJoinPolicy,
    description:
      'AUTO joins instantly once visibility allows it; REQUEST_APPROVAL puts the ' +
      'user in a waiting room until the host/co-host accepts. Defaults to REQUEST_APPROVAL ' +
      'for PRIVATE meetings and AUTO for everything else.',
  })
  @IsOptional()
  @IsEnum(MeetingJoinPolicy)
  joinPolicy?: MeetingJoinPolicy;
}
