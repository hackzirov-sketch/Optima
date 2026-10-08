import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

const NOW = 1_700_000_000; // epoch seconds

describe('JwtStrategy.validate', () => {
  const activeUser = { id: 'user-1', isActive: true };

  let usersService: { findById: jest.Mock };
  let redisService: { validateTokenPipeline: jest.Mock; cacheUser: jest.Mock };
  let strategy: JwtStrategy;

  /** [isBlacklisted, sessionBlockCutoff, cachedUser] */
  function pipelineReturns(
    blacklisted: boolean,
    cutoff: number | null,
    user: unknown = activeUser,
  ) {
    redisService.validateTokenPipeline.mockResolvedValue([
      blacklisted,
      cutoff,
      user,
    ]);
  }

  beforeEach(() => {
    usersService = { findById: jest.fn().mockResolvedValue(activeUser) };
    redisService = {
      validateTokenPipeline: jest
        .fn()
        .mockResolvedValue([false, null, activeUser]),
      cacheUser: jest.fn().mockResolvedValue(undefined),
    };

    const config = {
      get: (key: string) =>
        key === 'jwt.accessSecret' ? 'test-secret' : undefined,
    } as unknown as ConfigService;

    strategy = new JwtStrategy(
      config,
      usersService as any,
      redisService as any,
    );
  });

  it('accepts a normal token', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', iat: NOW }),
    ).resolves.toMatchObject({
      id: 'user-1',
    });
  });

  it('rejects a blacklisted (logged-out) token', async () => {
    pipelineReturns(true, null);

    await expect(
      strategy.validate({ sub: 'user-1', jti: 'j1', iat: NOW }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token issued before the session-block cutoff', async () => {
    pipelineReturns(false, NOW);

    await expect(
      strategy.validate({ sub: 'user-1', iat: NOW - 60 }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token issued exactly at the cutoff second', async () => {
    pipelineReturns(false, NOW);

    await expect(
      strategy.validate({ sub: 'user-1', iat: NOW }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // The reason the block stores a cutoff rather than a flag: revoking every
  // session must not lock the user out of the one they open next.
  it('accepts a token issued after the cutoff', async () => {
    pipelineReturns(false, NOW);

    await expect(
      strategy.validate({ sub: 'user-1', iat: NOW + 1 }),
    ).resolves.toMatchObject({
      id: 'user-1',
    });
  });

  it('rejects a token with no iat while a block is active', async () => {
    pipelineReturns(false, NOW);

    await expect(strategy.validate({ sub: 'user-1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a deactivated account', async () => {
    pipelineReturns(false, null, { id: 'user-1', isActive: false });

    await expect(
      strategy.validate({ sub: 'user-1', iat: NOW }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('falls back to the database when the user is not cached', async () => {
    pipelineReturns(false, null, null);

    await expect(
      strategy.validate({ sub: 'user-1', iat: NOW }),
    ).resolves.toMatchObject({
      id: 'user-1',
    });
    expect(usersService.findById).toHaveBeenCalledWith('user-1');
  });

  it('carries the token group through to req.user', async () => {
    await expect(
      strategy.validate({ sub: 'user-1', iat: NOW, groupId: 'ws-9' }),
    ).resolves.toMatchObject({ groupId: 'ws-9' });
  });
});
