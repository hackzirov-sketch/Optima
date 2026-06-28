import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

export function setupApp(app: NestExpressApplication, config: ConfigService): void {
  app.set('trust proxy', 1);

  const frontendUrl = config.get<string>('app.frontendUrl') || 'http://localhost:3001';

  // Security
  app.use(helmet());
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
  });

  // Global prefix
  const prefix = config.get<string>('app.apiPrefix') || 'api/v1';
  app.setGlobalPrefix(prefix);
}
