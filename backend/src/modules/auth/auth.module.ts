import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { UserSettings } from '../../database/entities/user-settings.entity';
import { UserIpLog } from '../../database/entities/user-ip-log.entity';
import { GithubAccount } from '../../database/entities/github-account.entity';
import { UserVerification } from '../../database/entities/user-verification.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { GithubStrategy } from './strategies/github.strategy';
import { EncryptionService } from '../../common/services/encryption.service';
import { AuthProcessor } from './processors/auth.processor';

@Module({
  imports: [
    UsersModule,
    MailModule,
    PassportModule,
    // ── Register Auth Queue ────────────────────────
    BullModule.registerQueue({
      name: 'auth',
    }),
    TypeOrmModule.forFeature([
      RefreshToken,
      UserSettings,
      UserIpLog,
      GithubAccount,
      UserVerification,
    ]),
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
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleStrategy,
    GithubStrategy,
    EncryptionService,
    AuthProcessor, // Worker to handle background tasks
  ],
  exports: [AuthService, EncryptionService],
})
export class AuthModule {}
