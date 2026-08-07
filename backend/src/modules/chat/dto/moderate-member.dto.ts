import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * A ban is indefinite unless `until` says otherwise — the common case is
 * "not in my room", and a moderator who wants a cooling-off period says so.
 */
export class BanMemberDto {
  @ApiPropertyOptional({
    example: '2026-09-01T00:00:00Z',
    description: 'When the ban lifts. Omit for an indefinite ban.',
  })
  @IsOptional()
  @IsDateString()
  until?: string;
}
