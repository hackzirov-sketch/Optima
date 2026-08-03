import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtml, safeUrl } from '../../common/utils/html.util';
import * as nodemailer from 'nodemailer';
import { lookup } from 'dns';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const port = this.configService.get<number>('SMTP_PORT') || 587;
    const secure = port === 465;
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    if (!user || !pass) {
      this.logger.warn(
        'SMTP_USER or SMTP_PASS not configured — email sending disabled',
      );
      // create a stub transporter that throws a friendly error when used
      this.transporter = null as any;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com',
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
        from: `"UPZ Team" <${this.configService.get('SMTP_USER')}>`,
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

  async sendInvitationEmail(
    email: string,
    token: string,
    workspaceName: string,
  ) {
    try {
      if (!this.transporter) {
        this.logger.warn(
          'Skipping sendInvitationEmail — transporter not configured',
        );
        return;
      }
      await this.transporter.sendMail({
        from: `"UPZ Team" <${this.configService.get('SMTP_USER')}>`,
        to: email,
        subject: `You're invited to join ${workspaceName} on UPZ`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>You've been invited to ${escapeHtml(workspaceName)}!</h2>
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
        from: `"UPZ Team" <${this.configService.get('SMTP_USER')}>`,
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
        from: `"UPZ Team" <${this.configService.get('SMTP_USER')}>`,
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
        from: `"UPZ" <${this.configService.get('SMTP_USER')}>`,
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
