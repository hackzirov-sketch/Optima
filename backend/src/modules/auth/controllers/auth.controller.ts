import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { ErrorCode } from '../../../common/enums/error-code.enum';

import { AuthService } from '../services/auth.service';
import { OAuthService } from '../services/oauth.service';
import { TokenService } from '../services/token.service';
import { SessionService } from '../services/session.service';
import { RegisterDto } from '../schemas/register.schema';
import { LoginDto } from '../schemas/login.schema';
import { VerifyEmailDto } from '../schemas/verify-email.schema';
import { ResendVerificationDto } from '../schemas/resend-verification.schema';
import { SetPasswordDto } from '../schemas/set-password.schema';
import { ForgotPasswordDto } from '../schemas/forgot-password.schema';
import { ResetPasswordDto } from '../schemas/reset-password.schema';
import { ChangePasswordDto } from '../schemas/change-password.schema';
import { VerifyResetOtpDto } from '../schemas/verify-reset-otp.schema';
import { Public } from '../../../common/decorators/public.decorator';

import { AuthRateLimitGuard } from '../guards/auth-rate-limit.guard';
import { AuthRateLimit } from '../decorators/auth-rate-limit.decorator';
import { JwtRefreshGuard } from '../guards/jwt-refresh.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  setAuthCookies,
  clearAuthCookies,
} from '../../../common/utils/auth-cookies.util';

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
  // The route has to stay @Public — it's how an OAuth-only account sets its
  // first password, before it can authenticate at all. That means the global
  // JwtAuthGuard never populates req.user here, so an already-signed-in caller
  // is identified from the access cookie instead (see AuthService.setPassword).
  // Rate limited like every other credential-accepting endpoint: it takes a
  // one-time setupToken, and an unlimited endpoint is an unlimited guessing
  // budget, however wide the keyspace.
  @AuthRateLimit({
    action: 'set-password',
    maxAttempts: 5,
    windowSeconds: 90,
    blockSeconds: 900,
  })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Set password for social login accounts or new users',
  })
  async setPassword(
    @Req() req,
    @Body() dto: SetPasswordDto,
    @Headers('authorization') authHeader?: string,
  ) {
    const result = await this.authService.setPassword(
      req.user?.id,
      dto,
      authHeader,
      req.cookies?.[ACCESS_COOKIE],
    );
    await req.clearRateLimit?.();
    return result;
  }

  @Post('change-password')
  @AuthRateLimit({
    action: 'change-password',
    maxAttempts: 5,
    windowSeconds: 300,
    blockSeconds: 900,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change the password, confirming the current one' })
  async changePassword(
    @Req() req,
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(userId, dto);
    await req.clearRateLimit?.();
    return result;
  }

  @Public()
  @Post('register')
  @AuthRateLimit({
    action: 'register',
    maxAttempts: 3,
    windowSeconds: 90,
    blockSeconds: 86400,
  })
  @ApiOperation({ summary: 'Register a new user and send verification email' })
  async register(@Body() dto: RegisterDto) {
    // No clearRateLimit here: register always "succeeds" for valid input (a
    // new account each time), so clearing on success would let someone
    // create unlimited accounts from one IP — the whole point of the cap.
    return this.authService.register(dto);
  }

  @Public()
  @Post('verify-email')
  @AuthRateLimit({
    action: 'verify-email',
    maxAttempts: 10,
    windowSeconds: 90,
    blockSeconds: 1800,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify email address with verifyToken + 6-digit code',
  })
  async verifyEmail(
    @Req() req,
    @Body() dto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyEmail(dto);
    await req.clearRateLimit?.();
    return this.respondWithTokens(res, result);
  }

  @Public()
  @Post('resend-verification')
  @AuthRateLimit({
    action: 'resend-verification',
    maxAttempts: 5,
    windowSeconds: 90,
    blockSeconds: 3600,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the email verification code' })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    // No clearRateLimit here: this always returns a generic 200 (even for a
    // nonexistent/already-verified email), so clearing on "success" would
    // erase the per-IP cap on every single call — it would never accumulate.
    return this.authService.resendVerification(dto);
  }

  @Public()
  @Post('login')
  @AuthRateLimit({
    action: 'login',
    maxAttempts: 5,
    windowSeconds: 90,
    blockSeconds: 900,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user, set httpOnly auth cookies' })
  async login(
    @Req() req,
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, ip, userAgent);
    await req.clearRateLimit?.();
    return this.respondWithTokens(res, result);
  }

  /** Tokens never reach the response body — they're set as httpOnly cookies
   * here and stripped out, so nothing JS-readable on the frontend ever holds
   * one (defeats token exfiltration via XSS). */
  private respondWithTokens<
    T extends { accessToken: string; refreshToken: string },
  >(res: Response, result: T) {
    const { accessToken, refreshToken, ...rest } = result;
    setAuthCookies(res, this.configService, { accessToken, refreshToken });
    return rest;
  }

  @Public()
  @Post('forgot-password')
  @AuthRateLimit({
    action: 'forgot-password',
    maxAttempts: 5,
    windowSeconds: 90,
    blockSeconds: 600,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    // No clearRateLimit here: same generic-200-always shape as resend-verification.
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('verify-reset-otp')
  @AuthRateLimit({
    action: 'verify-reset-otp',
    maxAttempts: 10,
    windowSeconds: 90,
    blockSeconds: 900,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify the OTP code sent to email for password reset',
  })
  async verifyResetOtp(@Req() req, @Body() dto: VerifyResetOtpDto) {
    const result = await this.authService.verifyResetOtp(
      dto.resetToken,
      dto.otp,
    );
    await req.clearRateLimit?.();
    return result;
  }

  @Public()
  @Post('reset-password')
  @AuthRateLimit({
    action: 'reset-password',
    maxAttempts: 5,
    windowSeconds: 90,
    blockSeconds: 3600,
  })
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
  async googleAuth() {}

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
    const frontendUrl =
      this.configService.get<string>('app.frontendUrl') ||
      'http://localhost:3001';
    const code = await this.oauthService.createOAuthSessionCode(
      data.accessToken,
      data.refreshToken,
    );
    return res.redirect(`${frontendUrl}/auth/callback?code=${code}`);
  }

  @Public()
  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Login with GitHub' })
  async githubAuth() {}

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
    const frontendUrl =
      this.configService.get<string>('app.frontendUrl') ||
      'http://localhost:3001';
    const code = await this.oauthService.createOAuthSessionCode(
      data.accessToken,
      data.refreshToken,
    );
    return res.redirect(`${frontendUrl}/auth/callback?code=${code}`);
  }

  @Public()
  @Post('exchange-code')
  @AuthRateLimit({
    action: 'exchange-code',
    maxAttempts: 10,
    windowSeconds: 90,
    blockSeconds: 600,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Exchange one-time OAuth session code for tokens, set httpOnly auth cookies',
  })
  async exchangeOAuthCode(
    @Req() req,
    @Body() body: { code: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body?.code)
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'code is required',
      });
    const result = await this.oauthService.exchangeOAuthSessionCode(body.code);
    await req.clearRateLimit?.();
    return this.respondWithTokens(res, result);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @AuthRateLimit({
    action: 'refresh',
    maxAttempts: 20,
    windowSeconds: 90,
    blockSeconds: 300,
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token using the httpOnly refresh cookie',
  })
  async refresh(
    @Req() req,
    @CurrentUser('refreshToken') refreshToken: string,
    @CurrentUser('groupId') groupId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.tokenService.refresh(refreshToken, groupId);
    await req.clearRateLimit?.();
    return this.respondWithTokens(res, result);
  }

  @Post('logout')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revoke refresh token, blacklist current access token, clear auth cookies',
  })
  async logout(@Req() req, @Res({ passthrough: true }) res: Response) {
    const refreshToken: string | undefined = req.cookies?.[REFRESH_COOKIE];
    const accessToken: string | undefined = req.cookies?.[ACCESS_COOKIE];
    if (refreshToken) await this.tokenService.logout(refreshToken, accessToken);
    clearAuthCookies(res, this.configService);
    return { message: 'Logged out successfully' };
  }

  @Get('session')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the group this session is scoped to',
    description:
      'The access token is an httpOnly cookie, unreadable by frontend JS, so it has no way to decode ' +
      'the `groupId` claim itself (e.g. on a plain page reload with no in-memory state left). This ' +
      'is the one round trip that hands it back.',
  })
  getSession(@CurrentUser('groupId') groupId: string | undefined) {
    return { groupId: groupId ?? null };
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
  async revokeSession(@Req() req, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessionService.revokeSession(req.user.id, id);
  }

  @Delete('sessions')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Revoke all sessions' })
  async revokeAllSessions(@Req() req) {
    return this.sessionService.revokeAllSessions(req.user.id);
  }
}
