import { ConfigService } from '@nestjs/config';
import { SessionService } from './session.service';

/**
 * Refresh tokens live in Postgres, but access tokens are stateless — so
 * "revoke all sessions" only actually revokes anything if it also records a
 * cutoff for JwtStrategy to check. Without that, a stolen access token keeps
 * working for the rest of its lifetime, which is precisely the window the user
 * pressed the button to close.
 */
describe('SessionService.revokeAllSessions', () => {
  let dataSource: { query: jest.Mock };
  let redisService: { blockUserSessions: jest.Mock };
  let audit: { log: jest.Mock };
  let service: SessionService;

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    redisService = {
      blockUserSessions: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const config = {
      get: (key: string) =>
        ({ 'app.maxSessions': 5, 'jwt.accessExpires': '20m' })[key],
    } as unknown as ConfigService;

    service = new SessionService(
      dataSource as any,
      config,
      redisService as any,
      audit as any,
    );
  });

  it('revokes the stored refresh tokens', async () => {
    await service.revokeAllSessions('user-1');

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE refresh_tokens SET revoked_at/);
    expect(params).toEqual(['user-1']);
  });

  it('blocks outstanding access tokens for at least their remaining lifetime', async () => {
    await service.revokeAllSessions('user-1');

    expect(redisService.blockUserSessions).toHaveBeenCalledWith(
      'user-1',
      20 * 60,
    );
  });

  it('derives the block window from the configured access-token expiry', async () => {
    const config = {
      get: (key: string) =>
        ({ 'app.maxSessions': 5, 'jwt.accessExpires': '1h' })[key],
    } as unknown as ConfigService;
    const svc = new SessionService(
      dataSource as any,
      config,
      redisService as any,
      audit as any,
    );

    await svc.revokeAllSessions('user-2');

    expect(redisService.blockUserSessions).toHaveBeenCalledWith('user-2', 3600);
  });
});

/**
 * "Log me out everywhere" is what someone presses after a suspected
 * compromise. audit_logs existed but nothing recorded that event, so the one
 * action most worth reconstructing later left no trace at all.
 */
describe('SessionService — audit trail', () => {
  it('records a revoke-all on the shared audit log', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const config = {
      get: (key: string) =>
        ({ 'app.maxSessions': 5, 'jwt.accessExpires': '20m' })[key],
    } as unknown as ConfigService;

    const service = new SessionService(
      dataSource as any,
      config,
      { blockUserSessions: jest.fn().mockResolvedValue(undefined) } as any,
      audit as any,
    );

    await service.revokeAllSessions('user-9');

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-9',
        action: 'auth.all_sessions_revoked',
        entityType: 'user',
      }),
    );
  });
});
