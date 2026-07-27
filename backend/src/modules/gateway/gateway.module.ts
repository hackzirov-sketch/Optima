import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { ChatModule } from '../chat/chat.module';
import { ModerationModule } from '../moderation/moderation.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
      }),
      inject: [ConfigService],
    }),
    ChatModule,
    ModerationModule,
    UsersModule,
    // MeetingsModule -> NotificationsModule -> GatewayModule closes a cycle,
    // so this edge must be wrapped in forwardRef() to defer resolution.
    forwardRef(() => MeetingsModule),
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class GatewayModule {}