import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import * as crypto from 'crypto';

import { MailService } from '../../mail/mail.service';

const VERIFICATION_COOLDOWN_MS = 2 * 60 * 1000;

@Processor('auth')
export class AuthProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthProcessor.name);

  constructor(
    private mailService: MailService,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'on-register':
        return this.handleOnRegister(job.data);
      case 'resend-verification':
        return this.handleResendVerification(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleOnRegister(data: { userId: string; email: string }) {
    const { userId, email } = data;
    this.logger.log(`on-register: settings for user ${userId}`);

    await this.dataSource.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    const rows: Array<{ isVerified: boolean }> = await this.dataSource.query(
      `SELECT is_verified AS "isVerified" FROM users WHERE id = $1`,
      [userId],
    );
    if (!rows[0]?.isVerified) {
      await this.issueVerificationCode(userId, email);
    }
  }

  private async handleResendVerification(data: { userId: string; email: string }) {
    const { userId, email } = data;
    const rows: Array<{ isVerified: boolean; needsPasswordSetup: boolean }> =
      await this.dataSource.query(
        `SELECT is_verified AS "isVerified", needs_password_setup AS "needsPasswordSetup"
         FROM users WHERE id = $1`,
        [userId],
      );
    const user = rows[0];
    if (!user) {
      this.logger.debug(`resend-verification skipped for ${userId} (user not found)`);
      return;
    }
    // Skip only if verified AND no pending password setup
    if (user.isVerified && !user.needsPasswordSetup) {
      this.logger.debug(`resend-verification skipped for ${userId} (already verified)`);
      return;
    }

    await this.issueVerificationCode(userId, email);
  }

  private async issueVerificationCode(userId: string, email: string) {
    const recentRows: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM user_verifications
       WHERE user_id = $1 AND created_at > $2
       ORDER BY created_at DESC LIMIT 1`,
      [userId, new Date(Date.now() - VERIFICATION_COOLDOWN_MS)],
    );
    if (recentRows[0]) {
      this.logger.debug(`Verification cooldown active for ${userId}`);
      return;
    }

    await this.dataSource.query(`DELETE FROM user_verifications WHERE user_id = $1`, [userId]);
    const code = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.dataSource.query(
      `INSERT INTO user_verifications (user_id, code, expires_at) VALUES ($1, $2, $3)`,
      [userId, code, expiresAt],
    );

    await this.mailService.sendVerificationEmail(email, code);
    this.logger.log(`Verification email sent to ${email}`);
  }
}
