import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import * as path from 'path';
import type { Request } from 'express';
import { requestContext } from '../common/context/request-context';

export function setupApp(
  app: NestExpressApplication,
  config: ConfigService,
): void {
  app.set('trust proxy', 1);

  const frontendUrl =
    config.get<string>('app.frontendUrl') || 'http://localhost:3001';
  const isProduction = config.get<string>('app.nodeEnv') === 'production';
  const allowedOrigins = isProduction
    ? [frontendUrl]
    : [frontendUrl, 'http://localhost:3001', 'http://localhost:3000'];

  // Security
  app.use(
    helmet({
      // Two years, subdomains included, preload-eligible. helmet's default is
      // ~6 months without preload; the header is a no-op over plain HTTP, so
      // this only takes effect where it should. Auth lives in cookies, and a
      // single downgraded request is enough to leak one.
      hsts: {
        maxAge: 63072000,
        includeSubDomains: true,
        preload: true,
      },
      // The API returns JSON, never a document — the frame/script directives
      // that matter for a page don't apply, but denying everything by default
      // means a browser coaxed into rendering a response can't load anything
      // from it.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      // Don't leak API paths (which embed ids) to third-party hosts.
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  // JSON responses and chat history compress extremely well — a message page
  // is repetitive text. Placed before the route handlers so every response
  // goes through it. The 1 KB threshold keeps tiny payloads (most auth
  // responses) from paying the CPU cost for no gain.
  app.use(compression({ threshold: 1024 }));
  // Auth now lives in httpOnly cookies (not localStorage) — needed to read
  // them off incoming requests (req.cookies) in the JWT strategies below.
  app.use(cookieParser());
  // Every request runs inside its own context (see common/context).
  app.use((req: Request, _res: unknown, next: () => void) => requestContext.run(req, next));
  app.useStaticAssets(path.resolve(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Global prefix
  const prefix = config.get<string>('app.apiPrefix') || 'api/v1';
  app.setGlobalPrefix(prefix);
}
