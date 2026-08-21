import { randomUUID } from 'node:crypto';

import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('app.env');

        const isProduction = nodeEnv === 'production';

        return {
          pinoHttp: {
            level:
              configService.get<string>('app.logLevel') ??
              (isProduction ? 'info' : 'debug'),

            transport: isProduction ? undefined : { target: 'pino-pretty' },

            genReqId(req) {
              return req.headers['x-request-id'] ?? randomUUID();
            },

            /**
             * Sirlar logga tushmasligi uchun.
             */
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.refreshToken',
                'res.headers["set-cookie"]',
              ],
              censor: '[REDACTED]',
            },
          },
        };
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggerConfigModule {}
