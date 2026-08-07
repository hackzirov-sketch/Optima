import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsUUID,
} from 'class-validator';

/**
 * The invite body used to be read as two bare `@Body('userIds')` /
 * `@Body('emails')` params, which the ValidationPipe never sees: anything at
 * all could arrive. A non-UUID string reached Postgres and came back as an
 * opaque 500 (22P02), and the array had no size limit while the handler runs
 * one INSERT and one notification per entry.
 */
export class InviteMembersDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  userIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsEmail({}, { each: true })
  emails?: string[];
}
