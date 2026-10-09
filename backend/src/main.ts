import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { setupApp } from './bootstrap/app.bootstrap';
import { setupSwagger } from './bootstrap/swagger.bootstrap';
import { setupRedisAndWebSockets } from './bootstrap/redis.bootstrap';
import { setupValidation } from './bootstrap/validation.bootstrap';

setDefaultResultOrder('ipv4first');

function installProcessGuards(logger: Logger): void {
  process.on('unhandledRejection', (reason) => {
    logger.error(
      'Unhandled promise rejection',
      reason instanceof Error ? reason.stack : String(reason),
    );
  });

  process.on('uncaughtException', (err) => {
    logger.error(
      'Uncaught exception - shutting down',
      err instanceof Error ? err.stack : String(err),
    );

    process.exit(1);
  });
}

async function bootstrap() {
  const bootstrapLogger = new Logger('Bootstrap');

  installProcessGuards(bootstrapLogger);

  const isProd = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,

    /**
     * Buffer logs until nestjs-pino is attached below. `logger: false` must
     * not be used here: it silences module-scan / DI errors too, so a broken
     * module graph looked like the process "hanging" after start.
     */
    bufferLogs: true,

    /**
     * Throw init errors into bootstrap().catch instead of process.abort(),
     * so they are logged and the process exits with a readable stack.
     */
    abortOnError: false,
  });

  /**
   * Get Pino logger registered by LoggerConfigModule.
   */
  const pinoLogger = app.get(PinoLogger);

  /**
   * Replace Nest's default logger with Pino.
   */
  app.useLogger(pinoLogger);

  const config = app.get(ConfigService);

  setupApp(app, config);

  setupRedisAndWebSockets(app, config);

  setupValidation(app, config);

  if (!isProd) {
    setupSwagger(app, config);
  }

  app.enableShutdownHooks();

  const port = config.get<number>('app.port') || 3000;
  const prefix = config.get<string>('app.apiPrefix') || 'api/v1';

  await app.listen(port);

  bootstrapLogger.log(
    `🚀 UPZ API running on: http://localhost:${port}/${prefix}`,
  );

  if (!isProd) {
    bootstrapLogger.log(
      `📖 Swagger docs: http://localhost:${port}/${prefix}/docs`,
    );
  }
}

bootstrap().catch((err) => {
  const logger = new Logger('Bootstrap');

  logger.error(
    'Failed to start application',
    err instanceof Error ? err.stack : String(err),
  );

  process.exit(1);
});
