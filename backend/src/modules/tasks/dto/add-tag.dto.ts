import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class AddTagDto {
  @ApiProperty({ description: 'Tag UUID to add to the task' })
  @IsUUID()
  @IsNotEmpty()
  tagId: string;
}
