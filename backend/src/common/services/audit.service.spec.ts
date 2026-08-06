import { AuditService } from './audit.service';

/**
 * `audit_logs` was written to from five places and read from none — a trail
 * nobody can open is not a trail. `list()` is the read side, and it builds its
 * WHERE clause dynamically, so these tests pin two things: that every value
 * still travels as a `$n` parameter (never interpolated), and that the filters
 * compose the way the three callers rely on.
 */
describe('AuditService.list', () => {
  let dataSource: { query: jest.Mock };
  let service: AuditService;

  const rows = (sql: string) =>
    sql.includes('count(*)') ? [{ total: 3 }] : [{ id: 'a1' }];

  beforeEach(() => {
    dataSource = {
      query: jest
        .fn()
        .mockImplementation((sql: string) => Promise.resolve(rows(sql))),
    };
    service = new AuditService(dataSource as never);
  });

  const lastSelect = () =>
    dataSource.query.mock.calls.find(
      ([sql]) => !String(sql).includes('count(*)'),
    ) as [string, unknown[]];

  it('returns every row when no filter is given', async () => {
    const result = await service.list();
    const [sql] = lastSelect();
    expect(sql).not.toMatch(/WHERE/);
    expect(result.total).toBe(3);
  });

  it('composes filters and passes every value as a bound parameter', async () => {
    await service.list({
      workspaceId: 'ws-1',
      entityType: 'chat_room',
      entityId: 'room-1',
      actorId: 'user-1',
      action: 'chat_room.deleted',
    });

    const [sql, params] = lastSelect();
    expect(sql).toContain('a.workspace_id = $1');
    expect(sql).toContain('a.entity_type = $2');
    expect(sql).toContain('a.entity_id = $3');
    expect(sql).toContain('a.actor_id = $4');
    expect(sql).toContain('a.action = $5');
    // Nothing user-supplied may reach the SQL text itself.
    expect(sql).not.toContain('chat_room.deleted');
    expect(sql).not.toContain('ws-1');
    expect(params.slice(0, 5)).toEqual([
      'ws-1',
      'chat_room',
      'room-1',
      'user-1',
      'chat_room.deleted',
    ]);
  });

  it('treats an explicit null workspace as a filter, not as "any"', async () => {
    // Platform-level rows (a channel belongs to its members, not a workspace)
    // must be reachable; `undefined` still means "don't filter".
    await service.list({ workspaceId: null });
    const [sql] = lastSelect();
    expect(sql).toContain('a.workspace_id IS NULL');
  });

  it('does not filter on workspace when the key is absent', async () => {
    await service.list({ actorId: 'user-1' });
    const [sql] = lastSelect();
    // The column is always in the SELECT list, so only the WHERE clause can
    // tell us whether it was filtered on.
    const where = String(sql).slice(String(sql).indexOf('WHERE'));
    expect(where).not.toContain('workspace_id');
    expect(where).toContain('a.actor_id = $1');
  });

  it('clamps the page size so one caller cannot ask for the whole table', async () => {
    await service.list({ limit: 10_000 });
    const [, params] = lastSelect();
    expect(params[params.length - 2]).toBe(200);
  });

  it('never lets a negative offset through', async () => {
    await service.list({ offset: -50 });
    const [, params] = lastSelect();
    expect(params[params.length - 1]).toBe(0);
  });

  it('swallows write failures so auditing cannot break the mutation it records', async () => {
    dataSource.query.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.log({ actorId: 'user-1', action: 'chat_room.deleted' }),
    ).resolves.toBeUndefined();
  });
});
