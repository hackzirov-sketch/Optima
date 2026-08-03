import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ErrorCode } from '../../../common/enums/error-code.enum';

/**
 * Login must not answer "does this email have an account here?".
 *
 * The tricky case is an account created via Google/GitHub: it has no password
 * to check, so the response for it has to be indistinguishable from the
 * response for an address that was never registered.
 */
describe('AuthService.login — account enumeration', () => {
  const socialUser = {
    id: 'social-1',
    email: 'social@example.com',
    passwordHash: null,
    isVerified: true,
    isActive: true,
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

    expect(unknown.code).toBe(social.code);
    expect(unknown.message).toBe(social.message);
    expect(unknown.redirect).toBe(social.redirect);
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(social).sort());
  });

  it('returns a token of the same shape in both cases', async () => {
    const unknown = await loginAndCatch('nobody@example.com');

    usersService.findByEmail.mockResolvedValue(socialUser);
    const social = await loginAndCatch('social@example.com');

    expect(typeof unknown.verifyToken).toBe('string');
    expect(String(unknown.verifyToken)).toHaveLength(
      String(social.verifyToken).length,
    );
  });

  it('does not send mail for an address with no account', async () => {
    await loginAndCatch('nobody@example.com');

    expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    expect(redisService.setEmailVerification).not.toHaveBeenCalled();
  });

  it('sends the real code for a genuine social account', async () => {
    usersService.findByEmail.mockResolvedValue(socialUser);

    await loginAndCatch('social@example.com');

    expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
      'social@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
  });

  // Previously this branch mailed on every attempt with no limit and no
  // credentials — an unauthenticated inbox-flooding primitive.
  it('respects the resend limit instead of mailing on every attempt', async () => {
    usersService.findByEmail.mockResolvedValue(socialUser);
    redisService.checkEmailVerifyResendLimit.mockResolvedValue({
      blocked: true,
      reason: 'cooldown',
      retryAfter: 60,
    });

    const response = await loginAndCatch('social@example.com');

    expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    // Still shaped the same, so the block isn't itself an oracle.
    expect(typeof response.verifyToken).toBe('string');
  });

  it('still runs bcrypt for an unknown address (constant-time)', async () => {
    await loginAndCatch('nobody@example.com');

    expect(securityService.comparePassword).toHaveBeenCalled();
  });

  it('rejects a wrong password with generic credentials error', async () => {
    usersService.findByEmail.mockResolvedValue({
      ...socialUser,
      passwordHash: '$2b$12$hash',
    });
    redisService.incrementAccountLockoutFailures = jest
      .fn()
      .mockResolvedValue(1);

    const response = await loginAndCatch('real@example.com');

    expect(response.code).toBe(ErrorCode.INVALID_CREDENTIALS);
  });
});
