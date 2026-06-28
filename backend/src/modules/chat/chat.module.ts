import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { ChatRoom } from '../../database/entities/chat-room.entity';
import { ChatMember } from '../../database/entities/chat-member.entity';
import { ChatMessage } from '../../database/entities/chat-message.entity';
import { ChatReaction } from '../../database/entities/chat-reaction.entity';
import { Group } from '../../database/entities/group.entity';
import { Project } from '../../database/entities/project.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ModerationModule } from '../moderation/moderation.module';
import { StorageModule } from '../storage/storage.module';

import { ChatController } from './chat.controller';
import { ChatEncryptionService } from './chat-encryption.service';
import { ChatRoomService } from './services/room.service';
import { ChatMessageService } from './services/message.service';
import { ChatMemberService } from './services/member.service';
import { ChatReactionService } from './services/reaction.service';
import { ChatPresenceService } from './services/presence.service';
import { ChatAiService } from './services/ai.service';
import { ChatProcessor } from './workers/chat.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatRoom, ChatMember, ChatMessage, ChatReaction, Group, Project]),
    BullModule.registerQueue({ name: 'chat' }),
    forwardRef(() => WorkspacesModule),
    ModerationModule,
    StorageModule,
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
    ChatProcessor,
  ],
  exports: [
    ChatEncryptionService,
    ChatRoomService,
    ChatMessageService,
    ChatMemberService,
    ChatReactionService,
    ChatPresenceService,
  ],
})
export class ChatModule {}
