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
  /** Embeddable reader for an Open Library book with a public scan. */
  embedUrl: string | null;
  /** Plain text for the built-in reader (gb:* books, via /library/read). */
  textUrl: string | null;
  sourceUrl: string;
  source: 'openlibrary' | 'gutenberg';
  /** Whether it can be read here; Open Library lists many books it has no copy of. */
  readable: boolean;
}

/** Open Library language codes (MARC). */
const OL_LANGUAGE: Record<Exclude<LibraryLanguage, 'en'>, string> = {
  uz: 'uzb',
  ru: 'rus',
  tr: 'tur',
};
/** Open Library subject filters for the shelves. */
const OL_SUBJECT: Record<Exclude<LibrarySubject, 'all'>, string> = {
  fiction:
    'subject:(fiction OR novel OR "Uzbek fiction" OR "Russian fiction" OR "Turkish fiction")',
  history: 'subject:(history)',
  science:
    'subject:(science OR mathematics OR physics OR chemistry OR biology)',
  children: 'subject:(juvenile OR children OR "fairy tales")',
  poetry: 'subject:(poetry OR "Uzbek poetry" OR verse)',
  philosophy: 'subject:(philosophy OR ethics)',
  religion: 'subject:(religion OR islam)',
};
/** Uzbek classics and modern writers, as Open Library romanises them. */
const UZBEK_AUTHORS =
  'author:(Qodirii OR Oibek OR Navoi OR Chulpon OR "Gafur Gulom" OR Oripov OR Vohidov OR "Said Ahmad" OR "Tohir Malik" OR Hamza OR Qahhor OR "Pirimqul Qodirov" OR Muqimii OR Furqat OR Babur OR "Hamid Olimjon" OR Zulfiia OR Hoshimov)';
/** Titles in Arabic script are older Chagatai/Persian catalogue entries, not Uzbek literature. */
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F]/;
const OL_FIELDS =
  'key,title,author_name,cover_i,first_publish_year,ia,ebook_access,language,edition_count,subject';
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
const PAGE_SIZE = 24;
const BOOK_KEY = /^(ol|gb):[A-Za-z0-9._-]{1,120}$/;

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

  private readonly userAgent =
    process.env.OPENLIBRARY_USER_AGENT?.trim() ||
    'OptimaLibrary/1.0 (+https://optima.honeymedia.uz)';

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
      params.subject && params.subject in OL_SUBJECT ? params.subject : 'all';
    // Only letters, digits and spaces reach the search syntax.
    const q = (params.q ?? '')
      .normalize('NFKC')
      .replace(/[^\p{L}\p{N}\s'’-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);

    if (lang === 'en') return this.searchGutenberg(q, subject, page);

    const clauses = [`language:${OL_LANGUAGE[lang]}`];
    if (subject !== 'all') clauses.push(OL_SUBJECT[subject]);
    // The Uzbek shelf, unsearched and unfiltered, opens on Uzbek writers: by
    // language alone Open Library leads with translations (Shakespeare,
    // Dreiser) that merely have an Uzbek edition.
    if (lang === 'uz' && !q && subject === 'all') clauses.push(UZBEK_AUTHORS);
    if (q) {
      // Open Library romanises Uzbek the Library of Congress way (Qodiriĭ,
      // Ŭtkan kunlar, Oĭbek) and folds diacritics, so "Qodiriy" or
      // "O'tkan kunlar" only match once y→i, o'→u, g'→g. Free text doesn't
      // match those records at all — the author and title fields do.
      const romanised = q
        .replace(/[oO]['’ʻ`]/g, 'u')
        .replace(/[gG]['’ʻ`]/g, 'g')
        .replace(/['’ʻ`]/g, '')
        .replace(/y/g, 'i')
        .replace(/Y/g, 'I');
      const terms = [...new Set([q.replace(/['’ʻ`]/g, ''), romanised])];
      clauses.push(
        `(${terms.map((term) => `author:(${term}) OR title:(${term})`).join(' OR ')})`,
      );
    }
    const url = new URL('https://openlibrary.org/search.json');
    url.searchParams.set('q', clauses.join(' '));
    url.searchParams.set('fields', OL_FIELDS);
    // Most-published first: the classics a reader expects to see.
    url.searchParams.set('sort', 'editions');
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('page', String(page));

    const cacheKey = `library:ol:${createHash('sha1').update(url.toString()).digest('hex')}`;
    const cached = await this.cacheGet<{ total: number; items: LibraryBook[] }>(
      cacheKey,
    );
    const result = cached ?? (await this.fetchOpenLibrary(url));
    if (!cached && result.items.length)
      await this.cacheSet(cacheKey, result, 3600);
    return { ...result, page, hasMore: page * PAGE_SIZE < result.total };
  }

  private async fetchOpenLibrary(url: URL) {
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(20000),
        // Open Library asks API users to identify themselves (and gives
        // identified clients a higher rate limit).
        headers: { 'User-Agent': this.userAgent },
      });
    } catch (error) {
      this.logger.warn(`Open Library unreachable: ${(error as Error).message}`);
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
      numFound?: number;
      docs?: Array<Record<string, unknown>>;
    };
    return {
      total: Number(body.numFound ?? 0),
      items: (body.docs ?? [])
        .map((doc) => this.fromOpenLibrary(doc))
        .filter((book) => book.title && !ARABIC_SCRIPT.test(book.title)),
    };
  }

  private fromOpenLibrary(doc: Record<string, unknown>): LibraryBook {
    const list = (value: unknown) =>
      Array.isArray(value) ? value.map(String) : [];
    const workKey = String(doc.key ?? '').replace('/works/', '');
    const scan = doc.ebook_access === 'public' ? list(doc.ia)[0] : undefined;
    const coverId = doc.cover_i ? Number(doc.cover_i) : null;
    return {
      key: `ol:${workKey}`,
      id: workKey,
      title: String(doc.title ?? '').trim(),
      authors: list(doc.author_name).slice(0, 3),
      languages: list(doc.language).slice(0, 3),
      year: doc.first_publish_year ? String(doc.first_publish_year) : null,
      downloads: Number(doc.edition_count ?? 0),
      description: list(doc.subject).slice(0, 6).join(' · '),
      cover: coverId
        ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg`
        : '',
      embedUrl: scan
        ? `https://archive.org/embed/${encodeURIComponent(scan)}`
        : null,
      textUrl: null,
      sourceUrl: `https://openlibrary.org/works/${encodeURIComponent(workKey)}`,
      source: 'openlibrary',
      readable: Boolean(scan),
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
            readable: true,
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
    const [state] = await this.db.query<{
      likes: string;
      liked: boolean;
      saved: boolean;
    }>(
      `SELECT (SELECT count(*) FROM book_likes WHERE book_key = $1) AS likes,
              EXISTS (SELECT 1 FROM book_likes WHERE book_key = $1 AND user_id = $2) AS liked,
              EXISTS (SELECT 1 FROM book_saves WHERE book_key = $1 AND user_id = $2) AS saved`,
      [bookKey, userId],
    );
    return {
      count: Number(summary?.count ?? 0),
      average: summary?.average ? Number(summary.average) : null,
      likes: Number(state?.likes ?? 0),
      liked: Boolean(state?.liked),
      saved: Boolean(state?.saved),
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

  // ─── Saves & likes (stored per user, not in the browser) ─────

  async setLiked(bookKey: string, userId: string, liked: boolean) {
    this.assertKey(bookKey);
    await this.db.query(
      liked
        ? `INSERT INTO book_likes (user_id, book_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`
        : `DELETE FROM book_likes WHERE user_id = $1 AND book_key = $2`,
      [userId, bookKey],
    );
    const [row] = await this.db.query<{ likes: string }>(
      `SELECT count(*) AS likes FROM book_likes WHERE book_key = $1`,
      [bookKey],
    );
    return { liked, likes: Number(row?.likes ?? 0) };
  }

  /** `book` is the card as the client shows it — kept so "My books" needs no catalogue call. */
  async setSaved(
    bookKey: string,
    userId: string,
    saved: boolean,
    book?: unknown,
  ) {
    this.assertKey(bookKey);
    if (saved) {
      const snapshot = this.snapshot(bookKey, book);
      await this.db.query(
        `INSERT INTO book_saves (user_id, book_key, book) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, book_key) DO UPDATE SET book = EXCLUDED.book`,
        [userId, bookKey, snapshot],
      );
    } else {
      await this.db.query(
        `DELETE FROM book_saves WHERE user_id = $1 AND book_key = $2`,
        [userId, bookKey],
      );
    }
    return { saved };
  }

  /** Keys the reader liked or saved — the grid marks its cards from these. */
  async myMarks(userId: string) {
    const [liked, saved] = await Promise.all([
      this.db.query<{ key: string }>(
        `SELECT book_key AS key FROM book_likes WHERE user_id = $1`,
        [userId],
      ),
      this.db.query<{ key: string }>(
        `SELECT book_key AS key FROM book_saves WHERE user_id = $1`,
        [userId],
      ),
    ]);
    return {
      liked: liked.map((row) => row.key),
      saved: saved.map((row) => row.key),
    };
  }

  async listSaved(userId: string) {
    const rows = await this.db.query<{ book: LibraryBook }>(
      `SELECT book FROM book_saves WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [userId],
    );
    return rows.map((row) => row.book);
  }

  /** Only known fields, bounded, and links only to the sources we read from. */
  private snapshot(bookKey: string, raw: unknown): LibraryBook {
    const book = (raw ?? {}) as Partial<LibraryBook>;
    const text = (value: unknown, max: number) =>
      String(value ?? '').slice(0, max);
    const strings = (value: unknown) =>
      Array.isArray(value) ? value.slice(0, 3).map((v) => text(v, 120)) : [];
    const allowed = (value: unknown, hosts: string[]) => {
      try {
        const url = new URL(String(value ?? ''));
        return url.protocol === 'https:' && hosts.includes(url.hostname)
          ? url.toString()
          : null;
      } catch {
        return null;
      }
    };
    const [source, id] = bookKey.split(':') as ['ol' | 'gb', string];
    return {
      key: bookKey,
      id,
      title: text(book.title, 300) || bookKey,
      authors: strings(book.authors),
      languages: strings(book.languages),
      year: book.year ? text(book.year, 10) : null,
      downloads: Number(book.downloads) || 0,
      description: text(book.description, 600),
      cover:
        allowed(book.cover, [
          'covers.openlibrary.org',
          'www.gutenberg.org',
          'gutenberg.org',
        ]) ?? '',
      embedUrl: allowed(book.embedUrl, ['archive.org']),
      textUrl: allowed(book.textUrl, ['www.gutenberg.org', 'gutenberg.org']),
      sourceUrl:
        source === 'gb'
          ? `https://www.gutenberg.org/ebooks/${encodeURIComponent(id)}`
          : `https://openlibrary.org/works/${encodeURIComponent(id)}`,
      source: source === 'gb' ? 'gutenberg' : 'openlibrary',
      readable:
        source === 'gb' || Boolean(allowed(book.embedUrl, ['archive.org'])),
    };
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
