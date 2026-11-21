// Voice calls, stage 1 (SPEC.md 16.2): call records are memory-only side rows in one-on-one chats, and call.relay hands
// a connection that holds the chat a relay (TURN) credential in the shared-secret REST scheme, or `unavailable`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { Store } from '../src/store.js';
import { parseDocPath } from '../src/paths.js';
import { parseTurn } from '../src/config.js';
import { CALL_CT_MAX, MAX_BYTES } from '../src/schemas.js';
import { startServer, connect, signup, makeIdentity, cap, label, createChat, groupDoc, dmDoc, DMID, CID, TAG, throwsCode, sleep } from './helpers.js';

const TURN = { urls: ['turn:relay.example.com:3478?transport=udp', 'turns:relay.example.com:5349?transport=tcp'], secret: 'a-long-shared-secret-for-tests', ttl: 3600 };
const rec = (over = {}) => ({ ts: Date.now(), iv: 'aXY=', ct: 'c2ln', ...over });
const callPath = (cid, id = label()) => `channels/${cid}/call/${id}`;

test('a call record lives under a chat at a random 22-character id, in memory', () => {
  const p = parseDocPath(callPath(DMID, TAG));
  assert.equal(p.kind, 'call');
  assert.equal(p.backend, 'memory');
  for (const bad of [`channels/${DMID}/call/0~${TAG}`, `channels/${DMID}/call/short`, `channels/${DMID}/call/${TAG}x`]) assert.throws(() => parseDocPath(bad), /bad id/, bad);
});

test('call records: only ts, iv and ct, a sealed SDP fits, nothing reaches the disk, and they vanish', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hush-call-'));
  const store = new Store({ dataDir: dir, limits: { callTtlMs: 50 } }).open();
  const events = [];
  store.on('change', (e) => events.push(e));
  try {
    const p = callPath(DMID);
    store.set(p, rec({ ct: 'A'.repeat(CALL_CT_MAX) }));
    assert.equal(store.get(p).d.ct.length, CALL_CT_MAX);
    throwsCode(() => store.set(callPath(DMID), rec({ ct: 'A'.repeat(CALL_CT_MAX + 1) })), 'invalid');
    throwsCode(() => store.set(callPath(DMID), rec({ from: 'alice' })), 'invalid');
    throwsCode(() => store.set(callPath(DMID), { ts: Date.now(), iv: 'aXY=' }), 'invalid');
    throwsCode(() => store.set(callPath(DMID), rec({ ts: 'now' })), 'invalid');
    assert.equal(store.query(`channels/${DMID}/call`, { l: 50 }).length, 1);
    const db = new DatabaseSync(join(dir, 'hush.db'), { readOnly: true });
    assert.equal(Number(db.prepare("SELECT COUNT(*) AS n FROM docs WHERE parent LIKE '%/call'").get().n), 0, 'nothing on disk');
    db.close();
    await sleep(80);
    events.length = 0;
    assert.equal(store.prune(), 1);
    assert.equal(store.get(p).d, null);
    assert.deepEqual(events.map((e) => [e.kind, e.type, e.parent]), [['call', 'del', `channels/${DMID}/call`]]);
    assert.equal(store.query(`channels/${DMID}/call`, { l: 50 }).length, 0);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the call record cap is 16000 and agrees with the call collection\'s 16 KB document cap: the longest record is not too large a document', () => {
  assert.equal(CALL_CT_MAX, 16000, 'a full browser audio+video description seals to about 9300 characters (R0, 2026-10-26); 16000 is the insurance');
  assert.equal(MAX_BYTES.call, 16 * 1024);
  const dir = mkdtempSync(join(tmpdir(), 'hush-call-'));
  const store = new Store({ dataDir: dir, limits: { callTtlMs: 50 } }).open();
  try {
    const longest = { ts: 1791600000000, iv: 'A'.repeat(64), ct: 'A'.repeat(CALL_CT_MAX) };   // the longest iv the validator takes and a 13-digit ts: the biggest valid record
    const bytes = Buffer.byteLength(JSON.stringify(longest));
    assert.ok(bytes <= MAX_BYTES.call, `${bytes} bytes fit the ${MAX_BYTES.call}-byte document`);
    assert.equal(bytes, CALL_CT_MAX + 100);
    const p = callPath(DMID);
    store.set(p, longest);
    assert.equal(store.get(p).d.ct.length, 16000);
    throwsCode(() => store.set(callPath(DMID), rec({ ct: 'A'.repeat(16001) })), 'invalid', /call record/);   // one over the record cap, under the document cap: the validator says so
    throwsCode(() => store.set(callPath(DMID), rec({ ct: 'A'.repeat(MAX_BYTES.call) })), 'toolarge');   // the document cap is checked first (store._checkSize before validateForKind): a cap raised alone would be dead
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the relay settings: both or neither, real turn addresses, a long secret, a sane lifetime', () => {
  assert.equal(parseTurn({}), null);
  assert.deepEqual(parseTurn({ HUSH_TURN_URLS: TURN.urls.join(' , '), HUSH_TURN_SECRET: TURN.secret }), { urls: TURN.urls, secret: TURN.secret, ttl: 900 }, 'a quarter of an hour unless set');
  assert.equal(parseTurn({ HUSH_TURN_URLS: 'turn:[::1]:3478', HUSH_TURN_SECRET: TURN.secret, HUSH_TURN_TTL: '600' }).ttl, 600);
  assert.throws(() => parseTurn({ HUSH_TURN_URLS: TURN.urls[0] }), /together/);
  assert.throws(() => parseTurn({ HUSH_TURN_SECRET: TURN.secret }), /together/);
  assert.throws(() => parseTurn({ HUSH_TURN_URLS: 'stun:stun.example.com:3478', HUSH_TURN_SECRET: TURN.secret }), /not a turn/);
  assert.throws(() => parseTurn({ HUSH_TURN_URLS: 'turn:relay.example.com?transport=sctp', HUSH_TURN_SECRET: TURN.secret }), /not a turn/);
  assert.throws(() => parseTurn({ HUSH_TURN_URLS: TURN.urls[0], HUSH_TURN_SECRET: 'short' }), /too short/);
  assert.throws(() => parseTurn({ HUSH_TURN_URLS: TURN.urls[0], HUSH_TURN_SECRET: TURN.secret, HUSH_TURN_TTL: '30' }), /seconds/);
});

// Alice and Bob share a one-on-one chat; Carol holds no key for it; all three are in a group.
let S, A, B, C, G;
before(async () => {
  S = await startServer({ authz: 'standard', turn: TURN, limits: { callTtlMs: 300, callSignalsPerMin: 3, relaysPerMinPerAddr: 4 } });
  const [alice, bob, carol] = await Promise.all([makeIdentity('alice'), makeIdentity('bob'), makeIdentity('carol')]);
  A = await signup(S.url, alice); B = await signup(S.url, bob); C = await signup(S.url, carol);
  const m = cap();
  await createChat(A, DMID, dmDoc(), { m });
  await B.ok('chat.open', { cid: DMID, cap: m });
  ({ caps: G } = await createChat(A, CID, groupDoc()));
  await B.ok('chat.open', { cid: CID, cap: G.m });
  await C.ok('chat.open', { cid: CID, cap: G.m });
});
after(async () => { await A.close(); await B.close(); await C.close(); await S.stop(); });

test('call records are pushed live to the other side of the chat and vanish on their own', async () => {
  await B.ok('sub', { s: 'call', p: `channels/${DMID}/call`, l: 50 });
  await B.waitPush((f) => f.s === 'call' && f.t === 'init');
  const id = label();
  await A.ok('set', { p: callPath(DMID, id), d: rec() });
  const got = await B.waitPush((f) => f.s === 'call' && f.t === 'set');
  assert.equal(got.id, id);
  assert.deepEqual(Object.keys(got.d).sort(), ['ct', 'iv', 'ts']);
  await sleep(350);
  S.srv.prune();
  assert.equal((await B.waitPush((f) => f.s === 'call' && f.t === 'del')).id, id);
  await B.ok('unsub', { s: 'call' });
});

test('only the two people in a one-on-one chat can write or watch its call records', async () => {
  assert.equal((await C.call('set', { p: callPath(DMID), d: rec() })).e, 'denied', 'no key for the chat');
  assert.equal((await C.call('sub', { s: 1, p: `channels/${DMID}/call`, l: 50 })).e, 'denied');
  assert.equal((await C.call('query', { p: `channels/${DMID}/call`, l: 50 })).e, 'denied');
  assert.equal((await B.call('set', { p: callPath(CID), d: rec() })).e, 'denied', 'not in a group, though a member');
  assert.equal((await B.call('sub', { s: 2, p: `channels/${CID}/call`, l: 50 })).e, 'denied');
  const anon = await connect(S.url); await anon.hello();
  assert.equal((await anon.call('set', { p: callPath(DMID), d: rec() })).e, 'unauth');
  await anon.close();
});

test('call records have their own rate per connection', async () => {
  const T = await startServer({ limits: { callSignalsPerMin: 2 } });
  try {
    const a = await connect(T.url); await a.hello();
    assert.equal((await a.call('set', { p: callPath(DMID), d: rec() })).ok, true);
    assert.equal((await a.call('set', { p: callPath(DMID), d: rec() })).ok, true);
    assert.equal((await a.call('set', { p: callPath(DMID), d: rec() })).e, 'ratelimit');
    assert.equal((await a.call('set', { p: `channels/${DMID}/typing/0~${TAG}`, d: rec() })).ok, true, 'typing keeps its own allowance');
    await a.close();
  } finally { await T.stop(); }
});

test('call.relay: a TURN credential in the shared-secret scheme, under a name for the account that names nobody', async () => {
  const before_ = Math.floor(Date.now() / 1000);
  const r = await A.ok('call.relay', { cid: DMID });
  assert.equal(r.ttl, TURN.ttl);
  assert.equal(r.iceServers.length, 1);
  const s = r.iceServers[0];
  assert.deepEqual(s.urls, TURN.urls);
  assert.match(s.username, /^\d{10}:[0-9a-f]{16}$/, 'expiry and 16 hex, nothing else');
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(s.username.split(':')[1], S.srv.tagger.dayName('turn|' + day + '|alice'), 'the account\'s name for today, under the daily salt');
  assert.ok(!/alice|bob/i.test(s.username) && !s.username.includes(DMID));
  const exp = Number(s.username.split(':')[0]);
  assert.ok(exp >= before_ + TURN.ttl && exp <= before_ + TURN.ttl + 5, 'expires a ttl from now');
  assert.equal(s.credential, createHmac('sha1', TURN.secret).update(s.username).digest('base64'), 'the relay can check it with the shared secret');
  const r2 = await B.ok('call.relay', { cid: DMID });
  assert.equal(r2.iceServers[0].username.split(':')[1], S.srv.tagger.dayName('turn|' + day + '|bob'), 'another account, another name');
  assert.notEqual(r2.iceServers[0].username.split(':')[1], s.username.split(':')[1]);
  assert.ok(!('secret' in r2) && !JSON.stringify(r2).includes(TURN.secret));
});

test('call.relay only for a proven connection holding the one-on-one chat, and rate-limited per address', async () => {
  const anon = await connect(S.url); await anon.hello();
  assert.equal((await anon.call('call.relay', { cid: DMID })).e, 'unauth');
  await anon.close();
  assert.equal((await C.call('call.relay', { cid: DMID })).e, 'denied', 'no key for the chat');
  assert.equal((await B.call('call.relay', { cid: CID })).e, 'denied', 'a group is not a call');
  assert.equal((await B.call('call.relay', { cid: 'nope' })).e, 'invalid');
  assert.equal((await B.call('call.relay', {})).e, 'invalid');
  // four a minute per address in this server; the test before used two
  assert.equal((await A.call('call.relay', { cid: DMID })).ok, true);
  assert.equal((await A.call('call.relay', { cid: DMID })).ok, true);
  assert.equal((await B.call('call.relay', { cid: DMID })).e, 'ratelimit', 'counted per address, across connections');
});

test('call.relay without a relay configured: unavailable, never a direct fallback', async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const a = await signup(T.url, await makeIdentity('alice'));
    await createChat(a, DMID, dmDoc(), { m: cap() });
    const r = await a.call('call.relay', { cid: DMID });
    assert.equal(r.e, 'unavailable');
    assert.equal(r.iceServers, undefined);
    await a.close();
  } finally { await T.stop(); }
});

// Alice and Bob in a one-on-one chat on a server of their own, for the limits and names that need one.
async function pair(over) {
  const T = await startServer({ authz: 'standard', turn: TURN, ...over });
  const a = await signup(T.url, await makeIdentity('alice')), b = await signup(T.url, await makeIdentity('bob')), m = cap();
  await createChat(a, DMID, dmDoc(), { m });
  await b.ok('chat.open', { cid: DMID, cap: m });
  return { T, a, b, done: async () => { await a.close(); await b.close(); await T.stop(); } };
}

test('call.relay is rate-limited per account too, and a refusal by one limit spends nothing of the others', async () => {
  let p = await pair({ limits: { relaysPerMinPerAddr: 3, relaysPerMinPerAcct: 2, relaysPerHourPerAcct: 100 } });
  try {
    assert.equal((await p.a.call('call.relay', { cid: DMID })).ok, true);
    assert.equal((await p.a.call('call.relay', { cid: DMID })).ok, true);
    const r = await p.a.call('call.relay', { cid: DMID });
    assert.equal(r.e, 'ratelimit'); assert.match(r.m, /account/);
    assert.equal((await p.b.call('call.relay', { cid: DMID })).ok, true, 'another account from the same address: the address had one left');
    assert.match((await p.b.call('call.relay', { cid: DMID })).m, /from here/, 'and now the address is spent');
  } finally { await p.done(); }
  p = await pair({ limits: { relaysPerMinPerAddr: 100, relaysPerMinPerAcct: 100, relaysPerHourPerAcct: 2 } });
  try {
    assert.equal((await p.a.call('call.relay', { cid: DMID })).ok, true);
    assert.equal((await p.a.call('call.relay', { cid: DMID })).ok, true);
    assert.equal((await p.a.call('call.relay', { cid: DMID })).e, 'ratelimit', 'per hour');
    assert.equal((await p.b.call('call.relay', { cid: DMID })).ok, true);
  } finally { await p.done(); }
});

test('the relay name for an account changes with the UTC day', async () => {
  let t = Date.parse('2026-10-16T23:59:00Z');
  const p = await pair({ now: () => t });
  try {
    const name = async () => (await p.a.ok('call.relay', { cid: DMID })).iceServers[0].username;
    const u1 = await name(), u2 = await name();
    assert.equal(u1, u2, 'the same within a day (and a second)');
    assert.equal(Number(u1.split(':')[0]), Math.floor(t / 1000) + TURN.ttl);
    t += 120_000;
    const u3 = await name();
    assert.notEqual(u3.split(':')[1], u1.split(':')[1], 'a new day, a new name');
    assert.ok(![u1, u3].some((u) => /alice/.test(u)));
  } finally { await p.done(); }
});

test('a call watch can ask for the newest records first, so a flood of older ones cannot hide a new one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hush-call-'));
  const store = new Store({ dataDir: dir }).open();
  try {
    const t = Date.now();
    for (let i = 0; i < 60; i++) store.set(callPath(DMID), rec({ ts: t - 60_000 + i }));
    const fresh = label();
    store.set(callPath(DMID, fresh), rec({ ts: t }));
    const got = store.query(`channels/${DMID}/call`, { o: ['ts', 'desc'], l: 50 });
    assert.equal(got.length, 50);
    assert.equal(got[0].id, fresh);
    const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
    assert.match(ui, /collection\('channels\/'\+cid\+'\/call'\)\.orderBy\('ts','desc'\)\.limit\(50\)/, 'and the page does');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the relay config: it forwards only to this server, and only to the relay ports there (hush-turn.nft)', () => {
  const file = (n) => readFileSync(new URL('../scripts/' + n, import.meta.url), 'utf8');
  const conf = file('turnserver.conf.example'), nft = file('hush-turn.nft'), unit = file('hush-turn-nft.service');
  const opts = conf.split('\n').filter((l) => l && !l.startsWith('#'));
  assert.deepEqual(opts.filter((l) => l.startsWith('allowed-peer-ip=')), ['allowed-peer-ip=<server address>']);
  for (const l of ['denied-peer-ip=0.0.0.0-255.255.255.255', 'denied-peer-ip=::-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff', 'user-quota=12', 'total-quota=600', 'use-auth-secret'])
    assert.ok(opts.includes(l), l);
  const port = (k) => Number(opts.find((l) => l.startsWith(k + '=')).split('=')[1]);
  assert.ok(nft.includes(`meta skuid turnserver ip daddr <server address> udp sport ${port('min-port')}-${port('max-port')} udp dport != ${port('min-port')}-${port('max-port')} drop`), 'the same ports as the relay\'s');
  assert.match(nft, /^table inet hush_turn\ndelete table inet hush_turn\ntable inet hush_turn \{\n\tchain out \{\n(?:\t\t#[^\n]*\n)?\t\ttype filter hook output priority -1; policy accept;\n/m);
  for (const l of ['Type=oneshot', 'RemainAfterExit=yes', 'ExecStart=/usr/sbin/nft -f /etc/hush/turn.nft', 'ExecStop=/usr/sbin/nft delete table inet hush_turn', 'Before=hush-turn.service', 'WantedBy=multi-user.target'])
    assert.ok(unit.split('\n').includes(l), l);
});
