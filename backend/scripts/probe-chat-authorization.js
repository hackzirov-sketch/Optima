/**
 * Chat authorization probe — `npm run probe:chat-auth`
 *
 * Answers "what happens if someone finds the API and hits it from Postman?"
 * with evidence instead of assurances. Every chat route is behind a JWT guard,
 * but being logged in is not the same as being allowed: this drives the real
 * HTTP surface as an authenticated stranger who has no business in the room.
 *
 * Requires the API running on :8099 and DATABASE_URL/JWT secret in .env. It
 * mints its own tokens rather than logging in, so no passwords are needed.
 * Exits non-zero if any boundary is wrong — safe to wire into CI.
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const API = 'http://localhost:8099/api/v1';
const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

function token(u) {
  return jwt.sign(
    { sub: u.id, email: u.email, jti: 'atk-' + Math.random(), workspaceIds: [] },
    secret, { expiresIn: '10m' });
}

async function call(method, path, tok, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: `optima_access_token=${tok}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try { payload = await res.json(); } catch { /* 204 */ }
  return { status: res.status, code: payload?.error?.code, data: payload?.data };
}

const results = [];
function check(label, expectBlocked, r) {
  const blocked = r.status >= 400;
  const ok = blocked === expectBlocked;
  results.push({ ok, label, got: `${r.status}${r.code ? ' ' + r.code : ''}`,
                 want: expectBlocked ? 'blocked' : 'allowed' });
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows: users } = await c.query(
    `SELECT id, email FROM users WHERE deleted_at IS NULL ORDER BY created_at LIMIT 2`);
  await c.end();

  const owner = token(users[0]);          // creates the channel
  const outsider = token(users[1]);       // never joins it

  // Owner creates a channel, no workspace anywhere in sight.
  const created = await call('POST', '/chat/rooms', owner,
    { type: 'channel', name: 'Security probe ' + Date.now() });
  const roomId = created.data.id;
  console.log(`channel ${roomId} created by ${users[0].email}\n`);

  // ── The owner must be able to run their own channel ────────────────
  check('owner posts to own channel', false,
    await call('POST', `/chat/rooms/${roomId}/messages`, owner,
      { content: 'hello', clientMessageId: crypto.randomUUID() }));
  check('owner renames own channel', false,
    await call('PATCH', `/chat/rooms/${roomId}/settings`, owner, { name: 'Renamed' }));

  // ── An authenticated stranger must not ─────────────────────────────
  check('outsider reads messages', true,
    await call('GET', `/chat/rooms/${roomId}/messages?limit=10`, outsider));
  check('outsider posts a message', true,
    await call('POST', `/chat/rooms/${roomId}/messages`, outsider,
      { content: 'spam', clientMessageId: crypto.randomUUID() }));
  check('outsider renames the channel', true,
    await call('PATCH', `/chat/rooms/${roomId}/settings`, outsider, { name: 'Hijacked' }));
  check('outsider deletes the channel', true,
    await call('DELETE', `/chat/rooms/${roomId}`, outsider));
  check('outsider lists invite links', true,
    await call('GET', `/chat/rooms/${roomId}/invites`, outsider));
  check('outsider creates an invite link', true,
    await call('POST', `/chat/rooms/${roomId}/invites`, outsider, {}));
  check('outsider reads room members', true,
    await call('GET', `/chat/rooms/${roomId}/members`, outsider));
  check('outsider joins as a public room', true,
    await call('POST', `/chat/rooms/${roomId}/join`, outsider, {}));

  // ── Invite links on a workspace-less room ──────────────────────────
  // Regression guard: joinByCode used to insert the joiner into the room's
  // workspace unconditionally, which passed NULL into workspace_members'
  // NOT NULL column for a group/channel that has no workspace at all.
  const invite = await call('POST', `/chat/rooms/${roomId}/invites`, owner, {});
  check('owner creates an invite link', false, invite);
  if (invite.data?.code) {
    check('outsider joins via invite code', false,
      await call('POST', `/chat/join/${invite.data.code}`, outsider, {}));
    check('joined member reads messages', false,
      await call('GET', `/chat/rooms/${roomId}/messages?limit=10`, outsider));
    // Joining a channel does not make you an editor of it.
    check('joined member posts to channel', true,
      await call('POST', `/chat/rooms/${roomId}/messages`, outsider,
        { content: 'nope', clientMessageId: crypto.randomUUID() }));
  }

  // ── Forged / missing credentials ───────────────────────────────────
  check('forged token (wrong secret)', true,
    await call('GET', '/chat/rooms', jwt.sign({ sub: users[1].id }, 'not-the-secret')));
  check('no token at all', true, await call('GET', '/chat/rooms', ''));

  // ── Payload tampering ──────────────────────────────────────────────
  check('unknown field in body', true,
    await call('POST', '/chat/rooms', owner,
      { type: 'channel', name: 'x', isSystem: true }));
  check('forged room type', true,
    await call('POST', '/chat/rooms', owner, { type: 'workspace', name: 'x' }));
  check('DM with self', true,
    await call('POST', '/chat/rooms', owner, { type: 'direct', targetUserId: users[0].id }));

  const pad = Math.max(...results.map((r) => r.label.length));
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(pad)}  want=${r.want.padEnd(7)} got=${r.got}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
