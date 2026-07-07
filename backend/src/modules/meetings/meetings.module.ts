import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModerationModule } from '../moderation/moderation.module';
import { StorageModule } from '../storage/storage.module';
import { GatewayModule } from '../gateway/gateway.module';
import { MeetingsService, MEETING_RECORDING_QUEUE } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { MeetingRecordingProcessor } from './processors/meeting-recording.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: MEETING_RECORDING_QUEUE }),
    forwardRef(() => WorkspacesModule),
    ModerationModule,
    StorageModule,
    // WorkspacesModule -> NotificationsModule -> GatewayModule -> MeetingsModule
    // -> NotificationsModule closes a cycle; forwardRef required here too.
    forwardRef(() => NotificationsModule),
    // MeetingsController now injects EventsGateway directly (to broadcast
    // recording start/stop) -> same cycle through a different edge ->
    // forwardRef required here as well.
    forwardRef(() => GatewayModule),
  ],
  controllers: [MeetingsController],
  providers: [MeetingsService, MeetingRecordingProcessor],
  exports: [MeetingsService],
})
export class MeetingsModule {}
