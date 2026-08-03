import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

@Injectable()
export class TelegramChannelService {
  private readonly logger = new Logger(TelegramChannelService.name);
  private readonly botToken: string | null;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN') ?? null;
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  get isEnabled(): boolean {
    return !!this.botToken;
  }

  async send(
    chatId: string,
    text: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML',
  ): Promise<TelegramSendResult> {
    if (!this.isEnabled) {
      return { success: false, error: 'Telegram bot not configured' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const data = await res.json();

      if (!data.ok) {
        this.logger.warn(
          `Telegram send failed: ${data.description} (chatId=${chatId})`,
        );
        return { success: false, error: data.description };
      }

      return { success: true, messageId: data.result?.message_id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Telegram send error: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /** Check if user has read the message (requires webhook updates tracking) */
  // eslint-disable-next-line @typescript-eslint/require-await
  async getMessageReadStatus(
    _chatId: string,
    _messageId: number,
  ): Promise<boolean> {
    // Telegram doesn't expose read receipts via Bot API.
    // We track this via webhook: when user interacts after a message, mark it read.
    // For now return false — actual tracking is in TelegramWebhookController.
    return false;
  }

  formatMeetingReminder(
    title: string,
    minutesBefore: number,
    meetingUrl?: string,
  ): string {
    const emoji =
      minutesBefore <= 10 ? '🔴' : minutesBefore <= 60 ? '🟡' : '📅';
    const timeLabel =
      minutesBefore >= 60
        ? `${minutesBefore / 60} soat`
        : `${minutesBefore} daqiqa`;

    return [
      `${emoji} <b>Meeting Eslatmasi</b>`,
      ``,
      `📌 <b>${title}</b>`,
      `⏰ ${timeLabel} oldin boshlanadi`,
      meetingUrl ? `🔗 <a href="${meetingUrl}">Meetingga kirish</a>` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  formatTaskReminder(
    taskTitle: string,
    dueDate: Date,
    projectName?: string,
  ): string {
    return [
      `📋 <b>Task Deadline</b>`,
      ``,
      `✅ <b>${taskTitle}</b>`,
      projectName ? `📁 Loyiha: ${projectName}` : '',
      `📅 Deadline: ${dueDate.toLocaleDateString('uz-UZ')}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  formatOtp(otp: string, purpose: 'login' | 'recovery' | '2fa'): string {
    const labels = {
      login: 'Login tasdiqlash',
      recovery: 'Akkaunt tiklash',
      '2fa': 'Ikki bosqichli tasdiqlash',
    };
    return [
      `🔐 <b>${labels[purpose]}</b>`,
      ``,
      `Tasdiqlash kodi: <code>${otp}</code>`,
      ``,
      `⚠️ Bu kod 5 daqiqa amal qiladi.`,
      `Agar siz so'ramagan bo'lsangiz, akkauntingizni himoya qiling.`,
    ].join('\n');
  }

  formatSecurityAlert(event: string, details: string): string {
    return [
      `🚨 <b>Xavfsizlik Ogohlantirishi</b>`,
      ``,
      `⚡ ${event}`,
      `📝 ${details}`,
      ``,
      `Agar bu siz emasligingizni bilsangiz, darhol parolni o'zgartiring.`,
    ].join('\n');
  }

  formatPaymentNotification(
    type: 'success' | 'failed',
    amount?: string,
    plan?: string,
  ): string {
    if (type === 'success') {
      return [
        `✅ <b>To'lov muvaffaqiyatli</b>`,
        ``,
        plan ? `📦 Plan: ${plan}` : '',
        amount ? `💰 Miqdor: ${amount}` : '',
        `🎉 Premium faollashtirildi!`,
      ]
        .filter(Boolean)
        .join('\n');
    }
    return [
      `❌ <b>To'lov muvaffaqiyatsiz</b>`,
      ``,
      `To'lovni qayta urinib ko'ring yoki boshqa karta ulang.`,
    ].join('\n');
  }
}
