import type { Request } from 'express';
import { OAuthStateStore } from './oauth-state.store';

type Handle = string | undefined;

function storeState(store: OAuthStateStore): Promise<Handle> {
  return new Promise((resolve, reject) => {
    store.store({} as Request, {}, (err, handle) =>
      err ? reject(err) : resolve(handle),
    );
  });
}

function verifyState(store: OAuthStateStore, state: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    store.verify({} as Request, state, {}, (err, ok) =>
      err ? reject(err) : resolve(Boolean(ok)),
    );
  });
}

/** Minimal stand-in for the ioredis surface OAuthStateStore uses. */
function fakeRedis() {
  const keys = new Map<string, string>();
  return {
    keys,
    set: jest.fn((key: string, value: string) => {
      keys.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => Promise.resolve(keys.delete(key) ? 1 : 0)),
  };
}

describe('OAuthStateStore', () => {
  describe('with Redis available', () => {
    let redis: ReturnType<typeof fakeRedis>;
    let store: OAuthStateStore;

    beforeEach(() => {
      redis = fakeRedis();
      store = new OAuthStateStore({ getClient: () => redis } as any, 'google');
    });

    it('verifies a state it issued', async () => {
      const handle = await storeState(store);
      await expect(verifyState(store, handle!)).resolves.toBe(true);
    });

    it('rejects a state it never issued — the login-CSRF case', async () => {
      await expect(verifyState(store, 'attacker-supplied')).resolves.toBe(
        false,
      );
    });

    it('rejects an empty state', async () => {
      await expect(verifyState(store, '')).resolves.toBe(false);
    });

    it('accepts a state only once, so a replayed callback fails', async () => {
      const handle = await storeState(store);

      await expect(verifyState(store, handle!)).resolves.toBe(true);
      await expect(verifyState(store, handle!)).resolves.toBe(false);
    });

    it('namespaces handles per provider', async () => {
      const handle = await storeState(store);
      const other = new OAuthStateStore(
        { getClient: () => redis } as any,
        'github',
      );

      await expect(verifyState(other, handle!)).resolves.toBe(false);
    });

    it('issues an unpredictable handle', async () => {
      const handles = await Promise.all([
        storeState(store),
        storeState(store),
        storeState(store),
      ]);

      expect(new Set(handles).size).toBe(3);
      for (const handle of handles)
        expect(handle!.length).toBeGreaterThanOrEqual(32);
    });
  });

  // Redis being down must not take OAuth login down with it, but it also must
  // not turn `state` into a no-op that accepts anything.
  describe('with Redis unavailable', () => {
    let store: OAuthStateStore;

    beforeEach(() => {
      store = new OAuthStateStore({ getClient: () => null } as any, 'google');
    });

    it('still verifies a state it issued', async () => {
      const handle = await storeState(store);
      await expect(verifyState(store, handle!)).resolves.toBe(true);
    });

    it('still rejects an unknown state', async () => {
      await expect(verifyState(store, 'attacker-supplied')).resolves.toBe(
        false,
      );
    });

    it('still consumes the state on first use', async () => {
      const handle = await storeState(store);

      await expect(verifyState(store, handle!)).resolves.toBe(true);
      await expect(verifyState(store, handle!)).resolves.toBe(false);
    });
  });
});
