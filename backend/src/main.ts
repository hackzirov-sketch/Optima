import 'dotenv/config';
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first'); // Render has no IPv6 outbound — force IPv4 for all DNS
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import {
  ValidationPipe,
  ClassSerializerInterceptor,
  Logger,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: isProd
      ? ['log', 'error', 'warn']
      : ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  app.set('trust proxy', 1);

  const config = app.get(ConfigService);
  const prefix = config.get<string>('app.apiPrefix') || 'api/v1';
  const frontendUrl = config.get<string>('app.frontendUrl') || 'http://localhost:3001';

  // ── WebSocket Adapter (Socket.IO with CORS) ────────
  class CorsIoAdapter extends IoAdapter {
    createIOServer(port: number, options?: ServerOptions) {
      const server = super.createIOServer(port, {
        ...options,
        cors: {
          origin: [frontendUrl, 'http://localhost:3001', 'http://localhost:3000'],
          credentials: true,
        },
        transports: ['websocket', 'polling'],
      });
      return server;
    }
  }
  app.useWebSocketAdapter(new CorsIoAdapter(app));

  // ── Security ──────────────────────────────────────
  app.use(helmet());
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:3001', 'http://localhost:3000'],
    credentials: true,
  });

  // ── Global prefix ─────────────────────────────────
  app.setGlobalPrefix(prefix);

  // ── Validation ────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Serialization & response wrapping ────────────
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new ResponseInterceptor(),
  );

  // ── Exception Filters ─────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter(config));

  // ── Swagger ───────────────────────────────────────
  if (config.get('app.nodeEnv') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('UPZ API')
      .setDescription('Universal Productivity Zone — API Documentation')
      .setVersion('1.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .addTag('Auth')
      .addTag('Users')
      .addTag('Workspaces')
      .addTag('Groups')
      .addTag('Projects')
      .addTag('Tasks')
      .addTag('Pushes')
      .addTag('GitHub')
      .addTag('Chat')
      .addTag('Notifications')
      .addTag('Analytics')
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    // SwaggerModule.setup odatda global prefixni hisobga olmaydi, shuning uchun uni yo'lga qo'shamiz
    SwaggerModule.setup(`${prefix}/docs`, app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get<number>('app.port') || 3000;
  await app.listen(port);

  logger.log(`🚀 UPZ API running on: http://localhost:${port}/${prefix}`);
  logger.log(`📖 Swagger docs: http://localhost:${port}/${prefix}/docs`);
}
bootstrap();
