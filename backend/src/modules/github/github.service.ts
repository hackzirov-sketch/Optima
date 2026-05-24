import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(private readonly configService: ConfigService) {}

  verifyWebhookSignature(
    rawBody: Buffer | undefined,
    signatureHeader: string | undefined,
  ): void {
    const secret = this.configService.get<string>('github.webhookSecret');
    if (!secret) {
      this.logger.warn(
        'GITHUB_APP_WEBHOOK_SECRET not set — skipping signature verification',
      );
      return;
    }

    if (!signatureHeader) {
      throw new UnauthorizedException('Missing X-Hub-Signature-256');
    }

    const body = rawBody ?? Buffer.alloc(0);
    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(body).digest('hex');

    const a = Buffer.from(signatureHeader, 'utf8');
    const b = Buffer.from(digest, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid GitHub signature');
    }
  }

  /**
   * Handles verified GitHub App delivery. Extend with BullMQ producers as needed.
   */
  async handleWebhook(event: string, payload: Record<string, unknown>) {
    this.logger.log(`GitHub webhook: ${event}`);

    switch (event) {
      case 'push': {
        const p = payload as {
          ref?: string;
          repository?: { full_name?: string };
        };
        this.logger.debug(`push ref=${p.ref} repo=${p.repository?.full_name}`);
        break;
      }
      case 'pull_request': {
        const p = payload as { action?: string };
        this.logger.debug(`pull_request action=${p.action}`);
        break;
      }
      case 'installation':
      case 'installation_repositories': {
        const p = payload as { action?: string };
        this.logger.debug(`installation action=${p.action}`);
        break;
      }
      default:
        break;
    }

    return { received: true, event };
  }
}
