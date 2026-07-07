import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Ip,
  Headers,
  Param,
  Delete,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '../../common/enums/error-code.enum';

import { AuthService } from './services/auth.service';
import { OAuthService } from './services/oauth.service';
import { TokenService } from './services/token.service';
import { SessionService } from './services/session.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from '../../common/decorators/public.decorator';

import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard';
import { AuthRateLimit } from './decorators/auth-rate-limit.decorator';

@ApiTags('Auth')
@SkipThrottle() // Auth routes use AuthRateLimitGuard — global ThrottlerGuard skipped (saves 3 Redis calls/req)
@Controller('auth')
@UseGuards(AuthRateLimitGuard)
export class AuthController {
  constructor(
    private authService: AuthService,
    private oauthService: OAuthService,
    private tokenService: TokenService,
    private sessionService: SessionService,
    private configService: ConfigService,
  ) {}

  @Public()
  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Set password for social login accounts or new users' })
  async setPassword(
    @Req() req,
    @Body() dto: SetPasswordDto,
    @Headers('authorization') authHeader?: string
  ) {
    return this.authService.setPassword(req.user?.id, dto, authHeader);
  }

  @Public()
  @Post('register')
  @AuthRateLimit({ action: 'register', maxAttempts: 3, windowSeconds: 3600, blockSeconds: 86400 })
  @ApiOperation({ summary: 'Register a new user and send verification email' })
  async register(@Req() req, @Body() dto: RegisterDto) {
    const result = await this.authService.register(dto);
    await req.clearRateLimit?.();
    return result;
  }

  @Public()
  @Post('verify-email')
  @AuthRateLimit({ action: 'verify-email', maxAttempts: 10, windowSeconds: 60, blockSeconds: 1800 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address with verifyToken + 6-digit code' })
  async verifyEmail(@Req() req, @Body() dto: VerifyEmailDto) {
    const result = await this.authService.verifyEmail(dto);
    await req.clearRateLimit?.();
    return result;
  }

  @Public()
  @Post('resend-verification')
  @AuthRateLimit({ action: 'resend-verification', maxAttempts: 5, windowSeconds: 3600, blockSeconds: 3600 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the email verification code' })
  async resendVerification(@Req() req, @Body() dto: ResendVerificationDto) {
    const result = await this.authService.resendVerification(dto);
    await req.clearRateLimit?.();
    return result;
  }

  @Public()
  @Post('login')
  @AuthRateLimit({ action: 'login', maxAttempts: 5, windowSeconds: 60, blockSeconds: 900 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user and return tokens' })
  async login(
    @Req() req,
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const result = await this.authService.login(dto, ip, userAgent);
    await req.clearRateLimit?.();
    return result;
  }

  @Public()
  @Post('forgot-password')
  @AuthRateLimit({ action: 'forgot-password', maxAttempts: 5, windowSeconds: 600, blockSeconds: 600 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset email' })
  async forgotPassword(@Req() req, @Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto);
    await req.clearRateLimit?.();
    return result;
  }

  @Public()
  @Post('reset-password')
  @AuthRateLimit({ action: 'reset-password', maxAttempts: 5, windowSeconds: 3600, blockSeconds: 3600 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using one-time token from email' })
  async resetPassword(@Req() req, @Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);
    await req.clearRateLimit?.();
    return result;
  }

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Login with Google' })
  async googleAuth(@Req() req) {}

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthRedirect(
    @Req() req,
    @Res() res,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const data = await this.oauthService.googleLogin(req.user, ip, userAgent);
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
    const code = await this.oauthService.createOAuthSessionCode(data.accessToken, data.refreshToken);
    return res.redirect(`${frontendUrl}/auth/callback?code=${code}`);
  }

  @Public()
  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Login with GitHub' })
  async githubAuth(@Req() req) {}

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  async githubAuthRedirect(
    @Req() req,
    @Res() res,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const data = await this.oauthService.githubLogin(req.user, ip, userAgent);
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
    const code = await this.oauthService.createOAuthSessionCode(data.accessToken, data.refreshToken);
    return res.redirect(`${frontendUrl}/auth/callback?code=${code}`);
  }

  @Public()
  @Post('exchange-code')
  @AuthRateLimit({ action: 'exchange-code', maxAttempts: 10, windowSeconds: 60, blockSeconds: 600 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange one-time OAuth session code for tokens' })
  async exchangeOAuthCode(@Req() req, @Body() body: { code: string }) {
    if (!body?.code) throw new BadRequestException({ code: ErrorCode.VALIDATION_ERROR, message: 'code is required' });
    const result = await this.oauthService.exchangeOAuthSessionCode(body.code);
    await req.clearRateLimit?.();
    return result;
  }

  @Public()
  @UseGuards(AuthGuard('jwt-refresh'))
  @Post('refresh')
  @AuthRateLimit({ action: 'refresh', maxAttempts: 20, windowSeconds: 60, blockSeconds: 300 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(@Req() req, @Body() dto: RefreshTokenDto) {
    const result = await this.tokenService.refresh(dto.refreshToken);
    await req.clearRateLimit?.();
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Revoke refresh token and blacklist current access token',
  })
  async logout(
    @Body() dto: RefreshTokenDto,
    @Headers('authorization') authorization?: string,
  ) {
    let accessToken: string | undefined;
    if (authorization?.toLowerCase().startsWith('bearer ')) {
      accessToken = authorization.slice(7).trim();
    }
    await this.tokenService.logout(dto.refreshToken, accessToken);
    return { message: 'Logged out successfully' };
  }

  @Get('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all active sessions for current user' })
  async getSessions(@Req() req) {
    return this.sessionService.getSessions(req.user.id);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke a specific session by ID' })
  async revokeSession(@Req() req, @Param('id') id: string) {
    return this.sessionService.revokeSession(req.user.id, id);
  }

  @Delete('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke all sessions' })
  async revokeAllSessions(@Req() req) {
    return this.sessionService.revokeAllSessions(req.user.id);
  }
}