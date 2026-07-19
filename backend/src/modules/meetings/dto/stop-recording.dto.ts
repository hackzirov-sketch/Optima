import { IsString, IsInt, Min, IsOptional } from 'class-validator';

export class StopRecordingDto {
  @IsOptional()
  @IsString()
  storageKey?: string;

  @IsOptional()
  @IsString()
  storageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  fileSize?: number;
}
