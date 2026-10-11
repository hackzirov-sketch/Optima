import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { createHash } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import { RedisService } from '../../redis/redis.service';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  LibraryService,
  type LibraryLanguage,
  type LibrarySubject,
} from './library.service';

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().max(2000).optional().default(''),
});
class SaveReviewDto extends createZodDto(reviewSchema) {}

@Controller('library')
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly redis: RedisService,
  ) {}

  /** Openly readable books from Internet Archive, every language. */
  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('lang') lang?: LibraryLanguage,
    @Query('subject') subject?: LibrarySubject,
    @Query('page') page?: string,
  ) {
    return this.library.search({ q, lang, subject, page: Number(page) || 1 });
  }

  @Get('books/:key/reviews')
  reviews(@Param('key') key: string, @CurrentUser('id') userId: string) {
    return this.library.listReviews(key, userId);
  }

  @Put('books/:key/reviews')
  saveReview(
    @Param('key') key: string,
    @CurrentUser('id') userId: string,
    @Body() dto: SaveReviewDto,
  ) {
    return this.library.saveReview(key, userId, dto.rating, dto.body ?? '');
  }

  @Get('me/marks')
  marks(@CurrentUser('id') userId: string) {
    return this.library.myMarks(userId);
  }

  /** The reader's saved shelf. */
  @Get('me/reading')
  reading(@CurrentUser('id') userId: string) {
    return this.library.listReading(userId);
  }

  @Get('me/saved')
  saved(@CurrentUser('id') userId: string) {
    return this.library.listSaved(userId);
  }

  @Put('books/:key/save')
  save(
    @Param('key') key: string,
    @CurrentUser('id') userId: string,
    @Body() body: { book?: unknown },
  ) {
    return this.library.setSaved(key, userId, true, body?.book);
  }

  @Delete('books/:key/save')
  unsave(@Param('key') key: string, @CurrentUser('id') userId: string) {
    return this.library.setSaved(key, userId, false);
  }

  /** Opening a book's page: registers it and returns its slug and counts. */
  @Post('books/:key/open')
  @HttpCode(200)
  open(
    @Param('key') key: string,
    @Body() body: { book?: unknown },
    @CurrentUser('id') userId: string,
  ) {
    return this.library.open(key, userId, body?.book);
  }

  @Put('books/:key/like')
  like(
    @Param('key') key: string,
    @Body() body: { book?: unknown },
    @CurrentUser('id') userId: string,
  ) {
    return this.library.setLiked(key, userId, true, body?.book);
  }

  @Delete('books/:key/like')
  unlike(@Param('key') key: string, @CurrentUser('id') userId: string) {
    return this.library.setLiked(key, userId, false);
  }

  @Delete('books/:key/reviews')
  deleteReview(@Param('key') key: string, @CurrentUser('id') userId: string) {
    return this.library.deleteReview(key, userId);
  }

  /** One attempt; a network failure becomes a 503 instead of a bare 500. */
  private async fetchOnce(url: URL): Promise<Response> {
    try {
      return await fetch(url, {
        signal: AbortSignal.timeout(20000),
        redirect: 'manual',
      });
    } catch {
      throw new ServiceUnavailableException({
        code: 'LIBRARY_SOURCE_UNAVAILABLE',
        message: 'The book source is unreachable right now — try again',
      });
    }
  }

  /**
   * A book's text. Kept in Redis (gzipped, a week) after the first read:
   * Gutenberg is slow and now and then doesn't answer, and a book being read
   * is opened again and again — on every device the reader uses.
   */
  @Get('read')
  async read(@Query('url') source: string) {
    const cacheKey = `library:text:${createHash('sha1').update(String(source)).digest('hex')}`;
    const client = this.redis.getClient();
    try {
      const hit = await client?.getBuffer(cacheKey);
      if (hit) return JSON.parse(gunzipSync(hit).toString('utf8')) as { content: string; contentType: string };
    } catch {
      /* fall through to the source */
    }
    const result = await this.readFromSource(source);
    try {
      await client?.set(cacheKey, gzipSync(Buffer.from(JSON.stringify(result))), 'EX', 7 * 24 * 3600);
    } catch {
      /* best-effort */
    }
    return result;
  }

  private async readFromSource(source: string) {
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new BadRequestException('Invalid book URL');
    }
    // Redirects are followed by hand, at most three, and every hop has to
    // pass the allowlist again. Following them blindly would let an open
    // redirect on the source walk the server to any address (including the
    // cloud metadata endpoint); refusing them outright broke every Gutenberg
    // book, whose text URLs all 302 to a cache path.
    let response: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      if (url.protocol === 'http:') url.protocol = 'https:';
      const host = url.hostname.toLowerCase();
      if (
        url.protocol !== 'https:' ||
        (host !== 'gutenberg.org' && host !== 'www.gutenberg.org')
      )
        throw new BadRequestException('Book source is not allowed');
      response = await this.fetchOnce(url).catch(() => this.fetchOnce(url));
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get('location');
      if (!location || hop === 3)
        throw new BadRequestException('Book content is unavailable');
      url = new URL(location, url);
    }
    if (!response) throw new BadRequestException('Book content is unavailable');
    if (!response.ok)
      throw new BadRequestException('Book content is unavailable');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > 12_000_000)
      throw new BadRequestException('Book is too large for online reader');
    const content = await response.text();
    if (content.length > 12_000_000)
      throw new BadRequestException('Book is too large for online reader');
    return {
      content,
      contentType: response.headers.get('content-type') || 'text/plain',
    };
  }
}
