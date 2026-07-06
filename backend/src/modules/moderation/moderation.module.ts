import { Module } from '@nestjs/common';
import { IpRateLimitGuard } from './guards/ip-rate-limit.guard';
import { ViolationService } from './services/violation.service';
import { ContentFilterService } from './services/content-filter.service';
import { ImageModerationService } from './services/image-moderation.service';

@Module({
  providers: [
    IpRateLimitGuard,
    ViolationService,
    ContentFilterService,
    ImageModerationService,
  ],
  exports: [
    IpRateLimitGuard,
    ViolationService,
    ContentFilterService,
    ImageModerationService,
  ],
})
export class ModerationModule {}
