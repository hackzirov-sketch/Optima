import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsNotEmpty,
  IsString,
  IsInt,
  Min,
  IsOptional,
} from 'class-validator';

export class SubmitPushDto {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  taskId: string;

  @ApiProperty({
    required: false,
    description: 'Omit to submit as a draft push (no repository linked yet)',
  })
  @IsUUID()
  @IsOptional()
  repositoryId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  branchName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  commitMessage: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  commitSha?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  commitsCount: number;

  @ApiProperty({ description: 'Base64 encoded diff bundle' })
  @IsString()
  @IsNotEmpty()
  diffBundleBase64: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  cliVersion?: string;
}
