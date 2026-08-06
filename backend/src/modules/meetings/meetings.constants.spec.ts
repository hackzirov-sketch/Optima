import { effectiveCapacity, MESH_MAX_PARTICIPANTS } from './meetings.constants';

/**
 * Capacity is decided by the transport, not by what a host typed. Calls are a
 * full mesh — each participant uploads a separate copy of their video to every
 * other one — so the limit is a property of the browser, and the stored value
 * can only ever lower it.
 */
describe('effectiveCapacity', () => {
  it('honours a host asking for a smaller meeting', () => {
    expect(effectiveCapacity(4)).toBe(4);
  });

  it('refuses to exceed what the mesh can carry', () => {
    // The API used to accept 500 and default to 100. The meeting was created,
    // everyone was let in, and it then simply stopped working — which reads as
    // a bug rather than a limit.
    expect(effectiveCapacity(100)).toBe(MESH_MAX_PARTICIPANTS);
    expect(effectiveCapacity(500)).toBe(MESH_MAX_PARTICIPANTS);
  });

  it('accepts exactly the mesh limit', () => {
    expect(effectiveCapacity(MESH_MAX_PARTICIPANTS)).toBe(
      MESH_MAX_PARTICIPANTS,
    );
  });

  it('falls back to the mesh limit when the value is missing', () => {
    // `activeCount >= undefined` is silently false, which would have meant no
    // limit at all rather than the default one.
    expect(effectiveCapacity(undefined)).toBe(MESH_MAX_PARTICIPANTS);
    expect(effectiveCapacity(null)).toBe(MESH_MAX_PARTICIPANTS);
    expect(effectiveCapacity(NaN)).toBe(MESH_MAX_PARTICIPANTS);
  });

  it('never returns a capacity below one', () => {
    // A stored 0 or a negative would otherwise lock everyone out of a meeting
    // that already exists, host included.
    expect(effectiveCapacity(0)).toBe(1);
    expect(effectiveCapacity(-5)).toBe(1);
  });
});
