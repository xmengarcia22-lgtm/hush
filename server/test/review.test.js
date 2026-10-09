// Stage 7 security review: the limits of SPEC.md 9.4 that were missing, sealed metadata bound to its epoch,
// constant-time hash checks, and the page refusing stale metadata and replayed key wraps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { startServer, connect, connectAs, signup, solveSignup, makeIdentity, directoryDoc, cap, label, wrap, sealed, CAPS, groupDoc, createChat, TAG } from './helpers.js';
import { hashEq } from '../src/store.js';
import { loadConfig } from '../src/config.js';

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
    for (let i = 0; i < 2; i++) assert.equal((await A.call('get', { p: 'phones/' + addr })).ok, true);
    assert.equal((await A.call('get', { p: 'phones/' + addr })).e, 'ratelimit', 'one address may be probed so often an hour');
    assert.equal((await A.call('get', { p: 'phones/' + 'C'.repeat(43) })).ok, true, 'another address has its own count');
    assert.equal((await A.call('mget', { ps: ['phones/' + addr] })).e, 'ratelimit', 'mget counts the same way');
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
    const mark = { ts: Date.now(), sg: 'c2ln' };
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
