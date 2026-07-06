import { Module, forwardRef } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModerationModule } from '../moderation/moderation.module';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';

@Module({
  imports: [
    forwardRef(() => WorkspacesModule),
    ModerationModule,
    // WorkspacesModule -> NotificationsModule -> GatewayModule -> MeetingsModule
    // -> NotificationsModule closes a cycle; forwardRef required here too.
    forwardRef(() => NotificationsModule),
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService],
  exports: [MeetingsService],
})
export class MeetingsModule {}
