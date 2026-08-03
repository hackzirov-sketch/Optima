import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import {
  GitHubOAuthProfile,
  PassportGithubProfile,
} from '../interfaces/oauth-profiles.interface';
import { isVerified } from './oauth-email.util';
import { OAuthStateStore } from './oauth-state.store';
import { RedisService } from '../../../redis/redis.service';

// Same rationale as GoogleStrategy: passport-oauth2 throws synchronously if
// clientID/clientSecret are missing, crashing the whole app at bootstrap.
// GitHub login is an optional integration, so fall back to a disabled state
// instead of taking the whole server down.
const logger = new Logger('GithubStrategy');

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly enabled: boolean;

  constructor(
    private configService: ConfigService,
    redisService: RedisService,
  ) {
    const clientId = configService.get<string>('github.clientId');
    const clientSecret = configService.get<string>('github.clientSecret');
    const enabled = Boolean(clientId && clientSecret);

    if (!enabled) {
      logger.warn(
        'GITHUB_CLIENT_ID/SECRET not set — GitHub OAuth login disabled',
      );
    }

    super({
      clientID: clientId || 'disabled-placeholder-client-id',
      clientSecret: clientSecret || 'disabled-placeholder-client-secret',
      callbackURL:
        configService.get<string>('github.callbackUrl') ||
        'http://localhost:5001/api/v1/auth/github/callback',
      // Login only needs to identify the user. Repository access is granted
      // separately by installing the GitHub App on a workspace — asking for
      // read/write on every private repo just to sign in is far more than this
      // flow needs, and the stored token is a much bigger prize as a result.
      scope: ['user:email'],
      // Single-use `state` round-tripped through Redis (see OAuthStateStore) —
      // without it the callback accepts any code, so an attacker can complete
      // an OAuth dance with their own account in a victim's browser (login
      // CSRF), silently linking the victim's session to the attacker.
      state: true,
      store: new OAuthStateStore(redisService, 'github'),
    } as any);

    this.enabled = enabled;
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: PassportGithubProfile,
    done: (err: Error | null, user?: GitHubOAuthProfile) => void,
  ): void {
    if (!this.enabled) {
      done(new Error('GitHub OAuth is not configured'));
      return;
    }
    const { username, displayName, emails, photos, id } = profile;
    const nameParts = (displayName || username || '').trim().split(' ');
    const firstName = nameParts[0] || username;
    const lastName = nameParts.slice(1).join(' ') || '';

    // GitHub hands back every address on the account, verified or not, and an
    // unverified one is attacker-chosen: anyone can add victim@example.com to
    // their own GitHub account. Prefer a verified address and mark clearly
    // whether the one we ended up with is trustworthy — OAuthService refuses to
    // match an unverified address against an existing UPZ account.
    const verifiedEmail = emails?.find((e) => isVerified(e.verified));
    const email = verifiedEmail?.value ?? emails?.[0]?.value;

    const user: GitHubOAuthProfile = {
      githubId: id,
      username,
      firstName,
      lastName,
      email,
      emailVerified: Boolean(verifiedEmail),
      avatarUrl: photos?.[0]?.value,
      accessToken,
      refreshToken,
    };
    done(null, user);
  }
}
