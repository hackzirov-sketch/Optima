import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthProfile, PassportGoogleProfile } from '../interfaces/oauth-profiles.interface';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('google.clientId')!,
      clientSecret: configService.get<string>('google.clientSecret')!,
      callbackURL: configService.get<string>('google.callbackUrl')!,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: PassportGoogleProfile,
    done: VerifyCallback,
  ): Promise<void> {
    const { name, emails, photos } = profile;
    const user: GoogleOAuthProfile = {
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName,
      picture: photos[0].value,
      accessToken,
      refreshToken,
    };
    done(null, user);
  }
}
