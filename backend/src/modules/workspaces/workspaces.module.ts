import { Module } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { InvitationsController } from './invitations.controller';
import { WorkspacesService } from './workspaces.service';
import { MembersService } from './members.service';
import { InvitationsService } from './invitations.service';
import { TagsService } from './tags.service';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    UsersModule,
    MailModule,
    NotificationsModule,
  ],
  controllers: [WorkspacesController, InvitationsController],
  providers: [WorkspacesService, MembersService, InvitationsService, TagsService],
  exports: [WorkspacesService, MembersService, TagsService],
})
export class WorkspacesModule {}
