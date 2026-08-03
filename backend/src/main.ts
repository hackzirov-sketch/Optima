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

/**
 * Node aborts the process on an unhandled rejection by default. Plenty of
 * side-effect work here is deliberately fire-and-forget (presence broadcasts,
 * notification fan-out, cache writes) and any one of those rejecting — a Redis
 * blip is enough — would otherwise take the whole API down with it. Log and
 * keep serving instead; a background write failing is not a reason to drop
 * every in-flight request.
 *
 * uncaughtException is treated as fatal on purpose: process state is unknown
 * after one, so the honest response is to let the orchestrator restart us.
 */
function installProcessGuards(logger: Logger): void {
  process.on('unhandledRejection', (reason) => {
    logger.error(
      'Unhandled promise rejection',
      reason instanceof Error ? reason.stack : String(reason),
    );
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception — shutting down', err.stack);
    process.exit(1);
  });
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  installProcessGuards(logger);
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
  if (!isProd) {
    setupSwagger(app, config);
  }

  // Without this, SIGTERM kills the process outright and no OnModuleDestroy
  // ever runs — the pg pool and Redis connections are never closed, so every
  // deploy leaves the database holding connections it has to time out itself.
  app.enableShutdownHooks();

  const port = config.get<number>('app.port') || 3000;
  const prefix = config.get<string>('app.apiPrefix') || 'api/v1';

  await app.listen(port);

  logger.log(`🚀 UPZ API running on: http://localhost:${port}/${prefix}`);
  logger.log(`📖 Swagger docs: http://localhost:${port}/${prefix}/docs`);
}

bootstrap().catch((err) => {
  new Logger('Bootstrap').error(
    'Failed to start application',
    err instanceof Error ? err.stack : String(err),
  );
  process.exit(1);
});
