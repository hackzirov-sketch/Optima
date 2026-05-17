import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('github.clientId')!,
      clientSecret: configService.get<string>('github.clientSecret')!,
      callbackURL: configService.get<string>('github.callbackUrl') || 'http://localhost:5001/api/v1/auth/github/callback',
      scope: ['user:email', 'repo'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: Function,
  ): Promise<any> {
    const { username, displayName, emails, photos, id } = profile;
    const nameParts = (displayName || username || '').trim().split(' ');
    const firstName = nameParts[0] || username;
    const lastName = nameParts.slice(1).join(' ') || '';
    const user = {
      githubId: id,
      username: username,
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
