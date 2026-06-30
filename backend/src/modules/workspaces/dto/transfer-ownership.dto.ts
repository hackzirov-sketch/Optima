import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TransferOwnershipDto {
  @ApiProperty({ description: 'userId of the existing member who will become the new OWNER' })
  @IsUUID()
  newOwnerUserId: string;
}
