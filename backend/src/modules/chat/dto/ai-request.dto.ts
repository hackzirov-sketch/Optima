import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AiHistoryItemDto {
  @IsIn(['user', 'model']) role!: 'user' | 'model';
  @IsString() @MaxLength(4000) text!: string;
}

export class AiRequestDto {
  @IsString() @MaxLength(6000) message!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AiHistoryItemDto)
  history?: AiHistoryItemDto[];
  /** Continue this saved conversation (history then comes from the server). */
  @IsOptional() @IsUUID() conversationId?: string;
  /** A one-off helper call (e.g. the composer's "write with AI") — not saved. */
  @IsOptional() @IsBoolean() ephemeral?: boolean;
}
