import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import {
  ReminderProcessor,
  REMINDER_QUEUE,
} from './processors/reminder.processor';
import { TelegramChannelService } from './channels/telegram-channel.service';
import { SmsChannelService } from './channels/sms-channel.service';

import { GatewayModule } from '../gateway/gateway.module';
import { MailModule } from '../mail/mail.module';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: REMINDER_QUEUE }),
    // GatewayModule -> ... -> MeetingsModule -> GroupsModule ->
    // NotificationsModule -> GatewayModule closes a cycle now that
    // GatewayModule also depends on MeetingsModule. forwardRef() is
    // required on BOTH ends of the edge that closes the loop — it was
    // only added on the GatewayModule side before, which isn't enough;
    // Nest still eagerly resolves this edge and throws
    // UndefinedModuleException. Adding it here too fixes it.
    forwardRef(() => GatewayModule),
    MailModule,
    RedisModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDispatcherService,
    ReminderSchedulerService,
    ReminderProcessor,
    TelegramChannelService,
    SmsChannelService,
  ],
  exports: [
    NotificationsService,
    NotificationDispatcherService,
    ReminderSchedulerService,
  ],
})
export class NotificationsModule {}
