import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';
import { GitHubOAuthProfile, PassportGithubProfile } from '../interfaces/oauth-profiles.interface';

// Same rationale as GoogleStrategy: passport-oauth2 throws synchronously if
// clientID/clientSecret are missing, crashing the whole app at bootstrap.
// GitHub login is an optional integration, so fall back to a disabled state
// instead of taking the whole server down.
const logger = new Logger('GithubStrategy');

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly enabled: boolean;

  constructor(private configService: ConfigService) {
    const clientId = configService.get<string>('github.clientId');
    const clientSecret = configService.get<string>('github.clientSecret');
    const enabled = Boolean(clientId && clientSecret);

    if (!enabled) {
      logger.warn('GITHUB_CLIENT_ID/SECRET not set — GitHub OAuth login disabled');
    }

    super({
      clientID: clientId || 'disabled-placeholder-client-id',
      clientSecret: clientSecret || 'disabled-placeholder-client-secret',
      callbackURL:
        configService.get<string>('github.callbackUrl') ||
        'http://localhost:5001/api/v1/auth/github/callback',
      scope: ['user:email', 'repo'],
    });

    this.enabled = enabled;
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: PassportGithubProfile,
    done: Function,
  ): Promise<void> {
    if (!this.enabled) {
      done(new Error('GitHub OAuth is not configured'));
      return;
    }
    const { username, displayName, emails, photos, id } = profile;
    const nameParts = (displayName || username || '').trim().split(' ');
    const firstName = nameParts[0] || username;
    const lastName = nameParts.slice(1).join(' ') || '';
    const user: GitHubOAuthProfile = {
      githubId: id,
      username,
      firstName,
      lastName,
      email: emails?.[0]?.value,
      avatarUrl: photos?.[0]?.value,
      accessToken,
      refreshToken,
    };
    done(null, user);
  }
}
