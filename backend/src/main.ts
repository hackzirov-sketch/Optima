import 'dotenv/config';
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first'); // Render has no IPv6 outbound — force IPv4 for all DNS
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { setupApp } from './bootstrap/app.bootstrap';
import { setupSwagger } from './bootstrap/swagger.bootstrap';
import { setupRedisAndWebSockets } from './bootstrap/redis.bootstrap';
import { setupValidation } from './bootstrap/validation.bootstrap';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: isProd
      ? ['log', 'error', 'warn']
      : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  const config = app.get(ConfigService);

  setupApp(app, config);
  setupRedisAndWebSockets(app, config);
  setupValidation(app, config);
  setupSwagger(app, config);

  const port = config.get<number>('app.port') || 3000;
  const prefix = config.get<string>('app.apiPrefix') || 'api/v1';
  
  await app.listen(port);

  logger.log(`🚀 UPZ API running on: http://localhost:${port}/${prefix}`);
  logger.log(`📖 Swagger docs: http://localhost:${port}/${prefix}/docs`);
}
bootstrap();

