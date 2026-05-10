import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('GitHub')
@Controller('github')
export class GithubController {
  private readonly logger = new Logger(GithubController.name);

  constructor(private configService: ConfigService) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'GitHub Webhook endpoint' })
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
  ) {
    this.verifySignature(payload, signature);

    const event = payload.action;
    this.logger.log(`Received GitHub webhook event: ${event}`);

    // TODO: Implement actual event handling logic
    // - Push events -> Trigger review system
    // - PR events -> Update task status
    // - Installation events -> Link workspace to GitHub

    return { received: true };
  }

  private verifySignature(payload: any, signature: string) {
    const secret = this.configService.get<string>('github.webhookSecret');
    if (!secret) return;

    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(JSON.stringify(payload)).digest('hex');

    if (!signature || signature !== digest) {
      throw new UnauthorizedException('Invalid GitHub signature');
    }
  }
}
