import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyEmailDto {
  @ApiProperty({
    description: 'Opaque token returned by /auth/register or /auth/resend-verification. Scopes the code lookup to this specific verification attempt.',
  })
  @IsString()
  @Length(32, 128)
  verifyToken: string;

  @ApiProperty({ example: '123456', description: '6-digit verification code sent by email' })
  @Transform(({ value }) => value?.toString())
  @IsString()
  @Length(6, 6)
  code: string;
}
