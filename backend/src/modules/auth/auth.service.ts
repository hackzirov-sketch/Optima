import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { UsersService } from '../users/users.service';
import { RefreshToken } from '../../database/entities/refresh-token.entity';
import { UserSettings } from '../../database/entities/user-settings.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ErrorCode } from '../../common/enums/error-code.enum';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectRepository(RefreshToken)
    private refreshTokensRepository: Repository<RefreshToken>,
    @InjectRepository(UserSettings)
    private userSettingsRepository: Repository<UserSettings>,
  ) {}

  async register(dto: RegisterDto) {
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

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.usersService.create({
      fullName: dto.fullName,
      username: dto.username,
      email: dto.email,
      passwordHash,
    });

    // Create default settings
    const settings = this.userSettingsRepository.create({ userId: user.id });
    await this.userSettingsRepository.save(settings);

    return this.generateTokens(user);
  }

  async login(dto: LoginDto) {
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

    if (!user.isActive) {
      throw new UnauthorizedException({
        code: ErrorCode.ACCOUNT_INACTIVE,
        message: 'Account is inactive',
      });
    }

    await this.usersService.updateLastSeen(user.id);

    return this.generateTokens(user);
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

    // Revoke old token (token rotation)
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

    // Generate Refresh JWT
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get('jwt.refreshSecret'),
      expiresIn: this.configService.get('jwt.refreshExpires'),
    });

    // Save refresh token hash
    const expiresAt = new Date();
    const refreshExpiresStr = this.configService.get('jwt.refreshExpires') || '7d';
    const days = parseInt(refreshExpiresStr) || 7;
    expiresAt.setDate(expiresAt.getDate() + days);

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
