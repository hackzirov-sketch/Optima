import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as path from 'path';

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
  app.use(helmet());
  // Auth now lives in httpOnly cookies (not localStorage) — needed to read
  // them off incoming requests (req.cookies) in the JWT strategies below.
  app.use(cookieParser());
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
