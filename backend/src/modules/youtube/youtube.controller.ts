import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { YoutubeService } from './youtube.service';

@Controller('youtube')
export class YoutubeController {
  constructor(private readonly youtube: YoutubeService) {}

  /** Whether full YouTube search is available (else the page uses the catalogue). */
  @Get('status')
  status() {
    return { enabled: this.youtube.enabled };
  }

  @Get('search')
  search(
    @Query('q') q = '',
    @Query('pageToken') pageToken: string | undefined,
    @CurrentUser('language') language?: string,
  ) {
    return this.youtube.search(q, pageToken, language);
  }

  @Get('popular')
  popular(@Query('pageToken') pageToken?: string) {
    return this.youtube.popular(pageToken);
  }
}
