import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AiHistoryItemDto {
  @IsIn(['user', 'model']) role!: 'user' | 'model';
  @IsString() @MaxLength(4000) text!: string;
}

export class AiRequestDto {
  @IsString() @MaxLength(6000) message!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AiHistoryItemDto)
  history?: AiHistoryItemDto[];
}
