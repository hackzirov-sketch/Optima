import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from '../services/users.service';
import { StorageService } from '../../storage/storage.service';
import { Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../../database/entities/user.entity';
import { UpdateProfileDto } from '../schemas/update-profile.schema';
import { UpdateSettingsDto } from '../schemas/update-settings.schema';
import { UpdateAvatarDto } from '../schemas/update-avatar.schema';
import { UpdateBackgroundDto } from '../schemas/update-background.schema';
import { Public } from '../../../common/decorators/public.decorator';

const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const ALLOWED_BACKGROUND_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private storageService: StorageService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile with groups' })
  getMe(@CurrentUser('id') userId: string) {
    return this.usersService.findByIdWithRelations(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateProfile(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Patch('me/settings')
  @ApiOperation({ summary: 'Update current user settings' })
  updateSettings(@CurrentUser() user: User, @Body() dto: UpdateSettingsDto) {
    return this.usersService.updateSettings(user.id, dto);
  }

  @Patch('me/avatar')
  @ApiOperation({ summary: 'Update current user avatar URL' })
  updateAvatar(@CurrentUser() user: User, @Body() dto: UpdateAvatarDto) {
    return this.usersService.updateAvatar(user.id, dto.avatarUrl);
  }

  @Post('me/avatar/upload')
  @ApiOperation({ summary: 'Upload current user avatar through the API' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const mimeType = file?.mimetype?.split(';')[0];
    if (
      !file?.buffer ||
      !mimeType ||
      !ALLOWED_AVATAR_MIME_TYPES.has(mimeType)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'A valid image (jpeg, png, webp, gif) is required',
      });
    }
    const result = await this.storageService.uploadAvatar(
      file.buffer,
      userId,
      mimeType,
    );
    return this.usersService.updateAvatar(userId, result.storageUrl);
  }

  @Patch('me/background')
  @ApiOperation({
    summary: 'Update current user profile-level chat background URL',
  })
  updateBackground(
    @CurrentUser() user: User,
    @Body() dto: UpdateBackgroundDto,
  ) {
    return this.usersService.updateBackground(user.id, dto.backgroundUrl);
  }

  @Post('me/background/upload')
  @ApiOperation({
    summary:
      'Upload current user profile-level chat background through the API',
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 8 * 1024 * 1024 } }),
  )
  async uploadBackground(
    @CurrentUser('id') userId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ) {
    const mimeType = file?.mimetype?.split(';')[0];
    if (
      !file?.buffer ||
      !mimeType ||
      !ALLOWED_BACKGROUND_MIME_TYPES.has(mimeType)
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'A valid image (jpeg, png, webp, gif) is required',
      });
    }
    const result = await this.storageService.uploadBackground(
      file.buffer,
      userId,
      mimeType,
    );
    return this.usersService.updateBackground(userId, result.storageUrl);
  }

  @Delete('me/background')
  @ApiOperation({
    summary: 'Remove current user profile-level chat background',
  })
  removeBackground(@CurrentUser('id') userId: string) {
    return this.usersService.updateBackground(userId, null);
  }

  @Patch('me/account-visibility')
  @ApiOperation({
    summary:
      'Set account visibility (public: searchable; private: only via exact @username/public_id)',
  })
  updateAccountVisibility(
    @CurrentUser('id') userId: string,
    @Body('visibility') visibility: string,
  ) {
    if (visibility !== 'public' && visibility !== 'private') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'visibility must be "public" or "private"',
      });
    }
    return this.usersService.updateAccountVisibility(userId, visibility);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users (global) - minimal public fields' })
  async searchUsers(@Query('q') q: string, @Query('limit') limitStr?: string) {
    const limit = Math.min(50, Number(limitStr) || 20);
    if (!q || q.trim().length < 2) return { data: [] };
    const rows = await this.usersService.searchPublic(q.trim(), limit);
    return { data: rows };
  }

  @Get('profile/:identifier')
  @Public()
  @ApiOperation({
    summary:
      'Get public profile by username or public user ID (ported from main)',
  })
  getPublicProfile(@Param('identifier') identifier: string) {
    return this.usersService.findPublic(identifier);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user public profile by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findPublicById(id);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete current user account' })
  async deleteMe(@CurrentUser() user: User) {
    await this.usersService.softDeleteAccount(user.id);
  }
}
