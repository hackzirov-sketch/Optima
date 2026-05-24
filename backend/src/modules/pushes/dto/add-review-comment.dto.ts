import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsInt,
} from 'class-validator';

export class AddReviewCommentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  filePath?: string;

  @ApiProperty({ required: false })
  @IsInt()
  @IsOptional()
  lineNumber?: number;

  @ApiProperty({ required: false, description: 'added, removed, context' })
  @IsString()
  @IsOptional()
  lineType?: string;

  @ApiProperty({ required: false, description: 'Thread parent comment UUID' })
  @IsUUID()
  @IsOptional()
  parentId?: string;
}
