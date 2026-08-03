import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class PresignAttachmentDto {
  @ApiProperty({ description: 'Original file name, e.g. "photo.jpg"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileName: string;

  @ApiProperty({
    description:
      'MIME type, e.g. "image/jpeg", "audio/ogg", "application/vnd.android.package-archive"',
  })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty({ description: 'File size in bytes' })
  @IsInt()
  @IsPositive()
  fileSize: number;
}
