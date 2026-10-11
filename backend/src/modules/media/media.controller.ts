import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MediaCountersService } from './media-counters.service';
import { MediaService } from './media.service';

/**
 * Pages for YouTube videos and library books under our own short slugs, with
 * views and likes. Library books are registered by the library module, which
 * knows how to vet a book; videos are registered here by their YouTube id.
 */
@Controller('media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly counters: MediaCountersService,
  ) {}

  /** Opening a video: returns its slug (created on first open). */
  @Post('youtube')
  @HttpCode(200)
  async youtube(@Body() body: { videoId?: string }, @CurrentUser('id') userId: string) {
    const item = await this.media.youtubeVideo(String(body?.videoId ?? ''));
    return this.media.describe(item, userId);
  }

  @Get(':slug')
  async get(@Param('slug') slug: string, @CurrentUser('id') userId: string) {
    return this.media.describe(await this.media.bySlug(slug), userId);
  }

  @Post(':slug/view')
  @HttpCode(200)
  @Throttle({ short: { limit: 5, ttl: 1000 } })
  async view(@Param('slug') slug: string, @CurrentUser('id') userId: string) {
    const item = await this.media.bySlug(slug);
    return { views: await this.counters.recordView(item, userId) };
  }

  /** The player reports seconds actually played, every ~30s and on leaving. */
  @Post(':slug/watch')
  @HttpCode(204)
  @Throttle({ short: { limit: 3, ttl: 1000 } })
  async watch(@Param('slug') slug: string, @Body() body: { seconds?: number }, @CurrentUser('id') userId: string) {
    await this.counters.recordWatch(await this.media.bySlug(slug), userId, Number(body?.seconds) || 0);
  }

    @Put(':slug/progress')
  @Throttle({ short: { limit: 3, ttl: 1000 } })
  async progress(
    @Param('slug') slug: string,
    @Body() body: { position?: number; page?: number; totalPages?: number },
    @CurrentUser('id') userId: string,
  ) {
    return this.media.saveProgress(await this.media.bySlug(slug), userId, body);
  }

  @Put(':slug/like')
  async like(@Param('slug') slug: string, @CurrentUser('id') userId: string) {
    return this.counters.setLike(await this.media.bySlug(slug), userId, true);
  }

  @Delete(':slug/like')
  async unlike(@Param('slug') slug: string, @CurrentUser('id') userId: string) {
    return this.counters.setLike(await this.media.bySlug(slug), userId, false);
  }
}
