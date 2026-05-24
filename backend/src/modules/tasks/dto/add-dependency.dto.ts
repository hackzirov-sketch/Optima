import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { DependencyType } from '../../../common/enums';

export class AddDependencyDto {
  @ApiProperty({ description: 'The task this task depends on' })
  @IsUUID()
  @IsNotEmpty()
  dependsOnId: string;

  @ApiProperty({
    enum: DependencyType,
    default: DependencyType.BLOCKS,
    required: false,
  })
  @IsOptional()
  @IsEnum(DependencyType)
  type?: DependencyType = DependencyType.BLOCKS;
}
