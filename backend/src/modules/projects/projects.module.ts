import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMembersService } from './project-members.service';
import { Project } from '../../database/entities/project.entity';
import { ProjectColumn } from '../../database/entities/project-column.entity';
import { ProjectMember } from '../../database/entities/project-member.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { GroupMember } from '../../database/entities/group-member.entity';
import { User } from '../../database/entities/user.entity';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectColumn,
      ProjectMember,
      WorkspaceMember,
      GroupMember,
      User,
    ]),
    ModerationModule,
    NotificationsModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectMembersService],
  exports: [ProjectsService, ProjectMembersService],
})
export class ProjectsModule {}
