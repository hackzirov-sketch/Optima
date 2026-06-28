import { IsOptional, IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class SetPasswordDto {
  @ApiProperty({
    description: 'New password for the account',
    example: 'strongPassword123!',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character',
  })
  password: string;

  @ApiPropertyOptional({
    description: 'One-time token for setting password without JWT',
  })
  @IsString()
  @IsOptional()
  setupToken?: string;
}
