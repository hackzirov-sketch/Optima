import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { Group } from '../../database/entities/group.entity';
import { GroupMember } from '../../database/entities/group-member.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Group, GroupMember, WorkspaceMember]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
