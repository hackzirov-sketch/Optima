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
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';

import { UsersService } from '../../users/services/users.service';
import { MailService } from '../../mail/mail.service';
import { RedisService } from '../../../redis/redis.service';
import { ContentFilterService } from '../../moderation/services/content-filter.service';
import { RegisterDto } from '../schemas/register.schema';
import { LoginDto } from '../schemas/login.schema';
import { VerifyEmailDto } from '../schemas/verify-email.schema';
import { ResendVerificationDto } from '../schemas/resend-verification.schema';
import { SetPasswordDto } from '../schemas/set-password.schema';
import { ForgotPasswordDto } from '../schemas/forgot-password.schema';
import { ResetPasswordDto } from '../schemas/reset-password.schema';
import { ErrorCode } from '../../../common/enums/error-code.enum';

import { SecurityService } from './security.service';
import { TokenService } from './token.service';
import { DeviceService } from './device.service';
import { AuthRepository } from '../repositories/auth.repository';

function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

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
    private authRepository: AuthRepository,
  ) {}

  // ─────────────────────────────────────────────
  //  Email verification (Redis-native)
  // ─────────────────────────────────────────────

  /**
   * Issues a fresh verification attempt: a long unguessable `token` (the
   * actual lookup key — collision-proof at any scale) plus a short 6-digit
   * `code` (what the user reads out of their inbox and types in). Stored in
   * Redis with a 15-minute TTL. The email send is fire-and-forget: MailService
   * already swallows its own errors, and awaiting SMTP here would block the
   * HTTP response for as long as the mail server takes to answer (seconds to
   * ~90s when it's slow/unreachable) — the user would sit on a spinner for no
   * reason since the account is already created either way.
   */
  private async issueEmailVerification(userId: string, email: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const code = generateVerificationCode();

    await this.redisService.setEmailVerification(token, { userId, email, code });
    void this.mailService.sendVerificationEmail(email, code);

    return token;
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
      occupation: dto.occupation ?? null,
      isVerified: false,
      providers: ['local'],
      needsPasswordSetup: false,
    });

    this.enqueueOnRegister(user.id, user.email).catch((err) =>
      this.logger.warn(err),
    );

    const verifyToken = await this.issueEmailVerification(user.id, user.email);

    return {
      message: 'Registration successful. A verification code has been sent to your email.',
      userId: user.id,
      verifyToken,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const cooldown = await this.redisService.getEmailVerifyAttemptCooldown(dto.verifyToken);
    if (cooldown > 0) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: `Too many incorrect attempts. Please wait ${cooldown}s before trying again.`,
          retryAfter: cooldown,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const record = await this.redisService.getEmailVerification(dto.verifyToken);

    if (!record) {
      throw new BadRequestException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired verification token. Please request a new code.',
      });
    }

    if (record.code !== dto.code) {
      const attempts = await this.redisService.incrementEmailVerifyAttempts(dto.verifyToken);
      throw new BadRequestException({
        code: ErrorCode.TOKEN_INVALID,
        message: attempts >= 5
          ? 'Too many incorrect attempts. Please request a new code.'
          : 'Incorrect verification code.',
      });
    }

    const { user, needsPasswordSetup } = await this.authRepository.verifyAndActivateUser(
      record.userId,
    );

    await this.redisService.deleteEmailVerification(dto.verifyToken);

    user.isVerified = true;
    user.needsPasswordSetup = needsPasswordSetup;

    let setupToken: string | undefined;
    if (needsPasswordSetup) {
      setupToken = crypto.randomUUID();
      await this.redisService.setPasswordResetToken(setupToken, user.id);
    }

    const {
      accessToken,
      refreshToken,
      user: authUser,
    } = await this.tokenService.generateTokens(user);

    return {
      message: 'Email verified successfully',
      redirect: needsPasswordSetup ? '/set-password' : undefined,
      requiresPasswordSetup: needsPasswordSetup,
      setupToken,
      accessToken,
      refreshToken,
      user: authUser,
    };
  }

  /**
   * Rate limited two ways: a short cooldown between individual requests
   * (prevents "spam the resend button") and a hard daily cap per account
   * (prevents an attacker from running up email-provider costs / annoying a
   * real inbox all day using someone else's address). Both checks live in
   * Redis (see RedisService) and are independent of the per-IP AuthRateLimit
   * guard already applied at the controller level — defense in depth.
   */
  async resendVerification(dto: ResendVerificationDto) {
    const genericResponse = {
      message: 'If that email is registered and not yet verified, a new code has been sent.',
    };

    const user = await this.usersService.findByEmail(dto.email);
    // Same response whether or not the account exists / is already verified —
    // avoids leaking which emails are registered.
    if (!user || user.isVerified) {
      return genericResponse;
    }

    const limitCheck = await this.redisService.checkEmailVerifyResendLimit(user.id);
    if (limitCheck?.blocked) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message:
            limitCheck.reason === 'daily_cap'
              ? 'Daily resend limit reached. Please try again tomorrow or contact support.'
              : `Please wait ${limitCheck.retryAfter}s before requesting another code.`,
          retryAfter: limitCheck.retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const verifyToken = await this.issueEmailVerification(user.id, user.email);
    await this.redisService.markEmailVerifyResendSent(user.id);

    return { ...genericResponse, verifyToken };
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
      const verifyToken = await this.issueEmailVerification(user.id, user.email);
      throw new UnauthorizedException({
        code: ErrorCode.PASSWORD_SETUP_REQUIRED,
        message: 'This account was created using Google/GitHub. Verification code sent.',
        requiresPasswordSetup: true,
        verifyToken,
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

    if (!user.isVerified) {
      // Rate-limited internally (checkEmailVerifyResendLimit) — a burst of
      // failed logins against an unverified account won't spam their inbox.
      const limitCheck = await this.redisService.checkEmailVerifyResendLimit(user.id);
      let verifyToken: string | undefined;
      if (!limitCheck?.blocked) {
        verifyToken = await this.issueEmailVerification(user.id, user.email);
        await this.redisService.markEmailVerifyResendSent(user.id);
      }
      throw new UnauthorizedException({
        code: ErrorCode.PENDING_VERIFICATION,
        message: verifyToken
          ? 'Please verify your email address. A new code has been sent.'
          : 'Please verify your email address. Use the code already sent, or try resending shortly.',
        verifyToken,
        redirect: '/verify',
      });
    }

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
      const resetToken = crypto.randomBytes(32).toString('hex');
      const otp = generateVerificationCode(); // 6-digit code
      await this.redisService.setPasswordResetOtp(resetToken, user.id, otp);
      // Fire-and-forget — same reasoning as issueEmailVerification
      void this.mailService.sendPasswordResetOtpEmail(dto.email, otp);
      // Return resetToken so the frontend can pass it back on OTP verification.
      // This is NOT sensitive on its own — the OTP is required to use it.
      return {
        message: 'If an account exists, a reset code has been sent to your email.',
        resetToken,
      };
    }
    // Generic response — don't leak whether an email is registered
    return { message: 'If an account exists, a reset code has been sent to your email.' };
  }

  async verifyResetOtp(resetToken: string, otp: string) {
    const result = await this.redisService.verifyPasswordResetOtp(resetToken, otp);
    if (!result.ok) {
      if (result.reason === 'max_attempts') {
        throw new BadRequestException({
          code: ErrorCode.TOKEN_INVALID,
          message: 'Too many incorrect attempts. Please request a new reset code.',
        });
      }
      if (result.reason === 'invalid_token') {
        throw new BadRequestException({
          code: ErrorCode.TOKEN_INVALID,
          message: 'Invalid or expired reset code. Please request a new one.',
        });
      }
      throw new BadRequestException({
        code: ErrorCode.TOKEN_INVALID,
        message: result.attemptsLeft
          ? `Incorrect code. ${result.attemptsLeft} attempt(s) remaining.`
          : 'Incorrect code.',
        attemptsLeft: result.attemptsLeft,
      });
    }
    return {
      message: 'OTP verified. You may now set a new password.',
      confirmedToken: result.confirmedToken,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const userId = await this.redisService.getAndDeleteConfirmedResetToken(dto.confirmedToken);
    if (!userId) {
      throw new BadRequestException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired session. Please start the password reset again.',
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
}
