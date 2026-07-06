import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { AuthService } from './services/auth.service';
import { OAuthService } from './services/oauth.service';
import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import { DeviceService } from './services/device.service';
import { SecurityService } from './services/security.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { EncryptionService } from '../../common/services/encryption.service';
import { AuthProcessor } from './processors/auth.processor';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [
    UsersModule,
    MailModule,
    ModerationModule,
    PassportModule,
    // ── Register Auth Queue ────────────────────────
    BullModule.registerQueue({
      name: 'auth',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) =>
        ({
          secret: configService.get<string>('jwt.accessSecret'),
          signOptions: {
            expiresIn: configService.get<string>('jwt.accessExpires'),
          },
        }) as any,
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OAuthService,
    TokenService,
    SessionService,
    DeviceService,
    SecurityService,
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleStrategy,
    GithubStrategy,
    EncryptionService,
    AuthProcessor, // Worker to handle background tasks
  ],
  exports: [AuthService, OAuthService, TokenService, SessionService, EncryptionService],
})
export class AuthModule {}
