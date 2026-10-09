import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { E2eeEnvelopeDto } from './e2ee.dto';

/** Exactly one of the two: `content` in public rooms, `e2ee` in E2EE rooms. */
export class UpdateMessageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => E2eeEnvelopeDto)
  e2ee?: E2eeEnvelopeDto;
}
