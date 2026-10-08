import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ChatRoomType, RoomScope } from '../../../common/enums';

export class CreateChatRoomDto {
  @ApiProperty({ enum: ChatRoomType, default: ChatRoomType.GROUP })
  @IsEnum(ChatRoomType)
  type: ChatRoomType;

  @ApiPropertyOptional({
    enum: RoomScope,
    default: RoomScope.GROUP_ONLY,
    description:
      'group_only requires a group; private/public may be created without one',
  })
  @IsOptional()
  @IsEnum(RoomScope)
  scope?: RoomScope;

  @ApiPropertyOptional({ description: 'Required for group and channel rooms' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ description: 'Group/channel description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({
    description: 'Required for direct (DM) rooms — the other participant',
  })
  @IsOptional()
  @IsUUID()
  targetUserId?: string;

  @ApiPropertyOptional({
    description: 'Public user ID alternative for opening a direct room',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  targetPublicId?: string;

  @ApiPropertyOptional({
    description:
      'Initial member IDs for group/project rooms (excluding creator)',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  memberIds?: string[];
}
