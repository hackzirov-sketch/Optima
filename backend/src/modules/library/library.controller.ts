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
    // `redirect: 'follow'` would let the allowlist be checked once and then
    // walked away from: any open redirect on gutenberg.org — or a compromised
    // one — turns this into a fetch of whatever it points at, from inside the
    // API's own network, where link-local metadata endpoints live. The
    // allowlist has to hold for the URL we actually retrieve, so a redirect is
    // a refusal rather than something to chase.
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: 'manual',
    });
    if (response.status >= 300 && response.status < 400)
      throw new BadRequestException('Book source is not allowed');
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
