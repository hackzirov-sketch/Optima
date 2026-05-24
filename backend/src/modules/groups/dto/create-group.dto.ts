import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsEnum,
} from 'class-validator';
import { GroupType } from '../../../common/enums';

export class CreateGroupDto {
  @ApiProperty({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  @IsUUID()
  @IsNotEmpty()
  workspaceId: string;

  @ApiProperty({ example: 'Backend Team' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Backend developers of UPZ', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'backend-team' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ enum: GroupType, default: GroupType.GENERAL, required: false })
  @IsOptional()
  @IsEnum(GroupType)
  type?: GroupType;
}
