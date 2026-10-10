// Password boxes behind the server's gate (SPEC.md 4.5): only the server can turn a login and a stretched password into
// a box address, and it counts the guesses that find no box, per login, whoever makes them. Run at the protocol level
// and with the page's own login code against a real server.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, connect } from './helpers.js';
import { SYSTEM } from '../src/store.js';
import { page, signUpWith, logOut } from './page-auth.js';

const EMAIL = 'jordan.hale@example.com';
const PW = 'blue truck on main street';
const A43 = (ch) => ch.repeat(43);

test('box addresses come only from the server, and only guesses that find nothing are counted, per login', async () => {
  const T = await startServer({ authz: 'standard', limits: { pwMissesPerLogin: 3 } });
  const c = await connect(T.url);
  try {
    await c.hello();
    for (const bad of [{}, { t: 'x', x: A43('a') }, { t: A43('t'), x: 7 }, { t: A43('t') + '=', x: A43('a') }]) assert.equal((await c.call('login.gate', bad)).e, 'invalid');
    const t = A43('T'), t2 = A43('U');
    const a = (await c.ok('login.gate', { t, x: A43('a') })).loc;                       // miss 1 on t: no box yet
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(a, A43('a'), 'the address is not the stretched password itself');
    await c.ok('set', { p: 'accounts/' + a, d: { iv: 'aXY=', ct: 'Y3Q=' } });
    for (let n = 0; n < 6; n++) assert.equal((await c.ok('login.gate', { t, x: A43('a') })).loc, a, 'the right password is never counted');
    assert.notEqual((await c.ok('login.gate', { t: t2, x: A43('a') })).loc, a, 'another login, another address');
    await c.ok('login.gate', { t, x: A43('b') });                                       // miss 2
    await c.ok('login.gate', { t, x: A43('c') });                                       // miss 3
    const r = await c.call('login.gate', { t, x: A43('a') });
    assert.equal(r.e, 'ratelimit', 'out of tries: every answer waits, the right password included, so the wait tells nothing');
    assert.match(r.m, /^too many wrong passwords for this login; wait \d+ minutes?$/);
    const other = await connect(T.url); await other.hello();
    assert.equal((await other.call('login.gate', { t, x: A43('d') })).e, 'ratelimit', 'the count is per login, not per connection or address');
    await other.close();
    assert.ok((await c.ok('login.gate', { t: t2, x: A43('b') })).loc, 'another login is not held back');
  } finally { await c.close(); await T.stop(); }
});

test('another server, with another secret, makes other addresses: nobody can work one out without asking', async () => {
  const T1 = await startServer({ authz: 'standard' }), T2 = await startServer({ authz: 'standard' });
  const c1 = await connect(T1.url), c2 = await connect(T2.url);
  try {
    await c1.hello(); await c2.hello();
    const q = { t: A43('T'), x: A43('a') };
    assert.notEqual((await c1.ok('login.gate', q)).loc, (await c2.ok('login.gate', q)).loc);
  } finally { await c1.close(); await c2.close(); await T1.stop(); await T2.stop(); }
});

test('the page: wrong passwords for one login run out, the right one then waits too, other logins still work', async () => {
  const T = await startServer({ authz: 'standard', limits: { pwMissesPerLogin: 4 } });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const { id } = await signUpWith(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');   // making the email's box is one miss
    pg.close();
    const dev = page(T.url);                       // guesses come from another device, which knows no box address
    await dev.db.ready;
    let refused = null, wrong = 0;
    for (let n = 0; n < 6 && !refused; n++) {
      try { assert.equal((await dev.auth.tryLogin(EMAIL, 'not the password ' + n)).kind, 'wrongpw'); wrong++; }
      catch (e) { refused = e; }
    }
    assert.ok(refused && refused.code === 'ratelimit', 'the login runs out of tries');
    assert.equal(wrong, 3, 'after the miss from sign-up and three wrong passwords');
    assert.match(refused.message, /wait \d+ minute/);
    await assert.rejects(dev.auth.tryLogin(EMAIL, PW), (e) => e.code === 'ratelimit', 'the right password waits as well');
    const r = await dev.auth.tryLogin('jordanhale', PW);
    assert.equal(r.kind, 'in', 'the username is its own login, with its own count');
    assert.equal(r.id.handle, id.handle);
    dev.close();
  } finally { pg.close(); await T.stop(); }
});

test('a box from before the gate opens once at its old address and is moved behind the gate', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const { id, all } = await signUpWith(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');
    // Put both boxes back where release 8 kept them: at the stretched password itself.
    for (const [l, x] of Object.entries(all)) {
      const g = await pg.auth.boxLoc(l, x), d = T.srv.store.get('accounts/' + g, SYSTEM).d;
      assert.ok(d, 'made behind the gate: ' + l);
      T.srv.store.set('accounts/' + x, d, SYSTEM); T.srv.store.delete('accounts/' + g, {}, SYSTEM);
    }
    await logOut(pg);
    const r = await pg.auth.tryLogin(EMAIL, PW);
    assert.equal(r.kind, 'in', 'an old box still opens');
    assert.equal(r.id.handle, id.handle);
    assert.equal(T.srv.store.get('accounts/' + all[EMAIL], SYSTEM).d, null, 'and is gone from its old address');
    assert.ok(T.srv.store.get('accounts/' + await pg.auth.boxLoc(EMAIL, all[EMAIL]), SYSTEM).d, 'and is behind the gate');
    // A signed-in device moves the boxes of its other logins on its next load, without the password.
    await pg.db.prove(await pg.auth.proofFor(r.id));
    pg.S.me = r.id;
    pg.ls.set('hush:login:jordanhale', { login: EMAIL, loc: all[EMAIL], all });
    await pg.auth.healLogin(r.id);
    assert.equal(T.srv.store.get('accounts/' + all.jordanhale, SYSTEM).d, null);
    assert.ok(T.srv.store.get('accounts/' + await pg.auth.boxLoc('jordanhale', all.jordanhale), SYSTEM).d);
    assert.deepEqual(pg.calls.setup, [], 'nothing asked: no box was lost');
  } finally { pg.close(); await T.stop(); }
});
