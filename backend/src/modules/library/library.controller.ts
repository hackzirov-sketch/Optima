import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

@Controller('library')
export class LibraryController {
  @Get('read')
  async read(@Query('url') source: string) {
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new BadRequestException('Invalid book URL');
    }
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      (host !== 'gutenberg.org' && host !== 'www.gutenberg.org')
    )
      throw new BadRequestException('Book source is not allowed');
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    });
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
