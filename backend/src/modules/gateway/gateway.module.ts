import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsGateway } from './events.gateway';
import { ChatModule } from '../chat/chat.module';
import { ModerationModule } from '../moderation/moderation.module';
import { MeetingsModule } from '../meetings/meetings.module';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { ChatMember } from '../../database/entities/chat-member.entity';

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
    // MeetingsModule -> NotificationsModule -> GatewayModule closes a cycle,
    // so this edge must be wrapped in forwardRef() to defer resolution.
    forwardRef(() => MeetingsModule),
    TypeOrmModule.forFeature([WorkspaceMember, ChatMember]),
  ],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class GatewayModule {}