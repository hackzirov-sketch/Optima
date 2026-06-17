import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IpRateLimit } from '../../database/entities/ip-rate-limit.entity';
import { UserViolation } from '../../database/entities/user-violation.entity';
import { BannedContent } from '../../database/entities/banned-content.entity';
import { IpRateLimitGuard } from './guards/ip-rate-limit.guard';
import { ViolationService } from './services/violation.service';
import { ContentFilterService } from './services/content-filter.service';
import { ImageModerationService } from './services/image-moderation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([IpRateLimit, UserViolation, BannedContent]),
  ],
  providers: [
    IpRateLimitGuard,
    ViolationService,
    ContentFilterService,
    ImageModerationService,
  ],
  exports: [
    TypeOrmModule,
    IpRateLimitGuard,
    ViolationService,
    ContentFilterService,
    ImageModerationService,
  ],
})
export class ModerationModule {}
