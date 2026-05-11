import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ReviewPushDto {
  @ApiProperty({ required: false, description: 'Reason for rejection (if rejecting)' })
  @IsString()
  @IsOptional()
  reason?: string;
}
