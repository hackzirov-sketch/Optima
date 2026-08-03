import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import {
  GoogleOAuthProfile,
  PassportGoogleProfile,
} from '../interfaces/oauth-profiles.interface';
import { isVerified } from './oauth-email.util';
import { OAuthStateStore } from './oauth-state.store';
import { RedisService } from '../../../redis/redis.service'; // Passport-oauth2 throws synchronously in its constructor if clientID/clientSecret

// Passport-oauth2 throws synchronously in its constructor if clientID/clientSecret
// are missing, which crashes the whole Nest app at bootstrap. Google OAuth is an
// optional integration, so we fall back to placeholder credentials and disable the
// strategy at runtime instead of taking the whole server down when it's unset.
const logger = new Logger('GoogleStrategy');

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly enabled: boolean;

  constructor(
    private configService: ConfigService,
    redisService: RedisService,
  ) {
    const clientId = configService.get<string>('google.clientId');
    const clientSecret = configService.get<string>('google.clientSecret');
    const enabled = Boolean(clientId && clientSecret);

    if (!enabled) {
      logger.warn(
        'GOOGLE_CLIENT_ID/SECRET not set — Google OAuth login disabled',
      );
    }

    super({
      clientID: clientId || 'disabled-placeholder-client-id',
      clientSecret: clientSecret || 'disabled-placeholder-client-secret',
      callbackURL:
        configService.get<string>('google.callbackUrl') ||
        'http://localhost:3000/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
      // See GithubStrategy: without `state` the callback accepts any code,
      // which is login CSRF.
      state: true,
      store: new OAuthStateStore(redisService, 'google'),
    } as any);

    this.enabled = enabled;
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: PassportGoogleProfile,
    done: VerifyCallback,
  ): void {
    if (!this.enabled) {
      done(new Error('Google OAuth is not configured'));
      return;
    }
    const { name, emails, photos } = profile;
    // Google almost always returns verified addresses, but "almost always" is
    // not a security boundary — Workspace domains can hand out unverified ones.
    // Carry the flag through and let OAuthService decide (same rule as GitHub).
    const primary = emails?.[0];
    const user: GoogleOAuthProfile = {
      email: primary.value,
      emailVerified:
        isVerified(primary.verified) ||
        isVerified(profile._json?.email_verified),
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos[0].value,
      accessToken,
      refreshToken,
    };
    done(null, user);
  }
}
