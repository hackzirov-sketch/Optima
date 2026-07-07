import { IsString, IsIn, IsInt, Min, Max } from 'class-validator';

export class PresignRecordingDto {
  @IsString()
  @IsIn(['video/webm', 'video/mp4'])
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(2560 * 1024 * 1024)
  fileSize: number;
}
