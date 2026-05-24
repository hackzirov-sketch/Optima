import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Groups')
@ApiBearerAuth('access-token')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new group in a workspace' })
  createGroup(@CurrentUser('id') userId: string, @Body() dto: CreateGroupDto) {
    return this.groupsService.create(userId, dto);
  }

  @Get('workspace/:workspaceId')
  @ApiOperation({ summary: 'Get all groups in a workspace' })
  getWorkspaceGroups(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.groupsService.findAllInWorkspace(workspaceId, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get group details by id' })
  getGroupById(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.groupsService.findById(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update group settings' })
  updateGroup(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(id, userId, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a group' })
  deleteGroup(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.groupsService.remove(id, userId);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to the group' })
  addMember(
    @Param('id') id: string,
    @CurrentUser('id') requesterId: string,
    @Body() dto: AddGroupMemberDto,
  ) {
    return this.groupsService.addMember(id, dto.userId, requesterId);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member from the group' })
  removeMember(
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.groupsService.removeMember(id, targetUserId, requesterId);
  }
}
