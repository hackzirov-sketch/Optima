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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';

import { UsersService } from '../../users/users.service';
import { MailService } from '../../mail/mail.service';
import { RedisService } from '../../../redis/redis.service';
import { ContentFilterService } from '../../moderation/services/content-filter.service';
import { UserVerification } from '../../../database/entities/user-verification.entity';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { VerifyEmailDto } from '../dto/verify-email.dto';
import { SetPasswordDto } from '../dto/set-password.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ErrorCode } from '../../../common/enums/error-code.enum';
import { User } from '../../../database/entities/user.entity';

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
    @InjectRepository(UserVerification)
    private userVerificationsRepository: Repository<UserVerification>,
    private dataSource: DataSource,
  ) {}

  async verifyEmail(dto: VerifyEmailDto) {
    return this.dataSource.transaction(async (manager) => {
      // Lock only the UserVerification row (no JOIN to avoid PostgreSQL "FOR UPDATE cannot be applied to nullable side of outer join")
      const verification = await manager.findOne(UserVerification, {
        where: { code: dto.code },
        lock: { mode: 'pessimistic_write' },
      });

      if (!verification || verification.expiresAt < new Date()) {
        throw new BadRequestException({
          code: ErrorCode.TOKEN_INVALID,
          message: 'Invalid or expired verification code',
        });
      }

      // Load user separately after lock is acquired
      const user = await manager.findOne(User, { where: { id: verification.userId } });
      if (!user) {
        throw new BadRequestException({
          code: ErrorCode.TOKEN_INVALID,
          message: 'Invalid or expired verification code',
        });
      }

      const updateData: Partial<User> = { isVerified: true };
      let setupToken: string | undefined;

      if (!user.passwordHash) {
        updateData.needsPasswordSetup = true;
        user.needsPasswordSetup = true;
        setupToken = crypto.randomUUID();
        await this.redisService.setPasswordResetToken(setupToken, user.id);
      }

      await manager.update(User, user.id, updateData);
      await manager.delete(UserVerification, { userId: user.id });

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
    });
  }

  async register(dto: RegisterDto) {
    // Parallel: DB uniqueness checks + bcrypt hashing (independent operations)
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

    // Parallel: content filter checks (independent)
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
      isVerified: false,
      providers: ['local'],
      needsPasswordSetup: false,
    });

    await this.enqueueOnRegister(user.id, user.email);

    return {
      message: 'Registration successful. Verification code sent to email.',
      userId: user.id,
    };
  }

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
    deviceName?: string,
  ) {
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
      await this.enqueueResendVerification(user.id, user.email);

      throw new UnauthorizedException({
        code: ErrorCode.PASSWORD_SETUP_REQUIRED,
        message:
          'This account was created using Google/GitHub. Verification code sent.',
        requiresPasswordSetup: true,
        redirect: '/verify',
      });
    }

    // Parallel: bcrypt compare + Redis lockout check (independent operations, saves ~80ms)
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
      await this.redisService.incrementAccountLockoutFailures(user.id, 5, 900); // 5 attempts -> 15 min lock
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    await this.redisService.clearAccountLockout(user.id);

    if (!user.isVerified) {
      await this.enqueueResendVerification(user.id, user.email);

      throw new UnauthorizedException({
        code: ErrorCode.PENDING_VERIFICATION,
        message: 'Please verify your email address. A new code has been sent.',
        redirect: '/verify',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCOUNT_INACTIVE,
        message: 'Account is inactive',
      });
    }

    if (ip) {
      await this.deviceService.logIpAddress(user.id, ip, userAgent || '', 'local');
    }

    await this.usersService.updateLastSeen(user.id);

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
