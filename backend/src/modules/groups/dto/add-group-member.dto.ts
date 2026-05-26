import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, IsEnum, IsOptional } from 'class-validator';
import { WorkspaceRole } from '../../../common/enums';

export class AddGroupMemberDto {
  @ApiProperty({ example: 'd290f1ee-6c54-4b01-90e6-d701748f0851' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: WorkspaceRole, default: WorkspaceRole.JUNIOR, required: false })
  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;
}
