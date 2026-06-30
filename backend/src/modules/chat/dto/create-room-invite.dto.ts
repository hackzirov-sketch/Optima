import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateRoomInviteDto {
  @ApiPropertyOptional({ description: 'Maximum number of times this invite can be used. Omit for unlimited.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUses?: number;

  @ApiPropertyOptional({ description: 'Invite expires this many hours from now. Omit for no expiry.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 365)
  expiresInHours?: number;
}
