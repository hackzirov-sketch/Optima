import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class UpdateNotifPrefsDto {
  // ── Meeting ──────────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() meetingSms?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() meetingTelegram?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() meetingEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() meetingInApp?: boolean;

  // ── Task ─────────────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() taskSms?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() taskTelegram?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() taskEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() taskInApp?: boolean;

  // ── Homework ─────────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() homeworkSms?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() homeworkTelegram?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() homeworkEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() homeworkInApp?: boolean;

  // ── Payment ──────────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() paymentSms?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() paymentTelegram?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() paymentEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() paymentInApp?: boolean;

  // ── Security ─────────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() securitySms?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() securityTelegram?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() securityEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() securityInApp?: boolean;

  // ── Course / Certificate / Marketing ─────────────────────────────────────────
  @ApiPropertyOptional() @IsOptional() @IsBoolean() courseTelegram?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() courseInApp?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketingTelegram?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketingEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() marketingInApp?: boolean;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  certificateTelegram?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() certificateEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() certificateInApp?: boolean;

  // ── Quiet Hours ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'quietStart must be HH:MM (e.g. 22:00)' })
  quietStart?: string;

  @ApiPropertyOptional({ example: '07:00' })
  @IsOptional()
  @IsString()
  @Matches(TIME_REGEX, { message: 'quietEnd must be HH:MM (e.g. 07:00)' })
  quietEnd?: string;
}

export class LinkTelegramDto {
  @IsString()
  @ApiPropertyOptional({
    description: 'Telegram chat_id from bot /start command',
  })
  chatId: string;
}
