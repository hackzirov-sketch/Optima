import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  MaxLength,
  Matches,
  IsEnum,
  IsUrl,
} from 'class-validator';
import { UserTheme, UserLanguage, UserOccupation } from '../../../common/enums';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({ example: 'johndoe', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, { message: 'Username can only contain letters, numbers, underscores and hyphens' })
  username?: string | null;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: UserLanguage })
  @IsOptional()
  @IsEnum(UserLanguage)
  language?: UserLanguage;

  @ApiPropertyOptional({ example: 'Asia/Tashkent' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: UserTheme })
  @IsOptional()
  @IsEnum(UserTheme)
  theme?: UserTheme;

  @ApiPropertyOptional({
    example: 998901234567,
    description: 'Phone number (digits only)',
  })
  @IsOptional()
  @IsNumber()
  @Min(10000000000)
  @Max(999999999999999)
  phoneNumber?: number;

  @ApiPropertyOptional({ enum: UserOccupation, description: 'Self-selected profession' })
  @IsOptional()
  @IsEnum(UserOccupation)
  occupation?: UserOccupation;
}
