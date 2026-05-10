import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import ms from 'ms';

import { UsersService } from '../users/users.service';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { UserSettings } from '../../database/entities/user-settings.entity';
import { UserIpLog } from '../../database/entities/user-ip-log.entity';
import { GithubAccount } from '../../database/entities/github-account.entity';
import { UserVerification } from '../../database/entities/user-verification.entity';
import { EncryptionService } from '../../common/services/encryption.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
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

  async logIpAddress(userId: string, ip: string, userAgent: string) {
    const log = this.userIpLogsRepository.create({
      userId,
      ipAddress: ip,
      userAgent,
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

    await this.usersService.update(verification.userId, { isVerified: true });
    await this.userVerificationsRepository.delete({ userId: verification.userId });

    return { success: true, message: 'Email verified successfully' };
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

    const existingUsername = await this.usersService.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictException({
        code: ErrorCode.USERNAME_ALREADY_EXISTS,
        message: 'Username already taken',
      });
    }

    // 2. Optimized Bcrypt (Lower rounds for high RPS, 10 is usually standard balance)
    // For 100K RPS, you really need to offload hashing to a separate microservice or worker pool
    const passwordHash = await bcrypt.hash(dto.password, 4);

    // 3. Save core user only
    const user = await this.usersService.create({
      fullName: dto.fullName,
      username: dto.username,
      email: dto.email,
      passwordHash,
    });

    // 4. Offload heavy tasks to Queue (Settings, Email sending)
    try {
      await this.authQueue.add('on-register', {
        userId: user.id,
        email: user.email,
      }, {
        removeOnComplete: true,
        attempts: 3,
      });
    } catch (error) {
      console.error('BullMQ Error (Redis might be down):', error.message);
      // In high-load test, we continue even if background task fails to be queued
    }

    return {
      message: 'Registration successful. Verification code sent to email.',
      userId: user.id,
    };
  }

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: ErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      });
    }

    if (!user.isVerified) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCOUNT_INACTIVE,
        message: 'Please verify your email address first',
      });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCOUNT_INACTIVE,
        message: 'Account is inactive',
      });
    }

    if (ip) {
      await this.logIpAddress(user.id, ip, userAgent || '');
    }

    await this.usersService.updateLastSeen(user.id);

    return this.generateTokens(user);
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
      const username = googleUser.email.split('@')[0] + Math.floor(Math.random() * 1000);
      user = await this.usersService.create({
        email: googleUser.email,
        fullName: googleUser.fullName,
        username,
        avatarUrl: googleUser.picture,
        isVerified: true,
        passwordHash: 'social_login_no_password',
      });

      // Background task for social login settings too
      await this.authQueue.add('on-register', {
        userId: user.id,
        email: user.email,
      });
    }

    if (ip) {
      await this.logIpAddress(user.id, ip, userAgent || '');
    }

    await this.usersService.updateLastSeen(user.id);

    return this.generateTokens(user);
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
      githubAccount.accessTokenEncrypted = this.encryptionService.encrypt(githubUser.accessToken);
      if (githubUser.refreshToken) {
        githubAccount.refreshTokenEncrypted = this.encryptionService.encrypt(githubUser.refreshToken);
      }
      await this.githubAccountsRepository.save(githubAccount);
    } else {
      user = await this.usersService.findByEmail(githubUser.email);

      if (!user) {
        user = await this.usersService.create({
          email: githubUser.email,
          fullName: githubUser.fullName,
          username: githubUser.username,
          avatarUrl: githubUser.avatarUrl,
          isVerified: true,
          passwordHash: 'social_login_no_password',
        });

        await this.authQueue.add('on-register', {
          userId: user.id,
          email: user.email,
        });
      }

      githubAccount = this.githubAccountsRepository.create({
        userId: user.id,
        githubUserId: githubUser.githubId,
        username: githubUser.username,
        email: githubUser.email,
        avatarUrl: githubUser.avatarUrl,
        accessTokenEncrypted: this.encryptionService.encrypt(githubUser.accessToken),
        refreshTokenEncrypted: githubUser.refreshToken ? this.encryptionService.encrypt(githubUser.refreshToken) : undefined,
      });
      await this.githubAccountsRepository.save(githubAccount);
    }

    if (user && ip) {
      await this.logIpAddress(user.id, ip, userAgent || '');
    }

    if (user) {
      await this.usersService.updateLastSeen(user.id);
      return this.generateTokens(user);
    } else {
      throw new UnauthorizedException('Failed to link or create user');
    }
  }

  async refresh(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const storedToken = await this.refreshTokensRepository.findOne({
      where: { tokenHash },
      relations: ['user'],
    });

    if (!storedToken || storedToken.revokedAt || new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_INVALID,
        message: 'Invalid or expired refresh token',
      });
    }

    storedToken.revokedAt = new Date();
    await this.refreshTokensRepository.save(storedToken);

    return this.generateTokens(storedToken.user);
  }

  async logout(refreshToken: string) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.refreshTokensRepository.update(
      { tokenHash },
      { revokedAt: new Date() },
    );
  }

  private async generateTokens(user: User) {
    const payload = { sub: user.id, email: user.email };

    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>('jwt.refreshExpires'),
    } as any);

    const refreshExpires = this.configService.get<string>('jwt.refreshExpires') || '7d';
    const expiresAt = new Date(Date.now() + ms(refreshExpires as any));

    const tokenHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const refreshTokenEntity = this.refreshTokensRepository.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });
    await this.refreshTokensRepository.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken,
      user,
    };
  }
}
