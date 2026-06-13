import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import ms from 'ms';
import { UAParser } from 'ua-parser-js';

import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { RedisService } from '../../redis/redis.service';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { UserSettings } from '../../database/entities/user-settings.entity';
import { UserIpLog } from '../../database/entities/user-ip-log.entity';
import { GithubAccount } from '../../database/entities/github-account.entity';
import { UserVerification } from '../../database/entities/user-verification.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private mailService: MailService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private redisService: RedisService,
    private encryptionService: EncryptionService,
    @InjectQueue('auth') private authQueue: Queue,
    @InjectRepository(RefreshToken)
    private refreshTokensRepository: Repository<RefreshToken>,
    @InjectRepository(UserSettings)
    private userSettingsRepository: Repository<UserSettings>,
    @InjectRepository(UserIpLog)
    private userIpLogsRepository: Repository<UserIpLog>,
    @InjectRepository(GithubAccount)
    private githubAccountsRepository: Repository<GithubAccount>,
    @InjectRepository(UserVerification)
    private userVerificationsRepository: Repository<UserVerification>,
  ) {}

  async logIpAddress(
    userId: string,
    ip: string,
    userAgent: string,
    provider: string = 'unknown',
  ) {
    const log = this.userIpLogsRepository.create({
      userId,
      ipAddress: ip,
      userAgent,
      provider,
    });
    await this.userIpLogsRepository.save(log);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const verification = await this.userVerificationsRepository.findOne({
      where: { code: dto.code },
      relations: ['user'],
    });

    if (!verification || verification.expiresAt < new Date()) {
      throw new BadRequestException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired verification code',
      });
    }

    const user = verification.user;

    const updateData: Partial<User> = { isVerified: true };
    if (!user.passwordHash) {
      updateData.needsPasswordSetup = true;
      user.needsPasswordSetup = true;
    }

    await this.usersService.update(user.id, updateData);
    await this.userVerificationsRepository.delete({ userId: user.id });

    // Generate tokens so user can proceed to set password or dashboard
    const {
      accessToken,
      refreshToken,
      user: authUser,
    } = await this.generateTokens(user);

    return {
      success: true,
      message: 'Email verified successfully',
      redirect: !user.passwordHash ? '/set-password' : undefined,
      requiresPasswordSetup: !user.passwordHash,
      accessToken,
      refreshToken,
      user: authUser,
    };
  }

  /**
   * Optimized for high-performance registration
   */
  async register(dto: RegisterDto) {
    // 1. Fast checks (In production, consider Redis caching for these checks)
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException({
        code: ErrorCode.EMAIL_ALREADY_EXISTS,
        message: 'Email already exists',
      });
    }

    const existingUsername = await this.usersService.findByUsername(
      dto.username,
    );
    if (existingUsername) {
      throw new ConflictException({
        code: ErrorCode.USERNAME_ALREADY_EXISTS,
        message: 'Username already taken',
      });
    }

    const bcryptRounds =
      this.configService.get<number>('app.bcryptRounds') ?? 12;
    const passwordHash = await bcrypt.hash(dto.password, bcryptRounds);

    // 3. Save core user only
    const user = await this.usersService.create({
      firstName: dto.firstName,
      lastName: dto.lastName,
      username: dto.username,
      email: dto.email,
      passwordHash,
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

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

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
      await this.logIpAddress(user.id, ip, userAgent || '', 'local');
    }

    await this.usersService.updateLastSeen(user.id);

    return this.generateTokens(user, ip, userAgent, deviceName, 'local');
  }

  async googleLogin(googleUser: any, ip?: string, userAgent?: string) {
    if (!googleUser) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Google authentication failed',
      });
    }

    let user = await this.usersService.findByEmail(googleUser.email);

    if (!user) {
      const username =
        googleUser.email.split('@')[0] + Math.floor(Math.random() * 1000);
      user = await this.usersService.create({
        email: googleUser.email,
        firstName: googleUser.firstName || googleUser.email.split('@')[0],
        lastName: googleUser.lastName || '',
        username,
        avatarUrl: googleUser.picture,
        isVerified: true,
        passwordHash: null,
        providers: ['google'],
        needsPasswordSetup: true,
      });

      await this.enqueueOnRegister(user.id, user.email);
    }

    if (ip) {
      await this.logIpAddress(user.id, ip, userAgent || '', 'google');
    }

    await this.usersService.updateLastSeen(user.id);

    return this.generateTokens(user, ip, userAgent, undefined, 'google');
  }

  async githubLogin(githubUser: any, ip?: string, userAgent?: string) {
    if (!githubUser) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'GitHub authentication failed',
      });
    }

    let githubAccount = await this.githubAccountsRepository.findOne({
      where: { githubUserId: githubUser.githubId },
      relations: ['user'],
    });

    let user: User | null = null;

    if (githubAccount) {
      user = githubAccount.user;
      githubAccount.accessTokenEncrypted = this.encryptionService.encrypt(
        githubUser.accessToken,
      );
      if (githubUser.refreshToken) {
        githubAccount.refreshTokenEncrypted = this.encryptionService.encrypt(
          githubUser.refreshToken,
        );
      }
      await this.githubAccountsRepository.save(githubAccount);
    } else {
      user = await this.usersService.findByEmail(githubUser.email);

      if (!user) {
        user = await this.usersService.create({
          email: githubUser.email,
          firstName: githubUser.firstName || githubUser.email.split('@')[0],
          lastName: githubUser.lastName || '',
          username: githubUser.username,
          avatarUrl: githubUser.avatarUrl,
          isVerified: true,
          passwordHash: null,
          providers: ['github'],
          needsPasswordSetup: true,
        });

        await this.enqueueOnRegister(user.id, user.email);
      }

      githubAccount = this.githubAccountsRepository.create({
        userId: user.id,
        githubUserId: githubUser.githubId,
        username: githubUser.username,
        email: githubUser.email,
        avatarUrl: githubUser.avatarUrl,
        accessTokenEncrypted: this.encryptionService.encrypt(
          githubUser.accessToken,
        ),
        refreshTokenEncrypted: githubUser.refreshToken
          ? this.encryptionService.encrypt(githubUser.refreshToken)
          : undefined,
      });
      await this.githubAccountsRepository.save(githubAccount);
    }

    if (user && ip) {
      await this.logIpAddress(user.id, ip, userAgent || '', 'github');
    }

    if (user) {
      await this.usersService.updateLastSeen(user.id);
      return this.generateTokens(user, ip, userAgent, undefined, 'github');
    } else {
      throw new UnauthorizedException('Failed to link or create user');
    }
  }

  async setPassword(userId: string, dto: SetPasswordDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedException();

    const bcryptRounds =
      this.configService.get<number>('app.bcryptRounds') ?? 12;
    const passwordHash = await bcrypt.hash(dto.password, bcryptRounds);

    const providers = user.providers || [];
    if (!providers.includes('local')) {
      providers.push('local');
    }

    await this.usersService.update(userId, {
      passwordHash,
      providers,
      needsPasswordSetup: false,
    });

    return {
      success: true,
      message: 'Password set successfully',
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const storedToken = await this.refreshTokensRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      new Date() > storedToken.expiresAt
    ) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired refresh token',
      });
    }

    // Revoke old token
    storedToken.revokedAt = new Date();
    await this.refreshTokensRepository.save(storedToken);

    // Issue new token, keeping same IP/UA so session continuity is maintained
    return this.generateTokens(
      storedToken.user,
      storedToken.ipAddress ?? undefined,
      storedToken.userAgent ?? undefined,
      storedToken.deviceName ?? undefined,
      storedToken.provider ?? 'jwt-refresh',
    );
  }

  async logout(refreshToken: string, accessToken?: string) {
    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    await this.refreshTokensRepository.update(
      { tokenHash },
      { revokedAt: new Date(), isDeleted: true },
    );

    if (accessToken) {
      try {
        const secret = this.configService.get<string>('jwt.accessSecret');
        const decoded = this.jwtService.verify<{ jti?: string; exp?: number }>(
          accessToken,
          { secret },
        );
        if (decoded?.jti && decoded?.exp) {
          const ttl = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
          await this.redisService.blacklistAccessToken(decoded.jti, ttl);
        }
      } catch {
        // ignore malformed access token on logout
      }
    }
  }

  async getSessions(userId: string) {
    const sessions = await this.refreshTokensRepository.find({
      where: { userId, revokedAt: IsNull(), isDeleted: false },
      order: { lastUsedAt: 'DESC' },
    });
    
    return sessions.map(s => ({
      id: s.id,
      deviceName: s.deviceName,
      browser: s.deviceInfo?.browser,
      os: s.deviceInfo?.os,
      ipAddress: s.ipAddress,
      location: s.location,
      lastUsedAt: s.lastUsedAt,
      createdAt: s.createdAt,
      provider: s.provider,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.refreshTokensRepository.findOne({
      where: { id: sessionId, userId, isDeleted: false },
    });
    if (!session) {
      throw new BadRequestException('Session not found or already revoked');
    }
    
    session.revokedAt = new Date();
    session.isDeleted = true;
    await this.refreshTokensRepository.save(session);
    return { success: true, message: 'Session revoked successfully' };
  }

  async revokeAllSessions(userId: string) {
    await this.refreshTokensRepository.update(
      { userId, isDeleted: false },
      { revokedAt: new Date(), isDeleted: true },
    );
    return { success: true, message: 'All sessions revoked successfully' };
  }

  private async generateTokens(
    user: User,
    ip?: string,
    userAgent?: string,
    deviceName?: string,
    provider?: string,
  ) {
    // ── MAX 5 active sessions per account ──────────────────────────────
    const activeCount = await this.refreshTokensRepository.count({
      where: {
        userId: user.id,
        revokedAt: IsNull(),
        isDeleted: false,
      },
    });
    if (activeCount >= 5) {
      // Revoke the oldest active session to enforce the 5-device limit
      const oldest = await this.refreshTokensRepository.find({
        where: {
          userId: user.id,
          revokedAt: IsNull(),
          isDeleted: false,
        },
        order: { createdAt: 'ASC' },
        take: 1,
      });
      if (oldest.length > 0) {
        oldest[0].revokedAt = new Date();
        await this.refreshTokensRepository.save(oldest[0]);
      }
    }

    const jti = crypto.randomUUID();
    const payload = { sub: user.id, email: user.email, jti };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpires'),
    } as any);

    const refreshExpires =
      this.configService.get<string>('jwt.refreshExpires') || '7d';
    const expiresAt = new Date(Date.now() + ms(refreshExpires as any));

    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    let browser: string | undefined;
    let os: string | undefined;
    let deviceNameDerived = deviceName;

    if (userAgent) {
      const parser = new UAParser(userAgent);
      const res = parser.getResult();
      browser = res.browser.name ? `${res.browser.name} ${res.browser.version || ''}`.trim() : undefined;
      os = res.os.name ? `${res.os.name} ${res.os.version || ''}`.trim() : undefined;
      
      if (!deviceNameDerived) {
        if (res.device.vendor && res.device.model) {
          deviceNameDerived = `${res.device.vendor} ${res.device.model}`;
        } else if (res.os.name) {
          deviceNameDerived = res.os.name;
        } else {
          deviceNameDerived = 'Unknown Device';
        }
      }
    }

    const refreshTokenEntity = this.refreshTokensRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: ip ?? null,
      userAgent: userAgent ?? null,
      deviceName: deviceNameDerived ?? null,
      deviceInfo: { browser, os },
      provider: provider ?? null,
      lastUsedAt: new Date(),
      isDeleted: false,
    });
    await this.refreshTokensRepository.save(refreshTokenEntity);

    return {
      success: true,
      requiresPasswordSetup: user.needsPasswordSetup,
      accessToken,
      refreshToken,
      user,
    };
  } // end generateTokens

  // ── Password reset ────────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (user && user.isActive) {
      const token = crypto.randomUUID();
      await this.redisService.setPasswordResetToken(token, user.id);
      const frontendUrl = this.getFrontendUrl();
      const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;
      await this.mailService.sendPasswordResetEmail(dto.email, resetUrl);
    }
    // Always return success to prevent email enumeration
    return { success: true, message: 'If an account exists, a reset email has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const userId = await this.redisService.getAndDeletePasswordResetToken(dto.token);
    if (!userId) {
      throw new BadRequestException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired reset token',
      });
    }

    const bcryptRounds = this.configService.get<number>('app.bcryptRounds') ?? 12;
    const passwordHash = await bcrypt.hash(dto.password, bcryptRounds);

    const user = await this.usersService.findById(userId);
    const providers = user?.providers || [];
    if (!providers.includes('local')) providers.push('local');

    await this.usersService.update(userId, {
      passwordHash,
      providers,
      needsPasswordSetup: false,
    });

    return { success: true, message: 'Password reset successfully' };
  }

  // ── OAuth session code helpers ────────────────────────────────────────────
  // Instead of putting tokens in the redirect URL (visible in browser history,
  // server logs, referrer headers), we store them in Redis behind a short-lived
  // one-time code and only put the code in the URL.

  getFrontendUrl(): string {
    return (
      this.configService.get<string>('app.frontendUrl') ||
      process.env.FRONTEND_URL ||
      'http://localhost:3001'
    );
  }

  async createOAuthSessionCode(
    accessToken: string,
    refreshToken: string,
  ): Promise<string> {
    const code = crypto.randomUUID();
    await this.redisService.setOAuthCode(code, { accessToken, refreshToken });
    return code;
  }

  async exchangeOAuthSessionCode(code: string) {
    const data = await this.redisService.getAndDeleteOAuthCode(code);
    if (!data) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired session code',
      });
    }
    return {
      success: true,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
  }

  /** Settings bootstrap — deduped per user via stable job id. */
  private async enqueueOnRegister(userId: string, email: string): Promise<void> {
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

  /** Verification resend — cooldown handled in AuthProcessor. */
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
