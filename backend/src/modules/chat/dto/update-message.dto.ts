import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class UpdateMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(20000)
  content: string;
}
