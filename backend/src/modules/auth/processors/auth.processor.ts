import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Logger } from '@nestjs/common';

import { UserSettings } from '../../../database/entities/user-settings.entity';
import { UserVerification } from '../../../database/entities/user-verification.entity';
import { MailService } from '../../mail/mail.service';

@Processor('auth')
export class AuthProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthProcessor.name);

  constructor(
    private mailService: MailService,
    @InjectRepository(UserSettings)
    private userSettingsRepository: Repository<UserSettings>,
    @InjectRepository(UserVerification)
    private userVerificationsRepository: Repository<UserVerification>,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'on-register':
        return this.handleOnRegister(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleOnRegister(data: { userId: string; email: string }) {
    const { userId, email } = data;
    
    this.logger.log(`Processing background tasks for user ${userId}`);

    // 1. Create default settings if not exist
    const existingSettings = await this.userSettingsRepository.findOne({ where: { userId } });
    if (!existingSettings) {
      const settings = this.userSettingsRepository.create({ userId });
      await this.userSettingsRepository.save(settings);
    }

    // 2. Generate and send verification code (cleanup old ones first)
    await this.userVerificationsRepository.delete({ userId });
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const verification = this.userVerificationsRepository.create({
      userId,
      code,
      expiresAt,
    });
    await this.userVerificationsRepository.save(verification);

    await this.mailService.sendVerificationEmail(email, code);
    
    this.logger.log(`Finished background tasks for user ${userId}`);
  }
}
