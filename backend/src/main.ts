import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, ClassSerializerInterceptor } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,  // GitHub webhook signature verification uchun
  });

  const config = app.get(ConfigService);

  // ── Security ──────────────────────────────────────
  app.use(helmet());
  app.enableCors({
    origin: config.get('FRONTEND_URL'),
    credentials: true,
  });

  // ── Global prefix ─────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Validation ────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,          // extra fieldlarni tashlaydi
      forbidNonWhitelisted: true,
      transform: true,          // DTO type casting
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Serialization (exclude: password_hash va hokazo) ─
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector))
  );

  // ── Swagger ───────────────────────────────────────
  if (config.get('NODE_ENV') !== 'production') {
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
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  const Reflex = process.env.API_PREFIX;
  console.log(`🚀 UPZ API running on: http://localhost:${port}/${Reflex}`);
  console.log(`📖 Swagger docs: http://localhost:${port}/${Reflex}/docs`);
  console.log(`Environment: ${Reflex}`);
}
bootstrap();
