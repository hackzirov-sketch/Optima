import { UnauthorizedException } from '@nestjs/common';
import { OAuthService } from './oauth.service';
import {
  GitHubOAuthProfile,
  GoogleOAuthProfile,
} from '../interfaces/oauth-profiles.interface';

/**
 * Regression cover for the OAuth account-takeover path: an attacker adds a
 * victim's address to their own provider account without verifying it, then
 * signs in and lands inside the victim's UPZ account.
 */
describe('OAuthService — email verification gate', () => {
  const victim = { id: 'victim-id', email: 'victim@example.com' } as any;

  let usersService: any;
  let tokenService: any;
  let dataSource: any;
  let service: OAuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findById: jest.fn().mockResolvedValue(victim),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'new-id', email: 'new@example.com' }),
      updateLastSeen: jest.fn().mockResolvedValue(undefined),
    };
    tokenService = {
      generateTokens: jest
        .fn()
        .mockResolvedValue({ accessToken: 'a', refreshToken: 'r' }),
    };
    dataSource = { query: jest.fn().mockResolvedValue([]) };

    service = new OAuthService(
      usersService,
      { setOAuthCode: jest.fn(), getAndDeleteOAuthCode: jest.fn() } as any,
      { encrypt: (v: string) => `enc(${v})` } as any,
      tokenService,
      { logIpAddress: jest.fn().mockResolvedValue(undefined) } as any,
      dataSource,
      { add: jest.fn().mockResolvedValue(undefined) } as any,
    );
  });

  const googleProfile = (
    over: Partial<GoogleOAuthProfile> = {},
  ): GoogleOAuthProfile => ({
    email: 'victim@example.com',
    emailVerified: true,
    firstName: 'V',
    lastName: 'Ictim',
    picture: '',
    accessToken: 'at',
    refreshToken: 'rt',
    ...over,
  });

  const githubProfile = (
    over: Partial<GitHubOAuthProfile> = {},
  ): GitHubOAuthProfile => ({
    githubId: '4242',
    username: 'attacker',
    firstName: 'A',
    lastName: 'T',
    email: 'victim@example.com',
    emailVerified: true,
    avatarUrl: undefined,
    accessToken: 'at',
    refreshToken: 'rt',
    ...over,
  });

  describe('google', () => {
    it('refuses an unverified address', async () => {
      usersService.findByEmail.mockResolvedValue(victim);

      await expect(
        service.googleLogin(googleProfile({ emailVerified: false })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tokenService.generateTokens).not.toHaveBeenCalled();
    });

    it('signs in an existing account on a verified address', async () => {
      usersService.findByEmail.mockResolvedValue(victim);

      await service.googleLogin(googleProfile());

      expect(tokenService.generateTokens).toHaveBeenCalledWith(
        victim,
        expect.objectContaining({ provider: 'google' }),
      );
    });

    it('does not create an account from an unverified address', async () => {
      await expect(
        service.googleLogin(googleProfile({ emailVerified: false })),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersService.create).not.toHaveBeenCalled();
    });
  });

  describe('github', () => {
    it('does not link an unverified address to an existing account', async () => {
      await service.githubLogin(githubProfile({ emailVerified: false }));

      // The lookup must never be made with the unverified address — the login
      // falls back to the per-GitHub-id placeholder instead.
      for (const [lookedUp] of usersService.findByEmail.mock.calls) {
        expect(lookedUp).not.toBe('victim@example.com');
      }
      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ email: '4242@github.placeholder.com' }),
      );
    });

    it('links a verified address to the existing account', async () => {
      usersService.findByEmail.mockImplementation((email: string) =>
        email === 'victim@example.com'
          ? Promise.resolve(victim)
          : Promise.resolve(null),
      );

      await service.githubLogin(githubProfile());

      expect(usersService.findByEmail).toHaveBeenCalledWith(
        'victim@example.com',
      );
      expect(usersService.create).not.toHaveBeenCalled();
      expect(tokenService.generateTokens).toHaveBeenCalledWith(
        victim,
        expect.objectContaining({ provider: 'github' }),
      );
    });
  });
});
