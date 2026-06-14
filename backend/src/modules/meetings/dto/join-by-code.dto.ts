import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class JoinByCodeDto {
  @ApiProperty({ example: 'UPZ-ABC123' })
  @IsString()
  @Length(3, 20)
  code: string;
}
