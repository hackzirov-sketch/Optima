import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RoomScope } from '../../../common/enums';

export const BACKGROUND_TYPES = [
  'DEFAULT',
  'IMAGE',
  'COLOR',
  'GRADIENT',
  'PATTERN',
] as const;
export type BackgroundType = (typeof BACKGROUND_TYPES)[number];

/**
 * Identity and appearance of a room — name, description, avatar, wallpaper,
 * slug, visibility.
 *
 * Distinct from UpdateChannelSettingsDto, which covers the rules a room runs
 * by (who may post, slow mode, filters). The two used to share the exact same
 * route (`PATCH /chat/rooms/:roomId/settings`), and since Express hands a
 * duplicated path to whichever handler registered first, this half was
 * unreachable: every rename, avatar or wallpaper change was validated against
 * the *channel settings* DTO and rejected by `forbidNonWhitelisted`. It now
 * lives on `PATCH /chat/rooms/:roomId`, the room resource itself.
 *
 * Declared as a class, not an inline body type, so the global ValidationPipe
 * actually inspects it — an inline type erases to `Object` and is skipped.
 */
export class UpdateRoomSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  avatarUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  backgroundUrl?: string | null;

  @ApiPropertyOptional({ enum: BACKGROUND_TYPES })
  @IsOptional()
  @IsIn([...BACKGROUND_TYPES])
  backgroundType?: BackgroundType;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(60)
  slug?: string | null;

  @ApiPropertyOptional({ enum: RoomScope })
  @IsOptional()
  @IsEnum(RoomScope)
  scope?: RoomScope;
}
