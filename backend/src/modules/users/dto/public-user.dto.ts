import { ApiProperty } from '@nestjs/swagger';

export class PublicUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  publicId: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  username: string | null;

  @ApiProperty({ nullable: true })
  avatarUrl: string | null;

  @ApiProperty({ nullable: true })
  lastSeen: Date | null;
}
