import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspacesController } from './workspaces.controller';
import { InvitationsController } from './invitations.controller';
import { WorkspacesService } from './workspaces.service';
import { MembersService } from './members.service';
import { InvitationsService } from './invitations.service';
import { Workspace } from '../../database/entities/workspace.entity';
import { WorkspaceMember } from '../../database/entities/workspace-member.entity';
import { WorkspaceInvitation } from '../../database/entities/workspace-invitation.entity';
import { User } from '../../database/entities/user.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace, WorkspaceMember, WorkspaceInvitation, User]),
    UsersModule,
  ],
  controllers: [WorkspacesController, InvitationsController],
  providers: [WorkspacesService, MembersService, InvitationsService],
  exports: [WorkspacesService, MembersService],
})
export class WorkspacesModule {}
