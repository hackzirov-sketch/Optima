import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

export function setupRedisAndWebSockets(
  app: INestApplication,
  config: ConfigService,
): void {
  const frontendUrl =
    config.get<string>('app.frontendUrl') || 'http://localhost:3001';
  const isProduction = config.get<string>('app.nodeEnv') === 'production';
  const allowedOrigins = isProduction
    ? [frontendUrl]
    : [frontendUrl, 'http://localhost:3001', 'http://localhost:3000'];

  class CorsIoAdapter extends IoAdapter {
    createIOServer(port: number, options?: ServerOptions) {
      const server = super.createIOServer(port, {
        ...options,
        cors: {
          origin: allowedOrigins,
          credentials: true,
        },
        transports: ['websocket', 'polling'],
      });
      return server;
    }
  }

  app.useWebSocketAdapter(new CorsIoAdapter(app));
}
