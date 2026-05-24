import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { WorkspaceVisibility } from '../../../common/enums';

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'My Company' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'my-company' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  slug: string;

  @ApiProperty({ example: 'A brief description', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: WorkspaceVisibility,
    default: WorkspaceVisibility.PRIVATE,
    required: false,
  })
  @IsOptional()
  @IsEnum(WorkspaceVisibility)
  visibility?: WorkspaceVisibility;

  @ApiProperty({ example: 10, required: false, description: 'Maximum number of members allowed in the workspace' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxMembers?: number;

  @ApiProperty({ example: 20, required: false, description: 'Maximum number of projects allowed in the workspace' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxProjects?: number;
}
