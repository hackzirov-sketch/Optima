import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';

import { UsersService } from '../../users/users.service';
import { MailService } from '../../mail/mail.service';
import { RedisService } from '../../../redis/redis.service';
import { ContentFilterService } from '../../moderation/services/content-filter.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { SetPasswordDto } from '../dto/set-password.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { User } from '../../../database/entities/user.entity';
import { USER_COLUMNS_SQL, mapUserRow } from '../../users/users.sql';

import { SecurityService } from './security.service';
import { TokenService } from './token.service';
import { DeviceService } from './device.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private mailService: MailService,
    private configService: ConfigService,
    private redisService: RedisService,
    private contentFilter: ContentFilterService,
    private securityService: SecurityService,
    private tokenService: TokenService,
    private deviceService: DeviceService,
    @InjectQueue('auth') private authQueue: Queue,
    private dataSource: DataSource,
  ) {}

  async verifyEmail(dto: VerifyEmailDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const verificationRows: Array<{
        id: string;
        userId: string;
        code: string;
        expiresAt: Date;
      }> = await queryRunner.query(
        `SELECT id, user_id AS "userId", code, expires_at AS "expiresAt"
         FROM user_verifications
         WHERE code = $1
         FOR UPDATE`,
        [dto.code],
      );
      const verification = verificationRows[0];

      if (!verification || verification.expiresAt < new Date()) {
        throw new BadRequestException({
          code: ErrorCode.TOKEN_INVALID,
          message: 'Invalid or expired verification code',
        });
      }

      const userRows: Array<User & { passwordHash: string | null }> = await queryRunner.query(
        `SELECT ${USER_COLUMNS_SQL}, password_hash AS "passwordHash"
         FROM users WHERE id = $1 FOR UPDATE`,
        [verification.userId],
      );
      const user = userRows[0] && mapUserRow(userRows[0]);
      if (!user) {
        throw new BadRequestException({
          code: ErrorCode.TOKEN_INVALID,
          message: 'Invalid or expired verification code',
        });
      }

      let setupToken: string | undefined;
      const needsPasswordSetup = !user.passwordHash;

      await Promise.all([
        queryRunner.query(
          `UPDATE users SET is_verified = true, needs_password_setup = $2, updated_at = now() WHERE id = $1`,
          [user.id, needsPasswordSetup],
        ),
        queryRunner.query(`DELETE FROM user_verifications WHERE user_id = $1`, [user.id]),
      ]);

      user.isVerified = true;
      user.needsPasswordSetup = needsPasswordSetup;

      if (needsPasswordSetup) {
        setupToken = crypto.randomUUID();
        await this.redisService.setPasswordResetToken(setupToken, user.id);
      }

      await queryRunner.commitTransaction();

      const {
        accessToken,
        refreshToken,
        user: authUser,
      } = await this.tokenService.generateTokens(user);

      return {
        message: 'Email verified successfully',
        redirect: !user.passwordHash ? '/set-password' : undefined,
        requiresPasswordSetup: !user.passwordHash,
        setupToken,
        accessToken,
        refreshToken,
        user: authUser,
      };
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  async register(dto: RegisterDto) {
    // Parallel: DB uniqueness checks + bcrypt hashing + content filter
    const [existingUser, existingUsername, passwordHash] = await Promise.all([
      this.usersService.findByEmail(dto.email),
      this.usersService.findByUsername(dto.username),
      this.securityService.hashPassword(dto.password),
    ]);

    if (existingUser) {
      throw new ConflictException({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
        message: 'Email already exists',
      });
    }
    if (existingUsername) {
      throw new ConflictException({
        code: ErrorCode.USERNAME_ALREADY_EXISTS,
        message: 'Username already taken',
      });
    }

    await Promise.all([
      this.contentFilter.filterText(dto.username, undefined, 'username'),
      this.contentFilter.filterText(
        [dto.firstName, dto.lastName].filter(Boolean).join(' '),
        undefined,
        'profile',
      ),
    ]);

    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      username: dto.username,
      email: dto.email,
      passwordHash,
      phoneNumber: dto.phoneNumber ?? null,
      // Email verification step removed — accounts are active immediately on signup.
      isVerified: true,
      providers: ['local'],
      needsPasswordSetup: false,
    });

    this.enqueueOnRegister(user.id, user.email).catch((err) =>
      this.logger.warn(err),
    );

    const { accessToken, refreshToken, user: authUser } =
      await this.tokenService.generateTokens(user, { provider: 'local' });

    return {
      message: 'Registration successful.',
      accessToken,
      refreshToken,
      user: authUser,
    };
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
    deviceName?: string,
  ) {
    // Step 1: Find user by email
    const user = await this.usersService.findByEmail(dto.email);

    if (!user) {
      // Constant-time response to prevent email enumeration
      await this.securityService.comparePassword(dto.password, '$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    if (!user.passwordHash) {
      void this.enqueueResendVerification(user.id, user.email);
      throw new UnauthorizedException({
        code: ErrorCode.PASSWORD_SETUP_REQUIRED,
        message: 'This account was created using Google/GitHub. Verification code sent.',
        requiresPasswordSetup: true,
        redirect: '/verify',
      });
    }

    // Step 2: Parallel — bcrypt + redis lockout check (saves ~100ms)
    const [isPasswordValid, lockoutTtl] = await Promise.all([
      this.securityService.comparePassword(dto.password, user.passwordHash),
      this.redisService.getAccountLockout(user.id),
    ]);

    if (lockoutTtl !== null) {
      throw new HttpException({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: `Account is temporarily locked. Try again in ${Math.ceil(lockoutTtl / 60)} minute(s).`,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!isPasswordValid) {
      // Fire-and-forget: don't block response on redis write
      this.redisService
        .incrementAccountLockoutFailures(user.id, 5, 900)
        .catch((e) => this.logger.warn(`lockout increment failed: ${e?.message}`));
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    // Email verification requirement removed — verified status no longer gates login.

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCOUNT_INACTIVE,
        message: 'Account is inactive',
      });
    }

    // Step 3: All async — none block the token generation
    // clearAccountLockout + logIpAddress + updateLastSeen all fire-and-forget
    this.redisService
      .clearAccountLockout(user.id)
      .catch((e) => this.logger.warn(`clearLockout failed: ${e?.message}`));

    if (ip) {
      void this.deviceService.logIpAddress(user.id, ip, userAgent || '', 'local');
    }

    void this.usersService.updateLastSeen(user.id);

    // Step 4: generateTokens — now only: enforceSessionLimit(1 CTE) + parallel JWT sign
    // persistRefreshToken is async inside generateTokens
    return this.tokenService.generateTokens(user, { ip, userAgent, deviceName, provider: 'local' });
  }

  async setPassword(userId: string | undefined, dto: SetPasswordDto, authHeader?: string) {
    let finalUserId: string | null | undefined = userId;

    if (!finalUserId && dto.setupToken) {
      finalUserId = await this.redisService.getAndDeletePasswordResetToken(dto.setupToken);
    }

    if (!finalUserId && authHeader?.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.substring(7).trim();
      const decodedId = await this.tokenService.verifyAccessToken(token);
      if (decodedId) finalUserId = decodedId;
    }

    if (!finalUserId) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Valid token required to set password',
      });
    }

    const user = await this.usersService.findById(finalUserId);
    if (!user) throw new UnauthorizedException();

    const passwordHash = await this.securityService.hashPassword(dto.password);

    const providers = user.providers || [];
    if (!providers.includes('local')) {
      providers.push('local');
    }

    await this.usersService.update(finalUserId, {
      passwordHash,
      providers,
      needsPasswordSetup: false,
    });

    return { message: 'Password set successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (user && user.isActive) {
      const token = crypto.randomUUID();
      await this.redisService.setPasswordResetToken(token, user.id);
      const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
      const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;
      await this.mailService.sendPasswordResetEmail(dto.email, resetUrl);
    }
    return { message: 'If an account exists, a reset email has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const userId = await this.redisService.getAndDeletePasswordResetToken(dto.token);
    if (!userId) {
      throw new BadRequestException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired reset token',
      });
    }

    const passwordHash = await this.securityService.hashPassword(dto.password);

    const user = await this.usersService.findById(userId);
    const providers = user?.providers || [];
    if (!providers.includes('local')) providers.push('local');

    await this.usersService.update(userId, {
      passwordHash,
      providers,
      needsPasswordSetup: false,
    });

    return { message: 'Password reset successfully' };
  }

  async enqueueOnRegister(userId: string, email: string): Promise<void> {
    try {
      await this.authQueue.add(
        'on-register',
        { userId, email },
        {
          jobId: `on-register_${userId}`,
          removeOnComplete: true,
          attempts: 3,
        },
      );
    } catch (error) {
      this.logger.warn(
        `BullMQ on-register failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private async enqueueResendVerification(
    userId: string,
    email: string,
  ): Promise<void> {
    try {
      await this.authQueue.add(
        'resend-verification',
        { userId, email },
        {
          jobId: `resend-verification_${userId}`,
          removeOnComplete: true,
          attempts: 2,
        },
      );
    } catch (error) {
      this.logger.warn(
        `BullMQ resend-verification failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
