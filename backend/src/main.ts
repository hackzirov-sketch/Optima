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

// setDefaultResultOrder('ipv4first');

// function installProcessGuards(logger: Logger): void {
//   process.on('unhandledRejection', (reason) => {
//     logger.error(
//         'Unhandled promise rejection',
//         reason instanceof Error ? reason.stack : String(reason),
//     );
//   });
//
//   process.on('uncaughtException', (err) => {
//     logger.error(
//         'Uncaught exception - shutting down',
//         err instanceof Error ? err.stack : String(err),
//     );
//
//     process.exit(1);
//   });
// }

async function bootstrap() {
  console.log('BOOTSTRAP 2');

  // const bootstrapLogger = new Logger('Bootstrap');

  // installProcessGuards(bootstrapLogger);

  console.log('BOOTSTRAP 3');

  const isProd = process.env.NODE_ENV === 'production';

  console.log('BEFORE NEST FACTORY');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: false,
  });

  console.log('AFTER NEST FACTORY');

  /**
   * Get Pino logger registered by LoggerConfigModule.
   */
  console.log('BEFORE PINO');

  // const pinoLogger = app.get(PinoLogger);

  console.log('AFTER PINO');

  /**
   * Replace Nest's default logger with Pino.
   */
  // app.useLogger(pinoLogger);

  console.log('BEFORE CONFIG');

  const config = app.get(ConfigService);

  console.log('AFTER CONFIG');

  setupApp(app, config);

  console.log('AFTER setupApp');

  setupRedisAndWebSockets(app, config);

  console.log('AFTER setupRedisAndWebSockets');

  setupValidation(app, config);

  console.log('AFTER setupValidation');

  if (!isProd) {
    setupSwagger(app, config);

    console.log('AFTER setupSwagger');
  }

  app.enableShutdownHooks();

  // const port = config.get<number>('app.port') || 3000;
  // const prefix = config.get<string>('app.apiPrefix') || 'api/v1';
  const port = process.env.PORT || 3000;
  const prefix = process.env.API_PREFIX || '';
  console.log('BEFORE APP.LISTEN');

  await app.listen(port);

  console.log('AFTER APP.LISTEN');

  // bootstrapLogger.log(
  //     `🚀 UPZ API running on: http://localhost:${port}/${prefix}`,
  // );
  //
  // if (!isProd) {
  //   bootstrapLogger.log(
  //       `📖 Swagger docs: http://localhost:${port}/${prefix}/docs`,
  //   );
  // }
}

console.log('BEFORE BOOTSTRAP');

bootstrap().catch((err) => {
  // const logger = new Logger('Bootstrap');

  console.log(
      'Failed to start application',
      err instanceof Error ? err.stack : String(err),
  );

  process.exit(1);
});