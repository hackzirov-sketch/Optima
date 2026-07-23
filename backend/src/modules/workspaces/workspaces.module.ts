import { Module } from '@nestjs/common';
import { WorkspacesController } from './controllers/workspaces.controller';
import { InvitationsController } from './controllers/invitations.controller';
import { WorkspacesService } from './services/workspaces.service';
import { MembersService } from './services/members.service';
import { InvitationsService } from './services/invitations.service';
import { TagsService } from './services/tags.service';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    UsersModule,
    MailModule,
    NotificationsModule,
    AuthModule,
  ],
  controllers: [WorkspacesController, InvitationsController],
  providers: [WorkspacesService, MembersService, InvitationsService, TagsService],
  exports: [WorkspacesService, MembersService, TagsService],
})
export class WorkspacesModule {}
