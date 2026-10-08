import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  Max,
  ValidateIf,
} from 'class-validator';
import {
  AUDIENCES,
  COMMENT_AUDIENCES,
} from '../services/channel-settings.service';
// `import type` is required: emitDecoratorMetadata would otherwise emit a
// runtime reference to a type-only export and fail under isolatedModules.
import type {
  Audience,
  CommentAudience,
} from '../services/channel-settings.service';

/**
 * Every field optional: the settings dialog PATCHes whichever section the user
 * touched, and the service diffs against the stored row so an absent field and
 * an unchanged field cost the same (nothing).
 *
 * Declared as a class rather than an inline type so the global ValidationPipe
 * actually inspects it — `forbidNonWhitelisted` then rejects unknown keys,
 * which is what keeps a typo'd setting from silently doing nothing.
 */
export class UpdateChannelSettingsDto {
  // ── Asosiy ────────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8)
  language?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  category?: string | null;

  // ── Maxfiylik ─────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() discoverable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowInviteLinks?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  joinRequiresApproval?: boolean;

  // ── Ruxsatlar ─────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ enum: AUDIENCES })
  @IsOptional()
  @IsIn([...AUDIENCES])
  whoCanPost?: Audience;

  @ApiPropertyOptional({ enum: COMMENT_AUDIENCES })
  @IsOptional()
  @IsIn([...COMMENT_AUDIENCES])
  whoCanComment?: CommentAudience;

  @ApiPropertyOptional({ enum: AUDIENCES })
  @IsOptional()
  @IsIn([...AUDIENCES])
  whoCanUploadFiles?: Audience;

  @ApiPropertyOptional({ enum: AUDIENCES })
  @IsOptional()
  @IsIn([...AUDIENCES])
  whoCanSendVoice?: Audience;

  @ApiPropertyOptional({ enum: AUDIENCES })
  @IsOptional()
  @IsIn([...AUDIENCES])
  whoCanSendMedia?: Audience;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() reactionsEnabled?: boolean;

  // ── Moderatsiya ───────────────────────────────────────────────────────────
  @ApiPropertyOptional({ description: 'null disables auto-delete' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(365)
  autoDeleteDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  slowModeSeconds?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() spamFilter?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() linkFilter?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() badWordsFilter?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  badWords?: string[];

  // ── Notification ──────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  defaultNotifications?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  mentionNotifications?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  eventNotifications?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  // ── Kontent ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  pinnedMessageId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  welcomeMessage?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  rules?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  faq?: string | null;

  // ── Files ─────────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  maxUploadBytes?: number | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedFileTypes?: string[];

  // ── Security ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireAdmin2fa?: boolean;

  // ── Meeting ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowMeetings?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowLiveStream?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowScreenShare?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowRecording?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowMeetingChat?: boolean;

  // ── AI ────────────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiModeration?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiSummary?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiTags?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiTranslate?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() aiSpamDetect?: boolean;

  // ── Education / Group / Community ─────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  courseId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  playlistId?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackProgress?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  linkedProjectId?: string | null;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoPostTasks?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isVerified?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) minReputation?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  joinQuestions?: string[];

  // ── Integrations ──────────────────────────────────────────────────────────
  @ApiPropertyOptional({
    description: 'Per-provider config, keyed by provider',
  })
  @IsOptional()
  @IsObject()
  integrations?: Record<string, unknown>;
}

export class SetMemberRoleDto {
  @ApiProperty({ enum: ['admin', 'moderator', 'member'] })
  @IsIn(['admin', 'moderator', 'member'])
  role!: 'admin' | 'moderator' | 'member';
}

export class TransferOwnershipDto {
  @ApiProperty({ description: 'The member who becomes the new owner' })
  @IsUUID()
  userId!: string;
}

/**
 * A batch of messages the caller has seen. Bounded because the client sends
 * whatever scrolled past — an unbounded array would be an unbounded query.
 */
export class RecordViewsDto {
  @ApiProperty({ type: [String], maxItems: 200 })
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  messageIds!: string[];
}
