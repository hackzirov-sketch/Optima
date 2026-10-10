import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { GroupsModule } from '../groups/groups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ModerationModule } from '../moderation/moderation.module';
import { StorageModule } from '../storage/storage.module';
import { GatewayModule } from '../gateway/gateway.module';
import {
  MEETING_RECORDING_QUEUE,
  MEETING_LIFECYCLE_QUEUE,
} from './meetings.constants';
import { MeetingsService } from './meetings.service';
import { MeetingsController } from './meetings.controller';
import { MeetingsRepository } from './repositories/meetings.repository';
import { MeetingAccessService } from './services/meeting-access.service';
import { MeetingRecordingService } from './services/meeting-recording.service';
import { MeetingJoinRequestService } from './services/meeting-join-request.service';
import { MeetingLiveKitService } from './services/meeting-livekit.service';
import { MeetingRecordingProcessor } from './processors/meeting-recording.processor';
import { MeetingLifecycleProcessor } from './processors/meeting-lifecycle.processor';
import { MeetingRetentionSweepService } from './services/meeting-retention-sweep.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: MEETING_RECORDING_QUEUE },
      { name: MEETING_LIFECYCLE_QUEUE },
    ),
    forwardRef(() => GroupsModule),
    ModerationModule,
    StorageModule,
    // GroupsModule -> NotificationsModule -> GatewayModule -> MeetingsModule
    // -> NotificationsModule closes a cycle; forwardRef required here too.
    forwardRef(() => NotificationsModule),
    // MeetingsController now injects EventsGateway directly (to broadcast
    // recording start/stop) -> same cycle through a different edge ->
    // forwardRef required here as well.
    forwardRef(() => GatewayModule),
  ],
  controllers: [MeetingsController],
  providers: [
    MeetingsService,
    MeetingsRepository,
    MeetingAccessService,
    MeetingRecordingService,
    MeetingJoinRequestService,
    MeetingLiveKitService,
    MeetingRecordingProcessor,
    MeetingLifecycleProcessor,
    MeetingRetentionSweepService,
  ],
  exports: [MeetingsService],
})
export class MeetingsModule {}
