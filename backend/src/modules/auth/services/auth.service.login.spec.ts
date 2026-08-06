import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

/**
 * Login must not answer "does this email have an account here?".
 *
 * Three cases have to be indistinguishable to an unauthenticated caller:
 * an address that was never registered, an account created via Google/GitHub
 * that has no password to check, and a real local account given the wrong
 * password. An earlier version merged the first two but answered the third
 * differently, which still left one request per address as an oracle — so the
 * assertions here compare all three against each other, not just the first two.
 */
describe('AuthService.login — account enumeration', () => {
  const socialUser = {
    id: 'social-1',
    email: 'social@example.com',
    passwordHash: null,
    isVerified: true,
    isActive: true,
  };
  const localUser = {
    ...socialUser,
    id: 'local-1',
    email: 'real@example.com',
    passwordHash: '$2b$12$hash',
  };

  let usersService: any;
  let securityService: any;
  let redisService: any;
  let mailService: any;
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn().mockResolvedValue(null),
      updateLastSeen: jest.fn(),
    };
    securityService = {
      comparePassword: jest.fn().mockResolvedValue(false),
      hashPassword: jest.fn(),
    };
    redisService = {
      setEmailVerification: jest.fn().mockResolvedValue(undefined),
      checkEmailVerifyResendLimit: jest
        .fn()
        .mockResolvedValue({ blocked: false }),
      markEmailVerifyResendSent: jest.fn().mockResolvedValue(undefined),
      getAccountLockout: jest.fn().mockResolvedValue(null),
      incrementAccountLockoutFailures: jest.fn().mockResolvedValue(1),
    };
    mailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      usersService,
      mailService,
      { get: () => undefined } as any,
      redisService,
      {} as any,
      securityService,
      {} as any,
      {} as any,
      {} as any,
      { add: jest.fn() } as any,
      {} as any,
    );
  });

  async function loginAndCatch(email: string) {
    try {
      await service.login({ email, password: 'Whatever1!' });
      throw new Error('expected login to reject');
    } catch (err) {
      if (!(err instanceof UnauthorizedException)) throw err;
      return err.getResponse() as Record<string, unknown>;
    }
  }

  it('answers identically for an unknown address and a social account', async () => {
    const unknown = await loginAndCatch('nobody@example.com');

    usersService.findByEmail.mockResolvedValue(socialUser);
    const social = await loginAndCatch('social@example.com');

    expect(unknown).toEqual(social);
  });

  it('answers a wrong password the same way as an unknown address', async () => {
    const unknown = await loginAndCatch('nobody@example.com');

    usersService.findByEmail.mockResolvedValue(localUser);
    const wrongPassword = await loginAndCatch('real@example.com');

    expect(wrongPassword).toEqual(unknown);
    expect(wrongPassword.code).toBe(ErrorCode.INVALID_CREDENTIALS);
  });

  it('leaks nothing through extra response fields', async () => {
    usersService.findByEmail.mockResolvedValue(socialUser);
    const social = await loginAndCatch('social@example.com');

    // No verifyToken, no requiresPasswordSetup, no redirect: each of those
    // only ever appeared on one branch, so their presence was the tell.
    expect(Object.keys(social).sort()).toEqual(['code', 'message']);
  });

  it('does not mail anyone on a failed login', async () => {
    await loginAndCatch('nobody@example.com');

    usersService.findByEmail.mockResolvedValue(socialUser);
    await loginAndCatch('social@example.com');

    // This branch used to send a verification code on every attempt, which
    // was both an oracle and an unauthenticated inbox-flooding primitive.
    expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    expect(redisService.setEmailVerification).not.toHaveBeenCalled();
  });

  it('still runs bcrypt for an unknown address (constant-time)', async () => {
    await loginAndCatch('nobody@example.com');

    expect(securityService.comparePassword).toHaveBeenCalled();
  });
});
