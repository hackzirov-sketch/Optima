import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project } from '../../database/entities/project.entity';
import { ProjectColumn } from '../../database/entities/project-column.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { GroupMember } from '../../database/entities/group-member.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectColumn,
      WorkspaceMember,
      GroupMember,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
