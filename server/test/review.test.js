// Stage 7 security review: the limits of SPEC.md 9.4 that were missing, sealed metadata bound to its epoch,
// constant-time hash checks, and the page refusing stale metadata and replayed key wraps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { startServer, connect, connectAs, signup, solveSignup, makeIdentity, makeDevice, signText, sessionMsg, directoryDoc, cap, label, wrap, sealed, CAPS, groupDoc, createChat, TAG } from './helpers.js';
import { hashEq, SYSTEM } from '../src/store.js';
import { loadConfig } from '../src/config.js';
import { DEFAULT_LIMITS } from '../src/limits.js';
import { NOTE_BYTES } from '../src/schemas.js';

const gid = (n) => 'g' + String(n).padStart(12, '0');
const post = () => ({ sl: 1, ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: 'a'.repeat(64), on: 0 });

test('blind-address lookups are counted per address and per path, whoever asks', async () => {
  const S = await startServer({ authz: 'standard', limits: { blindReadsPerMinPerAddr: 3 } });
  try {
    const anon = await connect(S.url); await anon.hello();                 // the login screen reads before any proof
    const addr = 'A'.repeat(43);
    for (let i = 0; i < 3; i++) assert.equal((await anon.call('get', { p: 'accounts/' + addr })).ok, true);
    assert.equal((await anon.call('get', { p: 'logins/' + addr })).e, 'ratelimit', 'the fourth lookup from this address waits');
    assert.equal((await anon.call('get', { p: 'directory/nobody' })).ok, true, 'other reads are untouched');
    await anon.close();
  } finally { await S.stop(); }
  const T = await startServer({ authz: 'standard', limits: { blindReadsPerHourPerPath: 2 } });
  try {
    const A = await signup(T.url, await makeIdentity('alice'));
    const addr = 'B'.repeat(43);
    for (let i = 0; i < 2; i++) assert.equal((await A.call('get', { p: 'logins/' + addr })).ok, true);
    assert.equal((await A.call('get', { p: 'logins/' + addr })).e, 'ratelimit', 'one address may be probed so often an hour');
    assert.equal((await A.call('get', { p: 'logins/' + 'C'.repeat(43) })).ok, true, 'another address has its own count');
    assert.equal((await A.call('mget', { ps: ['logins/' + addr] })).e, 'ratelimit', 'mget counts the same way');
    await A.close();
  } finally { await T.stop(); }
});

test('a new account brings proof of work; a per-address count stays only as a backstop', async () => {
  const S = await startServer({ authz: 'standard', limits: { signupPowBits: 12, signupsPerDayPerAddr: 2 } });
  try {
    const alice = await makeIdentity('alice');
    const c = await connectAs(S.url, alice, { pub: true });
    const r = await c.call('set', { p: 'directory/alice', d: directoryDoc(alice) });
    assert.equal(r.e, 'pow', 'the create is refused until the puzzle is solved');
    assert.equal(r.bits, 12); assert.match(r.salt, /^[A-Za-z0-9_-]{22}$/);
    assert.equal((await c.call('set', { p: 'directory/alice', d: directoryDoc(alice), pow: 'nope' })).e, 'pow', 'a wrong answer');
    const { salt, bits } = await c.ok('signup.pow');
    assert.equal(salt, r.salt, 'the puzzle is the connection\'s, the same whether asked for early or told about late');
    await c.ok('set', { p: 'directory/alice', d: directoryDoc(alice), pow: solveSignup(salt, bits) });
    await c.close();
    const B = await signup(S.url, await makeIdentity('bob')); await B.close();
    await assert.rejects(signup(S.url, await makeIdentity('carol')), /ratelimit/, 'the backstop: so many new accounts per address a day, with their puzzles solved');
    const again = await connectAs(S.url, alice);
    assert.equal((await again.call('set', { p: 'directory/alice', d: { ...directoryDoc(alice), name: 'Alice' } })).ok, true, 'rewriting an existing profile needs no puzzle');
    await again.close();
    assert.notEqual(S.srv.tagger.tagDay('1.2.3.4'), S.srv.tagger.tag('1.2.3.4'), 'the daily tag is its own salt');
    assert.equal(DEFAULT_LIMITS.signupsPerDayPerAddr, 10, 'the backstop itself: ten a day (release 62; the test helper lifts it to 1000)');
  } finally { await S.stop(); }
});

test('boxes made before signing in are counted per address a day and refused on a full disk; a signed-in account\'s own are not counted', async () => {
  const box = (n = 4) => ({ iv: 'aXY=', ct: 'Y'.repeat(n) });
  const S = await startServer({ authz: 'standard', limits: { anonBoxesPerDayPerAddr: 3, anonBoxBytesPerDayPerAddr: 200 } });
  try {
    const anon = await connect(S.url); await anon.hello();
    assert.equal((await anon.call('set', { p: 'accounts/' + 'A'.repeat(43), d: box() })).ok, true);
    assert.equal((await anon.call('set', { p: 'vault/v' + 'b'.repeat(32), d: { ...box(), ts: 1 } })).ok, true);
    assert.equal((await anon.call('set', { p: 'vault/v' + 'c'.repeat(32), d: { ...box(160), ts: 1 } })).e, 'ratelimit', 'the third would pass the day\'s bytes');
    assert.equal((await anon.call('set', { p: 'logins/' + 'D'.repeat(43), d: { ts: 1 } })).e, 'ratelimit', 'and the day\'s count is used up');
    assert.equal((await anon.call('set', { p: 'vault/v' + 'b'.repeat(32), d: { ...box(), ts: 2 } })).ok, true, 'replacing a box that is there is not a new box');
    const other = await connect(S.url, { headers: { 'x-forwarded-for': '203.0.113.9' } }); await other.hello();
    assert.equal((await other.call('set', { p: 'logins/' + 'E'.repeat(43), d: { ts: 1 } })).ok, true, 'another address has its own day');
    const A = await signup(S.url, await makeIdentity('alice'));
    for (const k of ['f', 'g', 'h', 'i']) assert.equal((await A.call('set', { p: 'vault/v' + k.repeat(32), d: { ...box(), ts: 1 } })).ok, true, 'signed in: the address count does not apply');
    await anon.close(); await other.close(); await A.close();
  } finally { await S.stop(); }
  const U = await startServer({ authz: 'standard', limits: { boxesPerDayPerAcct: 2, boxBytesPerDayPerAcct: 400 } });
  try {
    const alice = await makeIdentity('alice'), A1 = await signup(U.url, alice), A2 = await connectAs(U.url, alice);
    assert.equal((await A1.call('set', { p: 'vault/v' + 'a'.repeat(32), d: { ...box(), ts: 1 } })).ok, true);
    assert.equal((await A2.call('set', { p: 'backup/b' + 'b'.repeat(32), d: { ...box(), ts: 1 }, was: 0 })).ok, true, 'on another socket');
    assert.equal((await A1.call('set', { p: 'vault/v' + 'c'.repeat(32), d: { ...box(), ts: 1 } })).e, 'ratelimit', 'the account\'s day is used up, whatever the socket');
    assert.equal((await A2.call('set', { p: 'vault/v' + 'a'.repeat(32), d: { ...box(), ts: 2 } })).ok, true, 'replacing its own box is not a new box');
    const B = await signup(U.url, await makeIdentity('bob'));
    assert.equal((await B.call('set', { p: 'vault/v' + 'd'.repeat(32), d: { ...box(), ts: 1 } })).ok, true, 'another account has its own day...');
    assert.equal((await B.call('set', { p: 'vault/v' + 'e'.repeat(32), d: { ...box(380), ts: 1 } })).e, 'ratelimit', '...and its own bytes');
    const anon = await connect(U.url); await anon.hello();
    assert.equal((await anon.call('set', { p: 'logins/' + 'F'.repeat(43), d: { ts: 1 } })).ok, true, 'the address count before signing in is a separate one');
    await A1.close(); await A2.close(); await B.close(); await anon.close();
  } finally { await U.stop(); }
  const T = await startServer({ authz: 'standard', diskFree: () => ({ free: 1e9, total: 40e9 }) });
  try {
    const A = await signup(T.url, await makeIdentity('alice'));   // a profile is not a box: a sign-up still works
    assert.equal((await A.call('set', { p: 'vault/v' + 'a'.repeat(32), d: { ...box(), ts: 1 } })).e, 'full', 'no new box on a nearly full disk, signed in or not');
    const anon = await connect(T.url); await anon.hello();
    assert.equal((await anon.call('set', { p: 'accounts/' + 'A'.repeat(43), d: box() })).e, 'full');
    T.srv.store.set('vault/v' + 'b'.repeat(32), { ...box(), ts: 1 }, SYSTEM);
    assert.equal((await anon.call('set', { p: 'vault/v' + 'b'.repeat(32), d: { ...box(), ts: 2 } })).ok, true, 'a box already there may still be replaced');
    assert.equal((await A.call('set', { p: `channels/${gid(1)}/posts/pOsT00000001`, d: post() })).e, 'denied', 'other writes are not the disk guard\'s business (this one wants a chat key)');
    await anon.close(); await A.close();
  } finally { await T.stop(); }
});

test('chat creates are counted per account, whatever the socket', async () => {
  const S = await startServer({ authz: 'standard', limits: { chatCreatesPerDay: 2 } });
  try {
    const alice = await makeIdentity('alice');
    const A1 = await signup(S.url, alice), A2 = await connectAs(S.url, alice);
    await createChat(A1, gid(1), groupDoc());
    await createChat(A2, gid(2), groupDoc());
    assert.equal((await A2.call('chat.create', { cid: gid(3), d: groupDoc(), caps: CAPS() })).e, 'ratelimit', 'a second socket is not a second allowance');
    assert.equal((await A1.call('chat.create', { cid: gid(3), d: groupDoc(), caps: CAPS() })).e, 'ratelimit');
    const A3 = await connectAs(S.url, alice);
    assert.equal((await A3.call('chat.create', { cid: gid(3), d: groupDoc(), caps: CAPS() })).e, 'ratelimit', 'nor is a fresh one');
    const B = await signup(S.url, await makeIdentity('bob'));
    await createChat(B, gid(4), groupDoc());
    const anon = await connect(S.url); await anon.hello();
    assert.equal((await anon.call('chat.create', { cid: gid(5), d: groupDoc(), caps: CAPS() })).e, 'unauth');
    await A1.close(); await A2.close(); await A3.close(); await B.close(); await anon.close();
  } finally { await S.stop(); }
});

test('so many sockets open at once per address; the next is refused at the upgrade', async () => {
  const S = await startServer();
  try {
    const from = (a) => connect(S.url, { headers: { 'x-forwarded-for': a } });
    const open = [];
    for (let i = 0; i < 40; i++) open.push(await from('203.0.113.77'));
    await assert.rejects(from('203.0.113.77'), /http 429|ECONNRESET|socket hang up/, 'the 41st');
    S.srv.tagger.rotate(); S.srv.tagger.rotateDay();
    await assert.rejects(from('203.0.113.77'), /http 429|ECONNRESET|socket hang up/, 'a salt rotation is not a fresh allowance: the count is "open at once"');
    const other = await from('203.0.113.78'); await other.hello();   // another address is not held back
    await open.pop().close();
    const again = await from('203.0.113.77'); await again.hello();   // one closed: one more fits
    await assert.rejects(from('203.0.113.77'), /http 429|ECONNRESET|socket hang up/);
    assert.equal(S.srv.conns.size, 41, '39 left open, the other address, and the one that fit');
    await other.close(); await again.close();
    for (const c of open) await c.close();
  } finally { await S.stop(); }
});

test('with nothing listed, only a page served from this host may connect; HUSH_ORIGINS=* turns the check off', async () => {
  assert.equal(loadConfig({}).trustProxy, false, 'forwarded addresses are not trusted unless said so');
  assert.deepEqual(loadConfig({}).origins, []);
  assert.equal(loadConfig({ HUSH_ORIGINS: '*' }).origins, 'any');
  assert.equal(loadConfig({ HUSH_TRUST_PROXY: '1' }).trustProxy, true);
  const S = await startServer({ origins: [] });                      // the default outside the tests
  try {
    const host = new URL(S.httpUrl).host;
    await assert.rejects(connect(S.url), /403|ECONNRESET|socket hang up/, 'no Origin at all: not a page served here');
    await assert.rejects(connect(S.url, { headers: { Origin: 'https://evil.example' } }), /403|ECONNRESET|socket hang up/);
    const same = await connect(S.url, { headers: { Origin: 'http://' + host } }); await same.hello(); await same.close();
    const tls = await connect(S.url, { headers: { Origin: 'https://' + host } }); await tls.hello(); await tls.close();   // Caddy in front: the scheme differs, the host is the same
    assert.equal((await fetch(S.httpUrl + '/media/limits', { headers: { origin: 'https://evil.example' } })).headers.get('access-control-allow-origin'), null, 'no CORS for a stranger');
    assert.equal((await fetch(S.httpUrl + '/media/limits', { headers: { origin: 'http://' + host } })).headers.get('access-control-allow-origin'), 'http://' + host);
  } finally { await S.stop(); }
});

test('with nothing listed, POST /wake and POST /drop answer another site\'s page, or Origin null, with 403 denied before anything is counted; this host\'s page, a listed origin and a request with no Origin are processed as before', async () => {
  const sent = [], apns = { close() {}, send(x) { sent.push(x); return Promise.resolve({ status: 200, reason: '' }); } };   // Apple, standing in
  // A simple request (text/plain, so no preflight): what a form or a script on any site can make a visitor's browser send.
  const send = (T, path, body, origin) => fetch(T.httpUrl + path, { method: 'POST', headers: { 'content-type': 'text/plain', ...(origin === undefined ? {} : { origin }) }, body: JSON.stringify(body) });
  const code = async (r) => { const t = await r.text(); try { return JSON.parse(t).e; } catch { return t; } };   // a 204 has no body
  const note = { epk: { x: 'x'.repeat(43), y: 'y'.repeat(43) }, iv: 'aXY=', ct: Buffer.alloc(NOTE_BYTES, 7).toString('base64') };
  const S = await startServer({ authz: 'standard', origins: [], apns });   // the default outside the tests
  try {
    const host = new URL(S.httpUrl).host;
    // bob signs up on a page served here, lists his phone and hands out one call ticket for it
    const bob = await makeIdentity('bob'), phone = await makeDevice(bob);
    const B = await connect(S.url, { headers: { Origin: 'http://' + host } });
    const { nonce } = await B.hello();
    await B.ok('prove', { h: 'bob', sig: await signText(bob.sigKey, sessionMsg(nonce, 'bob')), pub: bob.sig });
    const { salt, bits } = await B.ok('signup.pow');
    await B.ok('set', { p: 'directory/bob', d: directoryDoc(bob), pow: solveSignup(salt, bits) });
    await B.ok('update', { p: 'directory/bob', d: { devs: { [phone.id]: phone.entry } } });
    await B.ok('push.set', { dev: phone.id, tok: 'ab'.repeat(32), env: 'prod' });
    const [tk] = (await B.ok('wake.mint', { dev: phone.id })).tickets;
    await B.close();
    const tries = [];
    for (const origin of ['https://evil.example', 'null']) {   // 'null': a sandboxed frame, or a form under no-referrer
      const w = await send(S, '/wake', { tk }, origin), d = await send(S, '/drop', { to: 'bob', blob: note }, origin);
      tries.push({ origin, wake: [w.status, await code(w)], drop: [d.status, await code(d)] });
    }
    assert.deepEqual(tries, [{ origin: 'https://evil.example', wake: [403, 'denied'], drop: [403, 'denied'] }, { origin: 'null', wake: [403, 'denied'], drop: [403, 'denied'] }]);
    assert.equal(S.srv.wakes.addr.size + S.srv.wakes.minute.size + S.srv.wakes.hour.size, 0, 'no wake allowance was spent, the address\'s or the ticket\'s');
    assert.equal(S.srv.drops.addr.size + S.srv.drops.recipient.size, 0, 'nor a drop allowance, and no note was filed');
    assert.equal(sent.length, 0, 'the phone did not ring');
    // This host's own page (behind Caddy only the scheme differs) and a request with no Origin at all (curl, the install
    // scripts' check): processed as before.
    for (const origin of ['https://' + host, undefined]) {
      assert.equal((await send(S, '/wake', { tk }, origin)).status, 204);
      assert.equal((await (await send(S, '/drop', { to: 'bob', blob: note }, origin)).json()).ok, true, 'a note filed for bob');
    }
    assert.equal(sent.length, 2, 'both rang the phone');
  } finally { await S.stop(); }
  const T = await startServer({ origins: ['https://app.example'] });   // a page on a separate static host, listed in HUSH_ORIGINS
  try {
    assert.equal((await send(T, '/wake', { tk: 'A'.repeat(22) }, 'https://app.example')).status, 204);
    assert.equal((await send(T, '/drop', { to: 'nobody', blob: note }, 'https://app.example')).status, 404, 'it looked for the mailbox');
    assert.deepEqual([T.srv.wakes.addr.size, T.srv.drops.addr.size], [1, 1], 'both processed, and counted');
    assert.equal((await send(T, '/wake', { tk: 'A'.repeat(22) }, 'https://evil.example')).status, 403, 'another site is still refused');
  } finally { await T.stop(); }
});

test('searches, chat creation, posts, side marks and profile reads each have their own rate', async () => {
  const S = await startServer({ authz: 'standard', limits: { searchPerMin: 2, chatCreatesPerDay: 2, postsPerMin: 2, sideWritesPerMin: 2, directoryReadsPerMin: 4, invitesPerMinPerAddr: 2 } });
  try {
    const A = await signup(S.url, await makeIdentity('alice'));
    const q = { p: 'search', w: [['h', '>=', 'a'], ['h', '<', 'b']], l: 5 };
    assert.equal((await A.call('query', q)).ok, true); assert.equal((await A.call('query', q)).ok, true);
    assert.equal((await A.call('query', q)).e, 'ratelimit', 'search');
    await createChat(A, gid(1), groupDoc()); await createChat(A, gid(2), groupDoc());
    assert.equal((await A.call('chat.create', { cid: gid(3), d: groupDoc(), caps: CAPS() })).e, 'ratelimit', 'chat.create');
    assert.equal((await A.call('set', { p: `channels/${gid(1)}/posts/pOsT00000001`, d: post() })).ok, true);
    assert.equal((await A.call('set', { p: `channels/${gid(1)}/posts/pOsT00000002`, d: post() })).ok, true);
    assert.equal((await A.call('add', { p: `channels/${gid(1)}/posts`, d: post() })).e, 'ratelimit', 'posts, add included');
    const mark = { ts: Date.now(), iv: 'aXY=', ct: 'c2ln' };
    assert.equal((await A.call('set', { p: `channels/${gid(1)}/typing/0~${TAG}`, d: mark })).ok, true);
    assert.equal((await A.call('set', { p: `channels/${gid(1)}/reads/0~${TAG}`, d: mark })).ok, true);
    assert.equal((await A.call('set', { p: `channels/${gid(1)}/typing/0~${TAG}`, d: mark })).e, 'ratelimit', 'side marks');
    assert.equal((await A.call('update', { p: `channels/${gid(1)}`, d: { ts: Date.now() } })).ok, true, 'the chat record itself is not a side mark');
    for (let i = 0; i < 2; i++) assert.equal((await A.call('chat.invite', { cid: gid(1), iid: 'iNvItE000001' })).e, 'notfound');
    assert.equal((await A.call('chat.invite', { cid: gid(1), iid: 'iNvItE000001' })).e, 'ratelimit', 'invite lookups, per address');
    const B = await connect(S.url); await B.hello();
    assert.equal((await B.call('mget', { ps: ['directory/one', 'directory/two', 'directory/three', 'directory/four'] })).ok, true, 'every path of an mget counts');
    assert.equal((await B.call('get', { p: 'directory/five' })).e, 'ratelimit', 'the directory cannot be walked');
    await A.close(); await B.close();
  } finally { await S.stop(); }
});

test('sealed metadata is accepted only under the chat\'s current epoch', async () => {
  const S = await startServer({ authz: 'standard' });
  try {
    const A = await signup(S.url, await makeIdentity('alice'));
    const caps = CAPS();
    assert.equal((await A.call('chat.create', { cid: gid(7), d: groupDoc({ meta: sealed(1) }), caps })).e, 'invalid', 'created at epoch 0 with meta from epoch 1');
    await createChat(A, gid(7), groupDoc({ meta: sealed(0) }), caps);
    const rot = (epoch, meta) => A.call('chat.rotate', { cid: gid(7), epoch, keys: { [label()]: wrap() }, cap: cap(), ...(meta === undefined ? {} : { meta }) });
    assert.equal((await rot(1, sealed(0))).e, 'invalid', 'a rotation with yesterday\'s meta');
    assert.equal((await rot(1, sealed(1))).ok, true);
    assert.equal((await A.call('update', { p: 'channels/' + gid(7), d: { meta: sealed(0) } })).e, 'invalid', 'an edit cannot put old meta back');
    assert.equal((await A.call('update', { p: 'channels/' + gid(7), d: { meta: sealed(1) } })).ok, true);
    assert.equal((await A.call('update', { p: 'channels/' + gid(7), d: { ts: Date.now() } })).ok, true, 'other edits do not touch meta');
    await A.close();
  } finally { await S.stop(); }
});

test('hashes of keys and proofs are compared in constant time', () => {
  const h = 'ab'.repeat(32);
  assert.equal(hashEq(h, h), true);
  assert.equal(hashEq(h, 'ab'.repeat(31) + 'ac'), false);
  assert.equal(hashEq(h, h.slice(1)), false, 'different lengths');
  assert.equal(hashEq(h, null), false);
  assert.equal(hashEq(undefined, h), false);
});

// The page's crypto file, run with stubs for the handful of page names it reaches for at call time.
function pageCrypto() {
  const src = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
  const build = new Function('S', 'ls', 'typeOf', 'epochOf', 'keyMap', 'dmPeer', 'validHandle', 'loadDir', 'P', 'saveContacts', 'renderBanner', 'openSetupLogin', 'normPhone', 'dispOk',
    src + '\nreturn { newIdentity, readMeta, convKey, sealMeta, wrapTo, wrapSalt, wrapKey, ksPut, b64, ownTok, ownerCap, bundleOf, idFromBundle };');
  const m = new Map();
  const ls = { get: (k, d) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : d), set: (k, v) => { if (v == null) m.delete(k); else m.set(k, JSON.parse(JSON.stringify(v))); } };
  const S = { me: null, keys: new Map(), chanKeys: new Map(), prefs: null, dir: {}, pins: null, ks: null, ksFor: null, dmPeers: {} };
  const page = build(S, ls, (c) => (c && c.type) || 'channel', (c) => (c.epoch == null ? 0 : c.epoch), (c, e) => (c.keys && c.keys[e]) || null, () => null,
    (h) => /^[a-z0-9_]{3,20}$/.test(h), async () => false, () => S.prefs || (S.prefs = {}), () => {}, () => {}, () => {}, (s) => s, (d, h) => d === h);
  return { S, page };
}

test('the page ignores sealed metadata from another epoch', async () => {
  const { S, page } = pageCrypto();
  const alice = await page.newIdentity(); S.me = { handle: 'alice', ...alice };
  const cid = gid(11), raw1 = randomBytes(32);
  page.ksPut(cid, 1, page.b64(raw1));
  const meta1 = await page.sealMeta(cid, 1, raw1, { name: 'Before the removal', members: ['alice', 'bob', 'carol'] });
  const c = { id: cid, type: 'group', epoch: 2, keys: { 1: {}, 2: {} }, meta: meta1 };
  assert.equal(await page.readMeta(c), null, 'meta sealed under epoch 1 while the chat is at epoch 2 shows nothing');
  c.epoch = 1;
  assert.deepEqual((await page.readMeta(c)).members, ['alice', 'bob', 'carol'], 'the same meta at its own epoch opens');
});

test('a wrap names its epoch: copied into another one it opens to nothing; old-format wraps still open, but never as another epoch\'s key', async () => {
  const { S, page } = pageCrypto();
  const alice = await page.newIdentity(); S.me = { handle: 'alice', ...alice }; S.dir.alice = { handle: 'alice', ecdh: alice.ecdh, sig: alice.sig };
  const cid = gid(12), rawA = randomBytes(32), rawB = randomBytes(32), rawC = randomBytes(32);
  assert.equal(page.wrapSalt(cid, 2, 'alice', 'dev123456789'), `hush-wrap-v2|${cid}|2|alice|dev123456789`);
  assert.equal(page.wrapSalt(cid, undefined, 'alice'), cid + ':alice', 'the salt wraps were made with before stage 7');
  // Today's wraps: made with the epoch in the salt.
  const w1 = await page.wrapKey(rawA, 'alice', cid, 1);
  const c = { id: cid, type: 'group', epoch: 1, keys: { 1: w1 } };
  assert.ok(Buffer.from((await page.convKey(c, 1)).raw).equals(rawA), 'a wrap for epoch 1 opens as epoch 1');
  c.epoch = 2; c.keys[2] = w1;                                              // the same wrap copied into epoch 2 by a server
  assert.equal(await page.convKey(c, 2), null, 'and opens to nothing as epoch 2');
  // Wraps from before stage 7: still opened, with the replay rule as the guard.
  page.ksPut(cid, 1, page.b64(rawA));
  const old = await page.wrapTo(rawA, alice.ecdh, cid + ':alice');
  c.keys[2] = { [label()]: old };
  assert.equal(await page.convKey(c, 2), null, 'an old-format wrap that opens to the epoch-1 key is not epoch 2\'s');
  c.keys[2] = { [label()]: await page.wrapTo(rawB, alice.ecdh, cid + ':alice') };
  assert.ok(Buffer.from((await page.convKey(c, 2)).raw).equals(rawB), 'an old-format wrap of a genuinely new key opens');
  c.epoch = 3; c.keys[3] = await page.wrapKey(rawC, 'alice', cid, 3);
  assert.ok(Buffer.from((await page.convKey(c, 3)).raw).equals(rawC));
});

test('ownership tokens and owner keys come from a dedicated secret for new accounts, from the signing key for old ones', async () => {
  const { S, page } = pageCrypto();
  const fresh = await page.newIdentity();
  assert.match(fresh.own, /^[A-Za-z0-9_-]{43}$/, 'a new account carries its own secret');
  S.me = { handle: 'alice', ...fresh };
  const t1 = await page.ownTok(gid(1), 'pOsT00000001', 0), cap1 = await page.ownerCap(gid(1));
  const { own, ...legacy } = fresh;                                      // an account from before stage 7: no secret
  S.me = { handle: 'alice', ...legacy };
  const t0 = await page.ownTok(gid(1), 'pOsT00000001', 0), cap0 = await page.ownerCap(gid(1));
  assert.notEqual(t1, t0, 'different secrets, different tokens'); assert.notEqual(cap1, cap0);
  S.me = { handle: 'alice', ...legacy }; assert.equal(await page.ownTok(gid(1), 'pOsT00000001', 0), t0, 'and the old derivation is stable, so old messages stay editable');
  const b = page.bundleOf({ handle: 'alice', name: 'Alice', ...fresh });
  assert.equal(b.own, fresh.own, 'the secret travels in the login box, the recovery box and the device handoff');
  assert.equal(page.idFromBundle(b).own, fresh.own);
  assert.equal(page.idFromBundle(page.bundleOf({ handle: 'alice', name: 'Alice', ...legacy })).own, undefined);
});
