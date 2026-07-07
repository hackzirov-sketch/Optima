import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * Email verification (code generation, Redis storage, sending) now happens
 * inline in AuthService.issueEmailVerification() — it needs to return a
 * verifyToken synchronously in the HTTP response, which a background job
 * can't do. This processor is left with just the one thing that genuinely
 * belongs in the background: default settings row creation on register.
 */
@Processor('auth')
export class AuthProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthProcessor.name);

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
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
    const { userId } = data;
    this.logger.log(`on-register: settings for user ${userId}`);

    await this.dataSource.query(
      `INSERT INTO user_settings (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
  }
}
