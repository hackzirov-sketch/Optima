import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyResetOtpDto {
  @ApiProperty({ description: 'Reset token returned by the forgot-password endpoint' })
  @IsString()
  @IsNotEmpty()
  resetToken: string;

  @ApiProperty({ description: '6-digit OTP code sent to the user email', example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}
