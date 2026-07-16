import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ChatRoomType, ChatVisibility } from '../../../common/enums';

export class CreateChatRoomDto {
  @ApiProperty({ enum: ChatRoomType, default: ChatRoomType.GROUP })
  @IsEnum(ChatRoomType)
  type: ChatRoomType;

  @ApiPropertyOptional({ enum: ChatVisibility, default: ChatVisibility.MEMBERS_ONLY })
  @IsOptional()
  @IsEnum(ChatVisibility)
  visibility?: ChatVisibility;

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

  @ApiPropertyOptional({ description: 'Public user ID alternative for opening a direct room' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  targetPublicId?: string;

  @ApiPropertyOptional({ description: 'Initial member IDs for group/project rooms (excluding creator)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];
}
