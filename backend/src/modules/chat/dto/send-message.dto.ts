import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { E2eeEnvelopeDto } from './e2ee.dto';

export class MessageAttachmentInputDto {
  @ApiProperty({
    description: 'R2 object key returned by the presign endpoint',
  })
  @IsString()
  @IsNotEmpty()
  storageKey: string;

  @ApiProperty({ description: 'Public R2 URL of the uploaded file' })
  @IsString()
  @IsNotEmpty()
  storageUrl: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  fileName: string;

  @ApiProperty()
  @IsInt()
  @IsPositive()
  fileSize: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  width?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  height?: number;
}

export class SendMessageDto {
  @ApiPropertyOptional({
    description:
      'Text content. Max 1500 chars. Optional when attachments are present (media-only message).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  content?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  replyToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMessageId?: string;

  @ApiPropertyOptional({
    type: [MessageAttachmentInputDto],
    description:
      'Files already uploaded via /chat/rooms/:roomId/attachments/presign',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MessageAttachmentInputDto)
  attachments?: MessageAttachmentInputDto[];

  @ApiPropertyOptional({
    description:
      'Slack-style thread reply — excluded from the main room timeline, only shown in the thread panel. When true, replyToId must be the thread root message id.',
  })
  @IsOptional()
  @IsBoolean()
  isThreadReply?: boolean;

  @ApiPropertyOptional({
    description:
      'Ciphertext for end-to-end encrypted rooms (DMs, private groups/channels). Mutually exclusive with `content` there; rejected in public rooms.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => E2eeEnvelopeDto)
  e2ee?: E2eeEnvelopeDto;
}
