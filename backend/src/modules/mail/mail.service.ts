import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtml, safeUrl } from '../../common/utils/html.util';
import * as nodemailer from 'nodemailer';
import { lookup } from 'dns';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  /** Sender address: SMTP_FROM, else SMTP_USER when it is an address (it isn't for SendGrid's "apikey"). */
  private readonly fromAddress: string | undefined;

  constructor(private configService: ConfigService) {
    const port = Number(this.configService.get('SMTP_PORT')) || 587;
    const secure = port === 465;
    const host =
      this.configService.get<string>('SMTP_HOST')?.trim() || 'smtp.gmail.com';
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = normalizeSmtpPassword(
      this.configService.get<string>('SMTP_PASS'),
    );
    const from = this.configService.get<string>('SMTP_FROM')?.trim();
    this.fromAddress = from || (user?.includes('@') ? user : undefined);

    if (!user || !pass) {
      this.logger.warn(
        'SMTP_USER or SMTP_PASS not configured — email sending disabled',
      );
      // create a stub transporter that throws a friendly error when used
      this.transporter = null as any;
      return;
    }
    for (const problem of smtpConfigProblems(host, user, pass, from)) {
      this.logger.warn(`SMTP config: ${problem}`);
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      // Force IPv4: Render blocks IPv6 outbound, Gmail DNS returns IPv6 by default
      lookup: (hostname, options, callback) =>
        lookup(hostname, { ...options, family: 4 }, callback),
      auth: {
        user,
        pass,
      },
    } as any);

    // Fail loudly at startup instead of on the first sign-up: a bad login
    // otherwise only shows up as a verification email that never arrives.
    void this.transporter
      .verify()
      .then(() => this.logger.log(`SMTP login ok (${host} as ${user})`))
      .catch((err: Error) =>
        this.logger.error(
          `SMTP login failed (${host} as ${user}): ${err.message}`,
        ),
      );
  }

  async sendVerificationEmail(email: string, code: string) {
    try {
      if (!this.transporter) {
        this.logger.warn(
          'Skipping sendVerificationEmail — transporter not configured',
        );
        return;
      }
      await this.transporter.sendMail({
        from: `"UPZ Team" <${this.fromAddress}>`,
        to: email,
        subject: 'Email Verification — UPZ',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to UPZ!</h2>
            <p>Please use the following code to verify your email address:</p>
            <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px;">
              ${escapeHtml(code)}
            </div>
            <p>This code will expire in 15 minutes.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          </div>
        `,
      });
      this.logger.log(`Verification email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send email to ${email}`,
        error?.stack || String(error),
      );
    }
  }

  async sendInvitationEmail(email: string, token: string, groupName: string) {
    try {
      if (!this.transporter) {
        this.logger.warn(
          'Skipping sendInvitationEmail — transporter not configured',
        );
        return;
      }
      await this.transporter.sendMail({
        from: `"UPZ Team" <${this.fromAddress}>`,
        to: email,
        subject: `You're invited to join ${groupName} on UPZ`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You've been invited to ${escapeHtml(groupName)}!</h2>
            <p>Someone invited you to collaborate on UPZ. Use the link below to accept:</p>
            <a href="${this.configService.get('APP_URL') ?? 'http://localhost:3000'}/invite?token=${escapeHtml(token)}"
               style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
              Accept Invitation
            </a>
            <p>This invitation expires in 5 days. If you didn't expect this, you can ignore it.</p>
          </div>
        `,
      });
      this.logger.log(`Invitation email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send invitation email to ${email}`,
        error?.stack || String(error),
      );
    }
  }

  async sendPasswordResetOtpEmail(email: string, otp: string) {
    try {
      if (!this.transporter) {
        this.logger.warn(
          'Skipping sendPasswordResetOtpEmail — transporter not configured',
        );
        return;
      }
      await this.transporter.sendMail({
        from: `"UPZ Team" <${this.fromAddress}>`,
        to: email,
        subject: 'Password Reset Code — UPZ',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Reset your UPZ password</h2>
            <p>Use the code below to reset your password. It expires in <strong>15 minutes</strong>.</p>
            <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 28px; font-weight: bold; letter-spacing: 8px; margin: 24px 0; border-radius: 8px;">
              ${escapeHtml(otp)}
            </div>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
            <p style="color: #888; font-size: 12px;">Do not share this code with anyone.</p>
          </div>
        `,
      });
      this.logger.log(`Password reset OTP email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send reset OTP email to ${email}`,
        error?.stack || String(error),
      );
    }
  }

  /** @deprecated Use sendPasswordResetOtpEmail instead — kept for backward compat. */
  async sendPasswordResetEmail(email: string, resetUrl: string) {
    try {
      if (!this.transporter) {
        this.logger.warn(
          'Skipping sendPasswordResetEmail — transporter not configured',
        );
        return;
      }
      await this.transporter.sendMail({
        from: `"UPZ Team" <${this.fromAddress}>`,
        to: email,
        subject: 'Password Reset — UPZ',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Reset your UPZ password</h2>
            <p>Click the button below to reset your password. This link expires in 15 minutes.</p>
            <a href="${safeUrl(resetUrl)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
              Reset Password
            </a>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send reset email to ${email}`,
        error?.stack || String(error),
      );
    }
  }

  async sendNotificationEmail(
    email: string,
    firstName: string,
    title: string,
    message: string,
  ): Promise<void> {
    try {
      if (!this.transporter) {
        this.logger.warn(
          'Skipping sendNotificationEmail — transporter not configured',
        );
        return;
      }
      await this.transporter.sendMail({
        from: `"UPZ" <${this.fromAddress}>`,
        to: email,
        subject: title,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
            <div style="background:#1a1f2e;padding:20px;border-radius:12px 12px 0 0;">
              <h1 style="color:#fff;margin:0;font-size:20px;">UPZ</h1>
            </div>
            <div style="background:#f9fafb;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;">
              <p style="color:#374151;margin:0 0 8px;">Salom, ${escapeHtml(firstName)}!</p>
              <h2 style="color:#111827;font-size:18px;margin:0 0 12px;">${escapeHtml(title)}</h2>
              <p style="color:#6b7280;line-height:1.6;">${escapeHtml(message)}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
              <p style="color:#9ca3af;font-size:12px;margin:0;">
                UPZ — Professional Development Platform<br/>
                Agar bu xabar siz uchun tegishli bo'lmasa, e'tiborsiz qoldiring.
              </p>
            </div>
          </div>
        `,
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to send notification email to ${email}`,
        error?.stack || String(error),
      );
      throw error;
    }
  }
}

/**
 * App passwords are shown grouped for reading ("abcd efgh ijkl mnop") and
 * often pasted that way, quotes included; the server wants the bare 16
 * characters. Whitespace is never part of a real SMTP secret here.
 */
export function normalizeSmtpPassword(raw: string | undefined): string {
  return (raw ?? '').replace(/^['"]|['"]$/g, '').replace(/\s+/g, '');
}

/** Mismatches that make every login fail with a cryptic 535. */
export function smtpConfigProblems(
  host: string,
  user: string,
  pass: string,
  from?: string,
): string[] {
  const problems: string[] = [];
  const isSendGrid = /sendgrid/i.test(host);
  const isGmail = /gmail|googlemail/i.test(host);
  const looksLikeGmailAppPassword = /^[a-z]{16}$/.test(pass);

  if (isSendGrid && !pass.startsWith('SG.')) {
    problems.push(
      looksLikeGmailAppPassword
        ? 'SMTP_PASS looks like a Gmail app password but SMTP_HOST is SendGrid — set SMTP_HOST=smtp.gmail.com and SMTP_USER to that Gmail address'
        : 'SendGrid API keys start with "SG." — SMTP_PASS is not one',
    );
  }
  if (isSendGrid && user !== 'apikey')
    problems.push('SendGrid expects SMTP_USER=apikey');
  if (isSendGrid && !from)
    problems.push('SendGrid needs SMTP_FROM (a verified sender address)');
  if (isGmail && !user.includes('@'))
    problems.push('Gmail expects SMTP_USER to be the full Gmail address');
  if (isGmail && !looksLikeGmailAppPassword)
    problems.push(
      'Gmail needs a 16-letter app password (Google Account → Security → App passwords), not the account password',
    );
  return problems;
}
