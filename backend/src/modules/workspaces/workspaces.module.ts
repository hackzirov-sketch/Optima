import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspacesController } from './workspaces.controller';
import { InvitationsController } from './invitations.controller';
import { WorkspacesService } from './workspaces.service';
import { MembersService } from './members.service';
import { InvitationsService } from './invitations.service';
import { TagsService } from './tags.service';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { WorkspaceInvitation } from '../../database/entities/workspace-invitation.entity';
import { ChatRoom } from '../../database/entities/chat-room.entity';
import { ChatMember } from '../../database/entities/chat-member.entity';
import { User } from '../../database/entities/user.entity';
import { Tag } from '../../database/entities/tag.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workspace,
      WorkspaceMember,
      WorkspaceInvitation,
      ChatRoom,
      ChatMember,
      User,
      Tag,
    ]),
    UsersModule,
  ],
  controllers: [WorkspacesController, InvitationsController],
  providers: [WorkspacesService, MembersService, InvitationsService, TagsService],
  exports: [WorkspacesService, MembersService, TagsService],
})
export class WorkspacesModule {}
