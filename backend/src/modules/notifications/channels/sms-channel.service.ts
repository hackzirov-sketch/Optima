import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * SMS provider: Eskiz.uz (primary for Uzbekistan)
 * Docs: https://documenter.getpostman.com/view/663428/2s9YkgD5jm
 *
 * Swap `sendViaPrimary()` to integrate another provider (Twilio, Playmobile).
 */
@Injectable()
export class SmsChannelService {
  private readonly logger = new Logger(SmsChannelService.name);
  private readonly email: string | null;
  private readonly password: string | null;
  private readonly from: string;

  // Cached JWT token from Eskiz
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    this.email = this.config.get<string>('ESKIZ_EMAIL') ?? null;
    this.password = this.config.get<string>('ESKIZ_PASSWORD') ?? null;
    this.from = this.config.get<string>('ESKIZ_FROM') ?? 'UPZ';
  }

  get isEnabled(): boolean {
    return !!(this.email && this.password);
  }

  // ── Auth token ──────────────────────────────────────────────────────────────

  private async getToken(): Promise<string | null> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;

    try {
      const res = await fetch('https://notify.eskiz.uz/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: this.email, password: this.password }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json();
      if (data?.data?.token) {
        this.token = data.data.token;
        // Eskiz tokens expire in 30 days; cache for 29 days
        this.tokenExpiresAt = Date.now() + 29 * 24 * 60 * 60 * 1000;
        return this.token;
      }
    } catch (err) {
      this.logger.error(
        `Eskiz auth failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    return null;
  }

  // ── Send ─────────────────────────────────────────────────────────────────────

  async send(phoneNumber: string, message: string): Promise<SmsSendResult> {
    if (!this.isEnabled) {
      return { success: false, error: 'SMS provider not configured' };
    }

    const token = await this.getToken();
    if (!token)
      return { success: false, error: 'Could not obtain SMS auth token' };

    // Normalize phone: strip + and spaces
    const phone = phoneNumber.replace(/\D/g, '');

    try {
      const res = await fetch('https://notify.eskiz.uz/api/message/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          mobile_phone: phone,
          message,
          from: this.from,
          callback_url: '', // optional delivery report URL
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = await res.json();

      if (data?.status === 'waiting' || data?.id) {
        this.logger.log(`SMS sent to ${phone}, id=${data.id}`);
        return { success: true, messageId: data.id };
      }

      const errMsg = data?.message || JSON.stringify(data);
      this.logger.warn(`SMS send failed for ${phone}: ${errMsg}`);
      return { success: false, error: errMsg };
    } catch (err) {
      // Token might be expired — invalidate cache
      this.token = null;
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`SMS send error: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // ── Message templates ────────────────────────────────────────────────────────

  formatMeetingReminder(title: string, minutesBefore: number): string {
    const label =
      minutesBefore >= 60
        ? `${minutesBefore / 60} soat`
        : `${minutesBefore} daqiqa`;
    return `UPZ: "${title}" meeting ${label} keyin boshlanadi. Tayyorlaning!`;
  }

  formatOtp(otp: string): string {
    return `UPZ tasdiqlash kodi: ${otp}. 5 daqiqa amal qiladi. Hech kimga bermang.`;
  }

  formatSecurityAlert(event: string): string {
    return `UPZ OGOHLANTIRISH: ${event}. Siz emasligingizni bilsangiz, upz.uz saytiga kiring.`;
  }

  formatPaymentSuccess(plan: string): string {
    return `UPZ: ${plan} to'lov muvaffaqiyatli. Premium faollashtirildi!`;
  }

  formatPaymentFailed(): string {
    return `UPZ: To'lov amalga oshmadi. Karta ma'lumotlarini tekshiring.`;
  }
}
