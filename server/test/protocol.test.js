import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { startServer, connect, sleep, CID, CID2, PID, TAG } from './helpers.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const post = (over = {}) => ({ sl: 1, ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: sha('t0'), on: 0, ...over });

let S;
before(async () => { S = await startServer(); });
after(async () => { await S.stop(); });

test('health check answers and nothing else is served over HTTP', async () => {
  const r = await fetch(S.httpUrl + '/healthz');
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ok');
  assert.equal((await fetch(S.httpUrl + '/anything')).status, 404);
});

test('hello is required first, once, with the right version', async () => {
  const c = await connect(S.url);
  const early = await c.call('get', { p: 'directory/alice' });
  assert.equal(early.e, 'unauth');
  const bad = await c.call('hello', { v: 99 });
  assert.equal(bad.e, 'version');
  const h = await c.hello();
  assert.match(h.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(typeof h.now, 'number');
  assert.equal(h.limits.maxFrameBytes, 1 << 20);
  assert.equal((await c.call('hello', { v: 1 })).e, 'conflict');
  assert.equal((await c.call('nonsense', {})).e, 'invalid');
  assert.equal((await c.call('mail.pull', {})).e, 'invalid');
  const ping = await c.ok('ping');
  assert.equal(typeof ping.now, 'number');
  await c.close();
});

test('malformed frames get an error without an id; too many close the connection', async () => {
  const c = await connect(S.url);
  await c.hello();
  for (let k = 0; k < 4; k++) c.ws.send('not json');
  await c.waitPush((f) => f.ok === false && f.e === 'invalid' && f.i === undefined);
  c.ws.send(JSON.stringify({ op: 'ping' }));
  await c.waitPush((f) => f.t === 'bye');
  const { code } = await c.closed;
  assert.equal(code, 1000);
});

test('document round trip: set, get, update merges, delete, add', async () => {
  const c = await connect(S.url);
  await c.hello();
  const doc = { handle: 'alice', ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' }, name: 'Alice' };
  await c.ok('set', { p: 'directory/alice', d: doc });
  assert.deepEqual((await c.ok('get', { p: 'directory/alice' })).d, doc);
  await c.ok('update', { p: 'directory/alice', d: { name: null, bio: 'hello' } });
  const got = (await c.ok('get', { p: 'directory/alice' })).d;
  assert.equal(got.name, undefined);
  assert.equal(got.bio, 'hello');
  assert.equal((await c.call('update', { p: 'directory/nobody', d: { bio: 'x' } })).e, 'notfound');
  assert.equal((await c.call('set', { p: 'directory/alice', d: { handle: 'alice' } })).e, 'invalid');
  assert.equal((await c.call('set', { p: 'directory/alice' })).e, 'invalid');
  await c.ok('delete', { p: 'directory/alice' });
  assert.equal((await c.ok('get', { p: 'directory/alice' })).d, null);
  const added = await c.ok('add', { p: `channels/${CID}/posts`, d: { sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' } });
  assert.match(added.id, /^[A-Za-z0-9]{12}$/);
  const m = await c.ok('mget', { ps: ['directory/alice', `channels/${CID}/posts/${added.id}`] });
  assert.equal(m.docs[0].d, null);
  assert.equal(m.docs[1].d.sv, 1);
  await c.close();
});

test('live subscription: init, set pushes, non-matching change pushes del, delete pushes del, unsub stops', async () => {
  const a = await connect(S.url);
  const b = await connect(S.url);
  await a.hello(); await b.hello();
  const base = Date.now();
  await b.ok('set', { p: `channels/${CID2}/posts/eArly0000001`, d: post({ ts: base - 5000 }) });

  await a.ok('sub', { s: 1, p: `channels/${CID2}/posts`, w: [['ts', '>=', base - 10000]], o: ['ts', 'desc'], l: 300 });
  const init = await a.waitPush((f) => f.s === 1 && f.t === 'init');
  assert.deepEqual(init.docs.map((d) => d.id), ['eArly0000001']);

  await b.ok('set', { p: `channels/${CID2}/posts/${PID}`, d: post({ ts: base }) });
  const push = await a.waitPush((f) => f.s === 1 && f.t === 'set' && f.id === PID);
  assert.equal(push.d.ts, base);

  await b.ok('set', { p: `channels/${CID2}/posts/tOoOld000001`, d: post({ ts: base - 20000 }) });
  const del = await a.waitPush((f) => f.s === 1 && f.t === 'del' && f.id === 'tOoOld000001');
  assert.ok(del);

  await b.ok('update', { p: `channels/${CID2}/posts/${PID}`, d: { d: 'edited', ot: 't0', oh: sha('t1'), on: 1 } });
  const edited = await a.waitPush((f) => f.s === 1 && f.t === 'set' && f.id === PID);
  assert.equal(edited.d.d, 'edited');

  await b.ok('delete', { p: `channels/${CID2}/posts/${PID}`, ot: 't1' });
  await a.waitPush((f) => f.s === 1 && f.t === 'del' && f.id === PID);

  await a.ok('unsub', { s: 1 });
  await b.ok('set', { p: `channels/${CID2}/posts/aFterUnsub01`, d: post({ ts: base + 1 }) });
  assert.equal(await a.noPush((f) => f.s === 1), true, 'no pushes after unsub');
  await a.close(); await b.close();
});

test('a writer who subscribes sees its own push before the acknowledgement', async () => {
  const c = await connect(S.url);
  await c.hello();
  await c.ok('sub', { s: 7, p: `channels/${CID}/acts`, l: 100 });
  await c.waitPush((f) => f.s === 7 && f.t === 'init');
  const order = [];
  const setId = c.i + 1;   // the id the next call will use
  c.ws.on('message', (m) => { const f = JSON.parse(String(m)); if (f.s === 7 && f.t === 'set') order.push('push'); if (f.i === setId && f.ok) order.push('ack'); });
  await c.ok('set', { p: `channels/${CID}/acts/${PID}~${TAG}~react`, d: { post: PID, kind: 'react', e: 0, iv: 'aXY=', ct: 'Y3Q=', ts: Date.now(), sg: 'sig' } });
  await c.waitPush((f) => f.s === 7 && f.t === 'set');
  assert.deepEqual(order, ['push', 'ack']);
  await c.close();
});

test('watching a fixed set of documents (the chat list pattern)', async () => {
  const a = await connect(S.url);
  const b = await connect(S.url);
  await a.hello(); await b.hello();
  await b.ok('set', { p: `channels/${CID}`, d: { type: 'group', visibility: 'private', epoch: 0, ts: 1 } });
  await a.ok('sub', { s: 'chats', p: 'channels', ids: [CID, CID2] });
  const init = await a.waitPush((f) => f.s === 'chats' && f.t === 'init');
  assert.deepEqual(init.docs.map((d) => d.id), [CID], 'only existing docs appear in init');
  await b.ok('update', { p: `channels/${CID}`, d: { ts: 2, last: { ts: 2, sl: 1 } } });
  const push = await a.waitPush((f) => f.s === 'chats' && f.t === 'set' && f.id === CID);
  assert.equal(push.d.ts, 2);
  await b.ok('set', { p: `channels/${CID2}`, d: { type: 'channel', visibility: 'public', name: 'News', ts: 3 } });
  await a.waitPush((f) => f.s === 'chats' && f.t === 'set' && f.id === CID2);
  await b.ok('set', { p: 'channels/gUnwatched001', d: { type: 'group', ts: 4 } });
  assert.equal(await a.noPush((f) => f.s === 'chats' && f.id === 'gUnwatched001'), true);
  assert.equal((await a.call('sub', { s: 'chats', p: 'channels', ids: [CID] })).e, 'conflict');
  assert.equal((await a.call('sub', { s: 'v', p: 'vault', ids: ['v' + 'a'.repeat(32)] })).e, 'denied');
  assert.equal((await a.call('sub', { s: 'd', p: 'directory', l: 5 })).e, 'denied');
  await a.close(); await b.close();
});

test('typing rows are pushed live and vanish on their own', async () => {
  const T = await startServer({ limits: { typingTtlMs: 300 } });
  try {
    const a = await connect(T.url);
    const b = await connect(T.url);
    await a.hello(); await b.hello();
    await a.ok('sub', { s: 1, p: `channels/${CID}/typing`, l: 200 });
    await a.waitPush((f) => f.t === 'init');
    await b.ok('set', { p: `channels/${CID}/typing/0~${TAG}`, d: { ts: Date.now(), sg: 'sig' } });
    await a.waitPush((f) => f.s === 1 && f.t === 'set');
    await sleep(350);
    T.srv.prune();
    await a.waitPush((f) => f.s === 1 && f.t === 'del');
    await a.close(); await b.close();
  } finally { await T.stop(); }
});

test('frame rate limit and query rate limit', async () => {
  const T = await startServer({ limits: { framesPerMin: 4, queriesPerMin: 1 } });
  try {
    const c = await connect(T.url);
    await c.hello();                                    // frame 1
    await c.ok('ping');                                 // 2
    await c.ok('query', { p: `channels/${CID}/posts`, l: 1 });   // 3
    assert.equal((await c.call('query', { p: `channels/${CID}/posts`, l: 1 })).e, 'ratelimit'); // 4: query bucket empty
    assert.equal((await c.call('ping')).e, 'ratelimit');          // 5: frame bucket empty
    await c.close();
  } finally { await T.stop(); }
});

test('hello deadline and idle timeout close quiet connections politely', async () => {
  const T = await startServer({ limits: { helloDeadlineMs: 200, idleMs: 300 } });
  try {
    const silent = await connect(T.url);
    const bye = await silent.waitPush((f) => f.t === 'bye', 1500);
    assert.equal(bye.reason, 'hello timeout');
    await silent.closed;
    const lazy = await connect(T.url);
    await lazy.hello();
    const bye2 = await lazy.waitPush((f) => f.t === 'bye', 1500);
    assert.equal(bye2.reason, 'idle');
  } finally { await T.stop(); }
});

test('origin check: only the configured app origin may connect', async () => {
  const T = await startServer({ origins: ['https://app.example'] });
  try {
    await assert.rejects(connect(T.url, { headers: { Origin: 'https://evil.example' } }), /http 403|ECONNRESET|socket hang up/);
    await assert.rejects(connect(T.url), /http 403|ECONNRESET|socket hang up/);
    const good = await connect(T.url, { headers: { Origin: 'https://app.example' } });
    await good.hello();
    await good.close();
  } finally { await T.stop(); }
});

test('oversized frames are refused by the socket layer', async () => {
  const T = await startServer({ limits: { maxFrameBytes: 2048 } });
  try {
    const c = await connect(T.url);
    await c.hello();
    c.ws.send(JSON.stringify({ i: 99, op: 'set', p: 'directory/alice', d: { handle: 'alice', ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' }, bio: 'z'.repeat(4000) } }));
    const { code } = await c.closed;
    assert.equal(code, 1009);
  } finally { await T.stop(); }
});

test('shutdown says goodbye to open connections', async () => {
  const T = await startServer();
  const c = await connect(T.url);
  await c.hello();
  const byeP = c.waitPush((f) => f.t === 'bye');
  await T.stop();
  assert.equal((await byeP).reason, 'shutdown');
  await c.closed;
});
