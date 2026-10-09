import { forwardRef, Module } from '@nestjs/common';
import { GroupsController } from './controllers/groups.controller';
import { InvitationsController } from './controllers/invitations.controller';
import { GroupsService } from './services/groups.service';
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
    // NotificationsModule -> GatewayModule -> ChatModule -> GroupsModule ->
    // NotificationsModule closes a cycle; without forwardRef() this import
    // is undefined at scan time and Nest throws UndefinedModuleException.
    forwardRef(() => NotificationsModule),
    AuthModule,
  ],
  controllers: [GroupsController, InvitationsController],
  providers: [GroupsService, MembersService, InvitationsService, TagsService],
  exports: [GroupsService, MembersService, TagsService],
})
export class GroupsModule {}
