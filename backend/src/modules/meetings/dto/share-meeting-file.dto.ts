import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  Max,
  MaxLength,
} from 'class-validator';

export class PresignMeetingFileDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  mimeType: string;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  @Max(100 * 1024 * 1024)
  fileSize: number;
}

export class ShareMeetingFileDto extends PresignMeetingFileDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  storageKey: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  storageUrl: string;
}
