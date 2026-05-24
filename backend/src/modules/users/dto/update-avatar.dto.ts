import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, MaxLength } from 'class-validator';

export class UpdateAvatarDto {
  @ApiProperty({ example: `${process.env.R2_PUBLIC_URL || 'https://cdn.upz.dev'}/avatars/uuid.jpg` })
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  avatarUrl: string;
}
