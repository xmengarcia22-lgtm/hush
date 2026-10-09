// The identity plane (SPEC.md 4): proofs, ownership of profile-side records,
// blind-address op rules, and what an unproven connection may still do.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, connect, connectAs, signup, makeIdentity, makeDevice, signText, sessionMsg, directoryDoc, createChat, groupDoc, CID, PID } from './helpers.js';

let S, alice, bob, A, B;
before(async () => {
  S = await startServer({ authz: 'standard' });
  alice = await makeIdentity('alice');
  bob = await makeIdentity('bob');
  A = await signup(S.url, alice);
  B = await signup(S.url, bob);
});
after(async () => { await A.close(); await B.close(); await S.stop(); });

test('sign-up: a fresh key proves a new username and may create exactly that profile', async () => {
  const carol = await makeIdentity('carol');
  const c = await connectAs(S.url, carol, { pub: true });
  assert.equal(c.via, 'signup');
  const dave = await makeIdentity('dave');
  assert.equal((await c.call('set', { p: 'directory/dave', d: directoryDoc(dave) })).e, 'denied', 'not the username that was proven');
  const wrongKey = { ...directoryDoc(carol), sig: dave.sig };
  assert.equal((await c.call('set', { p: 'directory/carol', d: wrongKey })).e, 'denied', 'the key in the profile must be the proving key');
  assert.equal((await c.call('set', { p: 'directory/carol', d: directoryDoc(carol) })).e, 'pow', 'a new account brings proof of work (SPEC.md 9.4)');
  const { solveSignup } = await import('./helpers.js');
  const { salt, bits } = await c.ok('signup.pow');
  await c.ok('set', { p: 'directory/carol', d: directoryDoc(carol), pow: solveSignup(salt, bits) });
  assert.equal((await c.call('prove', { h: 'carol', sig: 'x' })).e, 'conflict', 'one username per connection');
  await c.close();
  await assert.rejects(connectAs(S.url, dave, { pub: false }), /denied/, 'no profile and no key: nothing to verify against');
  await assert.rejects(connectAs(S.url, { ...carol, sigKey: dave.sigKey }, { pub: true }), /denied/, 'the handle exists, so a stranger\'s key is refused');
});

test('log-in: the account key proves an existing username; wrong keys, replays and stale challenges fail', async () => {
  const c = await connectAs(S.url, alice);
  assert.equal(c.via, 'account');
  await c.close();
  const mallory = { ...alice, sigKey: (await makeIdentity('mallory')).sigKey };
  await assert.rejects(connectAs(S.url, mallory), /denied/);
  const r = await connect(S.url);
  const h = await r.hello();
  const sig = await signText(alice.sigKey, sessionMsg(h.nonce, 'alice'));
  assert.equal((await r.call('prove', { h: 'alice', sig })).ok, true);
  assert.equal((await r.call('prove', { h: 'alice', sig })).e, 'conflict', 'a used challenge cannot be replayed on the same connection');
  await r.close();
  const other = await connect(S.url);
  await other.hello();
  assert.equal((await other.call('prove', { h: 'alice', sig })).e, 'denied', 'a signature over another connection\'s challenge is worthless');
  await other.close();
  const T = await startServer({ authz: 'standard', limits: { nonceTtlMs: 50 } });
  try {
    await (async () => { const c2 = await signup(T.url, await makeIdentity('zed')); await c2.close(); })();
    const late = await connect(T.url);
    const hh = await late.hello();
    await new Promise((res) => setTimeout(res, 80));
    const s2 = await signText(alice.sigKey, sessionMsg(hh.nonce, 'zed'));
    assert.equal((await late.call('prove', { h: 'zed', sig: s2 })).e, 'unauth', 'challenges expire');
    await late.close();
  } finally { await T.stop(); }
});

test('device keys: a listed, vouched-for device may prove; unlisted or badly signed ones may not', async () => {
  const d1 = await makeDevice(alice);
  const d2 = await makeDevice(alice, d1);                       // vouched for by d1, like a QR-linked phone
  const bad = await makeDevice(bob);                             // signed by bob's key, planted under alice
  await A.ok('update', { p: 'directory/alice', d: { devs: { [d1.id]: d1.entry, [d2.id]: d2.entry, [bad.id]: bad.entry } } });
  const c1 = await connectAs(S.url, alice, { dev: d1 });
  assert.equal(c1.via, 'device');
  await c1.ok('set', { p: 'presence/alice', d: { ts: Date.now() } });
  await c1.close();
  const c2 = await connectAs(S.url, alice, { dev: d2 });
  assert.equal(c2.via, 'device');
  await c2.close();
  await assert.rejects(connectAs(S.url, alice, { dev: bad }), /denied/, 'a device entry not signed by the account chain');
  await assert.rejects(connectAs(S.url, alice, { dev: { ...d1, id: 'devUnknown01' } }), /denied/, 'an unlisted device id');
  await assert.rejects(connectAs(S.url, alice, { dev: { ...d1, sigKey: bob.sigKey } }), /denied/, 'the right id with the wrong private key');
  await A.ok('update', { p: 'directory/alice', d: { devs: { [bad.id]: null } } });
});

test('profiles: readable by anyone, changed only by their owner, never deleted', async () => {
  const anon = await connect(S.url);
  await anon.hello();
  assert.equal((await anon.ok('get', { p: 'directory/alice' })).d.handle, 'alice', 'sign-up needs to check availability before it has an account');
  assert.equal((await anon.call('update', { p: 'directory/alice', d: { bio: 'x' } })).e, 'unauth');
  await anon.close();
  assert.equal((await B.call('update', { p: 'directory/alice', d: { bio: 'hacked' } })).e, 'denied');
  assert.equal((await B.call('set', { p: 'directory/alice', d: directoryDoc(alice) })).e, 'denied');
  assert.equal((await B.call('delete', { p: 'directory/bob' })).e, 'denied');
  await A.ok('update', { p: 'directory/alice', d: { bio: 'hello' } });
  assert.equal((await B.ok('get', { p: 'directory/alice' })).d.bio, 'hello');
  assert.equal((await B.call('query', { p: 'directory', l: 10 })).e, 'denied');
});

test('key rotation: only with the account key and a higher kv', async () => {
  const next = await makeIdentity('alice');
  const rotated = { ...directoryDoc(alice), ecdh: next.ecdh, sig: next.sig, kv: 2 };
  assert.equal((await A.call('update', { p: 'directory/alice', d: { ecdh: next.ecdh, sig: next.sig } })).e, 'denied', 'new keys with the same kv');
  const d1 = await makeDevice(alice);
  await A.ok('update', { p: 'directory/alice', d: { devs: { [d1.id]: d1.entry } } });
  const viaDevice = await connectAs(S.url, alice, { dev: d1 });
  assert.equal((await viaDevice.call('update', { p: 'directory/alice', d: { ecdh: next.ecdh, sig: next.sig, kv: 2 } })).e, 'denied', 'a device key may not rotate the account keys');
  await viaDevice.close();
  await A.ok('set', { p: 'directory/alice', d: rotated });
  await assert.rejects(connectAs(S.url, alice), /denied/, 'the old key no longer proves');
  const c = await connectAs(S.url, { ...alice, sigKey: next.sigKey });
  assert.equal(c.via, 'account');
  await c.close();
  alice = { ...alice, sigKey: next.sigKey, sig: next.sig, ecdh: next.ecdh };
  await A.close();
  A = await connectAs(S.url, alice);
});

test('presence and search belong to their owner; reading needs a signed-in connection', async () => {
  await A.ok('set', { p: 'presence/alice', d: { ts: Date.now() } });
  assert.equal((await B.call('set', { p: 'presence/alice', d: { ts: 1 } })).e, 'denied');
  assert.equal((await B.ok('get', { p: 'presence/alice' })).d !== null, true);
  await A.ok('set', { p: 'search/alice', d: { h: 'alice', n: 'alice a', n2: 'a' } });
  assert.equal((await B.call('set', { p: 'search/alice', d: { h: 'alice', n: 'x', n2: '' } })).e, 'denied');
  assert.equal((await A.call('set', { p: 'search/alice', d: { h: 'bob', n: 'x', n2: '' } })).e, 'denied', 'an entry must name its owner');
  const found = await B.ok('query', { p: 'search', w: [['n', '>=', 'ali'], ['n', '<=', 'ali']], l: 10 });
  assert.deepEqual(found.docs.map((d) => d.id), ['alice']);
  const anon = await connect(S.url);
  await anon.hello();
  assert.equal((await anon.call('get', { p: 'presence/alice' })).e, 'unauth');
  assert.equal((await anon.call('query', { p: 'search', w: [['n', '>=', 'a'], ['n', '<=', 'a']], l: 10 })).e, 'unauth');
  await anon.close();
});

test('phone entries: a number can only point at the account that registered it', async () => {
  const hash = 'PhoneHash'.padEnd(43, '0');
  await A.ok('set', { p: 'phones/' + hash, d: { handle: 'alice' } });
  assert.equal((await B.call('set', { p: 'phones/' + hash, d: { handle: 'bob' } })).e, 'denied', 'bob cannot take alice\'s number');
  assert.equal((await B.call('set', { p: 'phones/' + hash, d: { handle: 'alice' } })).e, 'denied', 'nor write entries in her name');
  assert.equal((await B.call('delete', { p: 'phones/' + hash })).e, 'denied');
  assert.equal((await B.ok('get', { p: 'phones/' + hash })).d.handle, 'alice', 'lookups are open to signed-in users');
  await A.ok('delete', { p: 'phones/' + hash });
  await B.ok('set', { p: 'phones/' + hash, d: { handle: 'bob' } });
  await B.ok('delete', { p: 'phones/' + hash });
});

test('blind-address boxes follow their fixed rules and need no sign-in', async () => {
  const anon = await connect(S.url);
  await anon.hello();
  const loc = 'Loc'.padEnd(43, 'a'), tag = 'Tag'.padEnd(43, 'b'), vault = 'v' + 'c'.repeat(32), backup = 'b' + 'd'.repeat(32);
  await anon.ok('set', { p: 'accounts/' + loc, d: { iv: 'aXY=', ct: 'Y3Q=' } });
  assert.equal((await anon.call('set', { p: 'accounts/' + loc, d: { iv: 'aXY=', ct: 'bmV3' } })).e, 'exists');
  assert.equal((await anon.call('update', { p: 'accounts/' + loc, d: { ct: 'bmV3' } })).e, 'denied');
  await anon.ok('delete', { p: 'accounts/' + loc });
  await anon.ok('set', { p: 'logins/' + tag, d: { ts: 1 } });
  assert.equal((await anon.call('set', { p: 'logins/' + tag, d: { ts: 2 } })).e, 'exists');
  assert.equal((await anon.call('delete', { p: 'logins/' + tag })).e, 'denied');
  await anon.ok('set', { p: 'vault/' + vault, d: { iv: 'aXY=', ct: 'Y3Q=', ts: 1 } });
  await anon.ok('update', { p: 'vault/' + vault, d: { ts: 2 } });
  assert.equal((await anon.call('delete', { p: 'vault/' + vault })).e, 'denied');
  await anon.ok('set', { p: 'backup/' + backup, d: { iv: 'aXY=', ct: 'Y3Q=', ts: 1 } });
  await anon.ok('delete', { p: 'backup/' + backup });
  await anon.ok('set', { p: 'linkreqs/' + tag, d: { state: 'wait', ts: Date.now(), pub: { x: 'x'.repeat(43), y: 'y'.repeat(43) } } });
  await anon.ok('update', { p: 'linkreqs/' + tag, d: { state: 'no' } });
  await anon.ok('delete', { p: 'linkreqs/' + tag });
  await anon.close();
});

test('chats need a signed-in connection and a room key; owners and uids are gone', async () => {
  const anon = await connect(S.url);
  await anon.hello();
  assert.equal((await anon.call('get', { p: `channels/${CID}` })).e, 'unauth');
  assert.equal((await anon.call('query', { p: `channels/${CID}/posts`, l: 10 })).e, 'unauth');
  await anon.close();
  const { caps } = await createChat(A, CID, groupDoc());
  assert.equal((await B.call('set', { p: `channels/${CID}/posts/${PID}`, d: { sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' } })).e, 'denied', 'signed in is not enough');
  await B.ok('chat.open', { cid: CID, cap: caps.m });
  await B.ok('set', { p: `channels/${CID}/posts/${PID}`, d: { sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' } });
  for (const p of ['owners/alice', 'owners/alice/devices/abc', 'uids/abc']) assert.equal((await A.call('set', { p, d: { token: 't' } })).e, 'invalid', p);
});

test('too many failed proofs from one place earn a pause', async () => {
  const T = await startServer({ authz: 'standard', limits: { proveFailsPer10Min: 2 } });
  try {
    const c = await signup(T.url, await makeIdentity('erin'));
    await c.close();
    const liar = { ...(await makeIdentity('erin')), handle: 'erin' };
    await assert.rejects(connectAs(T.url, liar), /denied/);
    await assert.rejects(connectAs(T.url, liar), /denied/);
    await assert.rejects(connectAs(T.url, liar), /ratelimit/);
  } finally { await T.stop(); }
});

