import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'One-time reset token from email link' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: 'newStrongPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
