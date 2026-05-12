import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { GithubService } from './github.service';

@ApiTags('GitHub')
@Controller('github')
export class GithubController {
  constructor(private readonly githubService: GithubService) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'GitHub Webhook endpoint' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string,
    @Headers('x-github-event') event: string,
  ) {
    this.githubService.verifyWebhookSignature(req.rawBody, signature);
    return this.githubService.handleWebhook(event || 'unknown', req.body ?? {});
  }
}
