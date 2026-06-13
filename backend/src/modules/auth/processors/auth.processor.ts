import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Logger } from '@nestjs/common';

import { UserSettings } from '../../../database/entities/user-settings.entity';
import { UserVerification } from '../../../database/entities/user-verification.entity';
import { User } from '../../../database/entities/user.entity';
import { MailService } from '../../mail/mail.service';

const VERIFICATION_COOLDOWN_MS = 2 * 60 * 1000;

@Processor('auth')
export class AuthProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthProcessor.name);

  constructor(
    private mailService: MailService,
    @InjectRepository(UserSettings)
    private userSettingsRepository: Repository<UserSettings>,
    @InjectRepository(UserVerification)
    private userVerificationsRepository: Repository<UserVerification>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
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

    const existingSettings = await this.userSettingsRepository.findOne({
      where: { userId },
    });
    if (!existingSettings) {
      await this.userSettingsRepository.save(
        this.userSettingsRepository.create({ userId }),
      );
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user?.isVerified) {
      await this.issueVerificationCode(userId, email);
    }
  }

  private async handleResendVerification(data: { userId: string; email: string }) {
    const { userId, email } = data;
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.isVerified) {
      this.logger.debug(`resend-verification skipped for ${userId} (verified or missing)`);
      return;
    }

    await this.issueVerificationCode(userId, email);
  }

  private async issueVerificationCode(userId: string, email: string) {
    const recent = await this.userVerificationsRepository.findOne({
      where: {
        userId,
        createdAt: MoreThan(new Date(Date.now() - VERIFICATION_COOLDOWN_MS)),
      },
      order: { createdAt: 'DESC' },
    });
    if (recent) {
      this.logger.debug(`Verification cooldown active for ${userId}`);
      return;
    }

    await this.userVerificationsRepository.delete({ userId });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.userVerificationsRepository.save(
      this.userVerificationsRepository.create({ userId, code, expiresAt }),
    );

    await this.mailService.sendVerificationEmail(email, code);
    this.logger.log(`Verification email sent to ${email}`);
  }
}
