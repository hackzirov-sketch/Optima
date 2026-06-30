import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class LinkAndPromotePushDto {
  @ApiProperty({ description: 'Repository to link this draft push to' })
  @IsUUID()
  @IsNotEmpty()
  repositoryId: string;
}
