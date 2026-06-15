import {
  Controller,
  Post,
  Delete,
  Body,
  Query,
  BadRequestException,
  ForbiddenException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiBody,
  ApiQuery,
  ApiResponse,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import { IsString, IsIn, IsOptional, IsMimeType } from 'class-validator';
import { StorageService, UploadFolder } from './storage.service';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const ALLOWED_FOLDERS: UploadFolder[] = ['avatars', 'attachments', 'workspace'];

// ─── Request DTOs ──────────────────────────────────────────────────────────

class SignUploadDto {
  @ApiProperty({
    description: 'Upload destination folder',
    enum: ['avatars', 'attachments', 'workspace'],
    example: 'avatars',
  })
  @IsString()
  @IsIn(ALLOWED_FOLDERS, { message: `folder must be one of: ${ALLOWED_FOLDERS.join(', ')}` })
  folder!: string;

  @ApiPropertyOptional({
    description: 'MIME type of the file — used for server-side type validation',
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsMimeType()
  mimeType?: string;
}

// ─── Response schemas (for Swagger only) ──────────────────────────────────

class CloudinarySignResponse {
  @ApiProperty({ example: 'abc123def456...' })
  signature!: string;

  @ApiProperty({ example: 1718000000 })
  timestamp!: number;

  @ApiProperty({ example: '174634761223157' })
  apiKey!: string;

  @ApiProperty({ example: 'dw6nubee9' })
  cloudName!: string;

  @ApiProperty({ example: 'upz/avatars' })
  folder!: string;

  @ApiProperty({ example: 'upz/avatars/user-uuid/file-uuid' })
  publicId!: string;

  @ApiProperty({
    description: 'Maximum allowed file size in bytes',
    example: 5242880,
  })
  maxBytes!: number;
}

class SignUploadResponseWrapper {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: CloudinarySignResponse })
  data!: CloudinarySignResponse;
}

class DeleteFileResponse {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ example: { deleted: true } })
  data!: { deleted: boolean };
}

// ─── Controller ────────────────────────────────────────────────────────────

@ApiTags('Storage')
@ApiBearerAuth('access-token')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  /**
   * POST /storage/sign
   *
   * Upload flow (3 steps):
   *  1. Frontend calls this endpoint to get signed params
   *  2. Frontend POSTs the file directly to Cloudinary using the params
   *  3. Frontend saves the returned `secure_url` via the relevant resource
   *     endpoint (e.g. PATCH /users/me/avatar, POST /chat/rooms/:id/messages)
   */
  @Post('sign')
  @ApiOperation({
    summary: 'Get Cloudinary signed upload params',
    description: `
Returns a signed envelope so the browser can upload **directly to Cloudinary**
without exposing the API secret on the client.

**Upload flow:**
\`\`\`
1. POST /storage/sign  { folder, mimeType? }
   ← { signature, timestamp, apiKey, cloudName, folder, publicId, maxBytes }

2. POST https://api.cloudinary.com/v1_1/{cloudName}/auto/upload
   FormData: file + api_key + timestamp + signature + folder + public_id
   ← { secure_url, public_id, ... }

3. PATCH /users/me/avatar          { avatarUrl: secure_url }
   POST  /chat/rooms/:id/messages  { content, attachmentUrl: secure_url }
\`\`\`

**Allowed folders and limits:**
| folder      | max size | allowed types            |
|-------------|----------|--------------------------|
| avatars     | 5 MB     | image/jpeg, png, webp, gif |
| workspace   | 5 MB     | image/jpeg, png, webp    |
| attachments | 20 MB    | any                      |
    `.trim(),
  })
  @ApiBody({ type: SignUploadDto })
  @ApiResponse({
    status: 201,
    description: 'Signed upload params returned successfully',
    type: SignUploadResponseWrapper,
  })
  @ApiResponse({ status: 400, description: 'Invalid folder or disallowed MIME type' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  sign(
    @CurrentUser('id') userId: string,
    @Body() dto: SignUploadDto,
  ) {
    const result = this.storageService.signUpload(dto.folder as UploadFolder, userId, dto.mimeType);

    return {
      ...result,
      maxBytes: this.storageService.getMaxBytes(dto.folder as UploadFolder),
    };
  }

  /**
   * DELETE /storage/file?publicId=...
   *
   * Remove a Cloudinary asset. Call this when a user:
   *  - replaces their avatar (delete old one first)
   *  - deletes a chat attachment
   */
  @Delete('file')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a Cloudinary file',
    description:
      'Removes a Cloudinary asset by `public_id`. ' +
      'Call this before replacing an existing avatar or when an attachment is removed.',
  })
  @ApiQuery({
    name: 'publicId',
    required: true,
    description: 'Cloudinary public_id of the asset to delete',
    example: 'upz/avatars/user-uuid/file-uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'File deleted successfully',
    type: DeleteFileResponse,
  })
  @ApiResponse({ status: 400, description: 'publicId is required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteFile(
    @Query('publicId') publicId: string,
    @CurrentUser('id') userId: string,
  ) {
    if (!publicId) throw new BadRequestException({ code: ErrorCode.STORAGE_PUBLIC_ID_REQUIRED, message: 'publicId is required' });
    const segments = publicId.split('/');
    if (!segments.includes(userId)) {
      throw new ForbiddenException({ code: ErrorCode.INSUFFICIENT_PERMISSIONS, message: 'You can only delete your own files' });
    }
    await this.storageService.deleteCloudinaryFile(publicId);
    return { deleted: true };
  }
}
