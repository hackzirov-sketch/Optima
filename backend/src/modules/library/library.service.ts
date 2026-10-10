import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DatabaseService } from '../../database/database.service';
import { RedisService } from '../../redis/redis.service';
import { ContentFilterService } from '../moderation/services/content-filter.service';

export type LibraryLanguage = 'uz' | 'en' | 'ru' | 'tr';
export type LibrarySubject =
  | 'all'
  | 'fiction'
  | 'history'
  | 'science'
  | 'children'
  | 'poetry'
  | 'philosophy'
  | 'religion';

export interface LibraryBook {
  key: string;
  id: string;
  title: string;
  authors: string[];
  languages: string[];
  year: string | null;
  downloads: number;
  description: string;
  cover: string;
  /** Internet Archive's embeddable reader (ia:* books). */
  embedUrl: string | null;
  /** Plain text for the built-in reader (gb:* books, via /library/read). */
  textUrl: string | null;
  sourceUrl: string;
  source: 'internet-archive' | 'gutenberg';
}

const LANGUAGE_QUERY: Record<Exclude<LibraryLanguage, 'en'>, string> = {
  uz: 'language:(uzb OR Uzbek OR "O\'zbek" OR "Uzbek language")',
  ru: 'language:(rus OR Russian)',
  tr: 'language:(tur OR Turkish)',
};
/** Gutendex topics for the same shelves. */
const GUTENBERG_TOPIC: Record<Exclude<LibrarySubject, 'all'>, string> = {
  fiction: 'fiction',
  history: 'history',
  science: 'science',
  children: 'children',
  poetry: 'poetry',
  philosophy: 'philosophy',
  religion: 'religion',
};
const SUBJECT_QUERY: Record<Exclude<LibrarySubject, 'all'>, string> = {
  fiction: 'subject:(fiction OR novel OR novels OR roman OR stories)',
  history: 'subject:(history OR tarix)',
  science:
    'subject:(science OR mathematics OR physics OR chemistry OR biology)',
  children: 'subject:(children OR juvenile OR "fairy tales" OR ertak)',
  poetry: 'subject:(poetry OR poems OR verse OR sheriyat)',
  philosophy: 'subject:(philosophy OR ethics OR falsafa)',
  religion: 'subject:(religion OR islam OR theology)',
};
// Lending-only scans can't be read without an archive.org loan; only
// openly readable texts are listed.
const READABLE =
  'mediatype:texts AND NOT collection:(inlibrary OR printdisabled OR lendinglibrary) AND NOT access-restricted-item:true';
const PAGE_SIZE = 24;
const BOOK_KEY = /^(ia|gb):[A-Za-z0-9._-]{1,120}$/;

/**
 * The library is a window onto open catalogues, plus reader reviews kept here:
 *  - English: Project Gutenberg (via Gutendex) — curated public domain, read
 *    as text in our own reader.
 *  - Uzbek, Russian, Turkish: Internet Archive's openly readable texts, shown
 *    through the archive's embeddable reader. Nothing is copied here; a book
 *    the archive takes down disappears from our shelves with it.
 */
@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly contentFilter: ContentFilterService,
  ) {}

  async search(params: {
    q?: string;
    lang?: LibraryLanguage;
    subject?: LibrarySubject;
    page?: number;
  }) {
    const page = Math.min(Math.max(Number(params.page) || 1, 1), 100);
    const lang: LibraryLanguage =
      params.lang && ['uz', 'en', 'ru', 'tr'].includes(params.lang)
        ? params.lang
        : 'uz';
    const subject =
      params.subject && params.subject in SUBJECT_QUERY
        ? params.subject
        : 'all';
    // Only letters, digits and spaces reach the search syntax.
    const q = (params.q ?? '')
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);

    if (lang === 'en') return this.searchGutenberg(q, subject, page);

    const clauses = [READABLE, LANGUAGE_QUERY[lang]];
    if (subject !== 'all') clauses.push(SUBJECT_QUERY[subject]);
    if (q) {
      const term = q.replace(/["'’]/g, ' ');
      clauses.push(
        `(title:(${term}) OR creator:(${term}) OR subject:(${term}))`,
      );
    }
    const url = new URL('https://archive.org/advancedsearch.php');
    url.searchParams.set('q', clauses.join(' AND '));
    for (const field of [
      'identifier',
      'title',
      'creator',
      'language',
      'downloads',
      'description',
      'year',
      'date',
    ])
      url.searchParams.append('fl[]', field);
    url.searchParams.append('sort[]', 'downloads desc');
    url.searchParams.set('rows', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('output', 'json');

    const cacheKey = `library:search:${createHash('sha1').update(url.toString()).digest('hex')}`;
    const cached = await this.cacheGet<{ total: number; items: LibraryBook[] }>(
      cacheKey,
    );
    const result = cached ?? (await this.fetchSearch(url));
    if (!cached && result.items.length)
      await this.cacheSet(cacheKey, result, 1800);
    return {
      ...result,
      page,
      hasMore: page * PAGE_SIZE < result.total,
    };
  }

  private async fetchSearch(url: URL) {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } catch (error) {
      this.logger.warn(
        `Internet Archive unreachable: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException({
        code: 'LIBRARY_SOURCE_UNAVAILABLE',
        message: 'The book catalogue is unreachable right now',
      });
    }
    if (!response.ok)
      throw new ServiceUnavailableException({
        code: 'LIBRARY_SOURCE_UNAVAILABLE',
        message: 'The book catalogue is unreachable right now',
      });
    const body = (await response.json()) as {
      response?: { numFound?: number; docs?: Array<Record<string, unknown>> };
    };
    const docs = body.response?.docs ?? [];
    return {
      total: Number(body.response?.numFound ?? 0),
      items: docs.map((doc) => this.toBook(doc)).filter((book) => book.title),
    };
  }

  private toBook(doc: Record<string, unknown>): LibraryBook {
    const list = (value: unknown) =>
      (Array.isArray(value) ? value : value == null ? [] : [value]).map(String);
    const id = String(doc.identifier);
    const description = list(doc.description)
      .join(' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
    const year = doc.year
      ? String(doc.year)
      : doc.date
        ? String(doc.date).slice(0, 4)
        : null;
    return {
      key: `ia:${id}`,
      id,
      title: list(doc.title)[0]?.trim() ?? '',
      authors: list(doc.creator).slice(0, 3),
      languages: list(doc.language).slice(0, 3),
      year,
      downloads: Number(doc.downloads ?? 0),
      description,
      cover: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      embedUrl: `https://archive.org/embed/${encodeURIComponent(id)}`,
      textUrl: null,
      sourceUrl: `https://archive.org/details/${encodeURIComponent(id)}`,
      source: 'internet-archive',
    };
  }

  private async searchGutenberg(
    q: string,
    subject: LibrarySubject,
    page: number,
  ) {
    const url = new URL('https://gutendex.com/books/');
    url.searchParams.set('languages', 'en');
    // Not ?copyright=false: Gutendex times out on that filter. The flag is
    // checked on each result instead.
    if (q) url.searchParams.set('search', q);
    else if (subject !== 'all')
      url.searchParams.set('topic', GUTENBERG_TOPIC[subject]);
    if (page > 1) url.searchParams.set('page', String(page));
    const cacheKey = `library:gb:${createHash('sha1').update(url.toString()).digest('hex')}`;
    let result = await this.cacheGet<{
      total: number;
      items: LibraryBook[];
      hasMore: boolean;
    }>(cacheKey);
    if (!result) {
      // Gutendex is slow to wake and sometimes drops the first request:
      // one retry before giving up.
      let response = new Response(null, { status: 503 });
      for (let attempt = 0; attempt < 2 && !response.ok; attempt++) {
        try {
          response = await fetch(url, { signal: AbortSignal.timeout(25000) });
        } catch {
          response = new Response(null, { status: 503 });
        }
      }
      if (!response.ok)
        throw new ServiceUnavailableException({
          code: 'LIBRARY_SOURCE_UNAVAILABLE',
          message: 'The book catalogue is unreachable right now',
        });
      const body = (await response.json()) as {
        count: number;
        next: string | null;
        results: Array<{
          id: number;
          copyright?: boolean | null;
          title: string;
          authors: Array<{ name: string }>;
          summaries?: string[];
          languages: string[];
          download_count: number;
          formats: Record<string, string>;
        }>;
      };
      result = {
        total: body.count,
        hasMore: Boolean(body.next),
        items: body.results
          .filter((book) => book.copyright !== true)
          .map((book) => ({
            key: `gb:${book.id}`,
            id: String(book.id),
            title: book.title,
            authors: book.authors.map((author) => author.name).slice(0, 3),
            languages: book.languages,
            year: null,
            downloads: book.download_count,
            description: (book.summaries?.[0] ?? '').slice(0, 600),
            cover: book.formats['image/jpeg'] ?? '',
            embedUrl: null,
            textUrl:
              book.formats['text/plain; charset=utf-8'] ??
              book.formats['text/plain; charset=us-ascii'] ??
              book.formats['text/plain'] ??
              null,
            sourceUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
            source: 'gutenberg' as const,
          })),
      };
      // An empty page is more likely a hiccup than the truth; don't pin it.
      if (result.items.length) await this.cacheSet(cacheKey, result, 6 * 3600);
    }
    return { ...result, page };
  }

  // ─── Reviews ─────────────────────────────────────────────

  private assertKey(bookKey: string) {
    if (!BOOK_KEY.test(bookKey))
      throw new BadRequestException({
        code: 'INVALID_BOOK',
        message: 'Unknown book',
      });
  }

  async listReviews(bookKey: string, userId: string) {
    this.assertKey(bookKey);
    const [summary] = await this.db.query<{
      count: string;
      average: string | null;
    }>(
      `SELECT count(*) AS count, round(avg(rating)::numeric, 1)::text AS average
         FROM book_reviews WHERE book_key = $1`,
      [bookKey],
    );
    const items = await this.db.query(
      `SELECT r.id, r.rating, r.body, r.created_at AS "createdAt", r.updated_at AS "updatedAt",
              r.user_id = $2 AS "mine",
              json_build_object('id', u.id, 'firstName', u.first_name, 'lastName', u.last_name,
                                'username', u.username, 'avatarUrl', u.avatar_url) AS "author"
         FROM book_reviews r JOIN users u ON u.id = r.user_id AND u.deleted_at IS NULL
        WHERE r.book_key = $1
        ORDER BY (r.user_id = $2) DESC, r.updated_at DESC
        LIMIT 50`,
      [bookKey, userId],
    );
    return {
      count: Number(summary?.count ?? 0),
      average: summary?.average ? Number(summary.average) : null,
      items,
    };
  }

  async saveReview(
    bookKey: string,
    userId: string,
    rating: number,
    body: string,
  ) {
    this.assertKey(bookKey);
    const text = (body ?? '').trim();
    if (text) await this.contentFilter.filterText(text, userId, 'book-review');
    await this.db.query(
      `INSERT INTO book_reviews (book_key, user_id, rating, body)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (book_key, user_id)
       DO UPDATE SET rating = EXCLUDED.rating, body = EXCLUDED.body, updated_at = now()`,
      [bookKey, userId, rating, text],
    );
    return this.listReviews(bookKey, userId);
  }

  async deleteReview(bookKey: string, userId: string) {
    this.assertKey(bookKey);
    const rows = await this.db.query(
      `DELETE FROM book_reviews WHERE book_key = $1 AND user_id = $2 RETURNING id`,
      [bookKey, userId],
    );
    if (!rows[0])
      throw new NotFoundException({
        code: 'REVIEW_NOT_FOUND',
        message: 'Review not found',
      });
    return this.listReviews(bookKey, userId);
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.getClient()?.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async cacheSet(key: string, value: unknown, seconds: number) {
    try {
      await this.redis
        .getClient()
        ?.set(key, JSON.stringify(value), 'EX', seconds);
    } catch {
      /* cache is best-effort */
    }
  }
}
