import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetPasswordDto {
  @ApiProperty({ description: 'New password for the account', example: 'strongPassword123' })
  @IsString()
  @MinLength(8)
  password: string;
}
