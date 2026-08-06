import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ModerationModule } from '../moderation/moderation.module';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

import { ChatController } from './chat.controller';
import { ChatEncryptionService } from './chat-encryption.service';
import { ChatRoomService } from './services/room.service';
import { ChatMessageService } from './services/message.service';
import { ChatMemberService } from './services/member.service';
import { ChatReactionService } from './services/reaction.service';
import { ChatPresenceService } from './services/presence.service';
import { ChatAiService } from './services/ai.service';
import { ChatRoomInviteService } from './services/room-invite.service';
import { ChatProcessor } from './workers/chat.processor';
import { CommunityService } from './services/community.service';
import { ChannelSettingsService } from './services/channel-settings.service';
import { MessageViewService } from './services/message-view.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'chat' }),
    forwardRef(() => WorkspacesModule),
    ModerationModule,
    StorageModule,
    UsersModule,
    // ChatProcessor turns @mentions into notifications.
    NotificationsModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatEncryptionService,
    ChatRoomService,
    ChatMessageService,
    ChatMemberService,
    ChatReactionService,
    ChatPresenceService,
    ChatAiService,
    ChatRoomInviteService,
    CommunityService,
    ChannelSettingsService,
    MessageViewService,
    ChatProcessor,
    CommunityService,
  ],
  exports: [
    ChatEncryptionService,
    ChatRoomService,
    ChatMessageService,
    ChatMemberService,
    ChatReactionService,
    ChatPresenceService,
    ChatRoomInviteService,
    ChatAiService,
    ChannelSettingsService,
    MessageViewService,
  ],
})
export class ChatModule {}
