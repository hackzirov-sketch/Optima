import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

export function setupSwagger(app: INestApplication, config: ConfigService): void {
  // if (config.get('app.nodeEnv') === 'production') return;

  const prefix = config.get<string>('app.apiPrefix') || 'api/v1';

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
    .addTag('Meetings')
    .addTag('Notifications')
    .addTag('Analytics')
    .addTag('Storage', 'Cloudinary file upload (sign → upload → save URL)')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}
