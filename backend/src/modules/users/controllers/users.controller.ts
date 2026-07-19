import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger'
import { UsersService } from '../services/users.service'
import { Query } from '@nestjs/common'
import { CurrentUser } from '../../../common/decorators/current-user.decorator'
import type { User } from '../../../database/entities/user.entity'
import { UpdateProfileDto } from '../schemas/update-profile.schema'
import { UpdateSettingsDto } from '../schemas/update-settings.schema'
import { UpdateAvatarDto } from '../schemas/update-avatar.schema'
import { Public } from '../../../common/decorators/public.decorator'

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) { }

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile with workspaces' })
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findByIdWithRelations(userId)
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto)
  }

  @Patch('me/settings')
  @ApiOperation({ summary: 'Update current user settings' })
  updateSettings(@CurrentUser() user: User, @Body() dto: UpdateSettingsDto) {
    return this.usersService.updateSettings(user.id, dto)
  }

  @Patch('me/avatar')
  @ApiOperation({ summary: 'Update current user avatar URL' })
  updateAvatar(@CurrentUser() user: User, @Body() dto: UpdateAvatarDto) {
    return this.usersService.updateAvatar(user.id, dto.avatarUrl)
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users (global) - minimal public fields' })
  async searchUsers(@Query('q') q: string, @Query('limit') limitStr?: string) {
    const limit = Math.min(50, Number(limitStr) || 20)
    if (!q || q.trim().length < 2) return { data: [] }
    const rows = await this.usersService.searchPublic(q.trim(), limit)
    return { data: rows }
  }

  @Get('profile/:identifier')
  @Public()
  @ApiOperation({ summary: 'Get public profile by username or public user ID (ported from main)' })
  getPublicProfile(@Param('identifier') identifier: string) {
    return this.usersService.findPublic(identifier)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user public profile by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findPublicById(id)
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete current user account' })
  async deleteMe(@CurrentUser() user: User) {
    await this.usersService.softDeleteAccount(user.id)
  }
}
