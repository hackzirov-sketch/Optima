import { ApiProperty } from '@nestjs/swagger';
import { IsUrl, MaxLength, Matches } from 'class-validator';

export class UpdateAvatarDto {
  @ApiProperty({ example: 'https://cdn.upz.dev/avatars/uuid.jpg' })
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  @Matches(
    /^https?:\/\/(cdn\.upz\.dev|localhost(:\d+)?|r2\.upz\.dev)\//,
    { message: 'avatarUrl must be from the authorized CDN domain' },
  )
  avatarUrl!: string;
}