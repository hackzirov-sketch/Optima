import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ProjectMembersService } from './project-members.service';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({

  imports: [ModerationModule, NotificationsModule],
  // controllers: [ProjectsController],
  // providers: [ProjectsService, ProjectMembersService],
  // exports: [ProjectsService, ProjectMembersService],
  providers: [ ProjectsService]
})
export class ProjectsModule {}
