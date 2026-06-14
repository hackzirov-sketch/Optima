import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ChatRoomType } from '../../../common/enums';

export class CreateChatRoomDto {
  @ApiProperty({ enum: ChatRoomType, default: ChatRoomType.GROUP })
  @IsEnum(ChatRoomType)
  type: ChatRoomType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Required for direct (DM) rooms — the other participant' })
  @IsOptional()
  @IsUUID()
  targetUserId?: string;
}
