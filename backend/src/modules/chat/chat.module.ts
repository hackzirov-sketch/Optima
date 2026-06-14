import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatRoom } from '../../database/entities/chat-room.entity';
import { ChatMember } from '../../database/entities/chat-member.entity';
import { ChatMessage } from '../../database/entities/chat-message.entity';
import { ChatReaction } from '../../database/entities/chat-reaction.entity';
import { Group } from '../../database/entities/group.entity';
import { Project } from '../../database/entities/project.entity';
import { WorkspacesModule } from '../workspaces/workspaces.module';

import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatRoom, ChatMember, ChatMessage, ChatReaction, Group, Project]),
    WorkspacesModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
