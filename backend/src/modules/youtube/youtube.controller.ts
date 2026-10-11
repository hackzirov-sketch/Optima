import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VideoFeedService } from './video-feed.service';
import { YoutubeService } from './youtube.service';

@Controller('youtube')
export class YoutubeController {
  constructor(
    private readonly youtube: YoutubeService,
    private readonly feed: VideoFeedService,
  ) {}

  /** Whether full YouTube search is available (else the page uses the catalogue). */
  @Get('status')
  status() {
    return { enabled: this.youtube.enabled };
  }

  /** "For you": the vetted pool, ranked for this person (Spend Time + frequency cap). */
  @Get('feed')
  forYou(@CurrentUser('id') userId: string, @Query('page') page = '1') {
    return this.feed.feed(userId, Math.max(1, Math.min(10, Number(page) || 1)));
  }

  /** Search, filtered (nothing off-topic for Optima) and ranked for this person. */
  @Get('search')
  async search(
    @Query('q') q = '',
    @Query('pageToken') pageToken: string | undefined,
    @CurrentUser('id') userId: string,
    @CurrentUser('language') language?: string,
  ) {
    const result = await this.youtube.search(q, pageToken, language);
    return { items: await this.feed.rankSearch(userId, result.items), nextPageToken: result.nextPageToken };
  }

  /** Kept for older clients: now the same vetted feed. */
  @Get('popular')
  async popular(@CurrentUser('id') userId: string) {
    const page = await this.feed.feed(userId, 1);
    return { items: page.items, nextPageToken: null };
  }
}
