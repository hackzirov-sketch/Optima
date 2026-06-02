import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {
    const port = this.configService.get<number>('SMTP_PORT') || 587;
    const secure = port === 465;
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com',
      port,
      secure,
      requireTLS: !secure, // force STARTTLS on port 587
      connectionTimeout: 10_000, // 10s
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendVerificationEmail(email: string, code: string) {
    try {
      await this.transporter.sendMail({
        from: `"UPZ Team" <${this.configService.get('SMTP_USER')}>`,
        to: email,
        subject: 'Email Verification — UPZ',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Welcome to UPZ!</h2>
            <p>Please use the following code to verify your email address:</p>
            <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px;">
              ${code}
            </div>
            <p>This code will expire in 15 minutes.</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
          </div>
        `,
      });
      this.logger.log(`Verification email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}`, error.stack);
    }
  }

  async sendPasswordResetEmail(email: string, resetUrl: string) {
    try {
      await this.transporter.sendMail({
        from: `"UPZ Team" <${this.configService.get('SMTP_USER')}>`,
        to: email,
        subject: 'Password Reset — UPZ',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Reset your UPZ password</h2>
            <p>Click the button below to reset your password. This link expires in 15 minutes.</p>
            <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0;">
              Reset Password
            </a>
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send reset email to ${email}`, error.stack);
    }
  }
}
