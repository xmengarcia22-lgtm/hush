// A client that does not read (release 110). The server held every reply and every push for it, with no limit: one socket sending
// junk frames over its allowance made it hold about 1 MB more a second, and one address has 40 sockets. Now, what a client asks for
// is held back by the client itself: while more than sendBufferBytes is unsent, its frames wait unread, so its own requests can make
// the server hold at most that and one frame's answer, and a slow reader is only slowed, never closed. What it did not ask for (a
// watch's pushes) can still grow, so past sendBufferMaxBytes the connection is closed. A connection that waits and never drains ends
// at idleMs as before; one that drains is not idle. Raw TCP clients that never read, slow readers, and readers. Release 112's tests
// are here too: what an answer counts and pays, the fields a query may name, the public listing, the caps on closed and last, and
// the limits one address has over all its connections.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import WebSocket from 'ws';
import { randomBytes, createHash } from 'node:crypto';
import { StatementSync } from 'node:sqlite';

import { startServer, connect, connectAs, signup, makeIdentity, createChat, sleep, label, wrap, groupDoc, channelDoc, signText, sessionMsg, appSource } from './helpers.js';
import { DEFAULT_LIMITS } from '../src/limits.js';

const MB = 1 << 20, CLOSED = 3;
const LIMIT = { timeout: 180_000 };   // a test that hangs fails, and the file still ends
const sha = (s) => createHash('sha256').update(s).digest('hex');
const b64 = (n) => randomBytes(Math.ceil(n * 3 / 4)).toString('base64').slice(0, n);
const post = (dLen, k) => ({ sl: 1, ts: Date.now() - 1000 * k, e: 0, n: b64(16), d: b64(dLen), oh: sha('o' + k), on: k });
const cid = (c = 'c') => c + randomBytes(12).toString('hex').slice(0, 12);
const realWrap = () => ({ ...wrap(), epk: { x: b64(43), y: b64(43) }, iv: b64(16), ct: b64(64) });
const wraps = (n) => { const keys = {}; for (let m = 0; m < n; m++) keys[label()] = realWrap(); return keys; };
const record = (members) => groupDoc({ keys: { 0: wraps(members) }, akeys: { [label()]: realWrap() } });
const hidden = () => groupDoc({ meta: { e: 0, iv: 'aXY=', ct: b64(262_000) }, ometa: { e: 0, iv: 'aXY=', ct: b64(262_000) } });   // half a MB that a preview leaves out
const pub = (over = {}) => ({ type: 'channel', visibility: 'public', epoch: 0, openKeys: { 0: b64(44) }, name: 'a channel', desc: '', photo: null, owner: 'alice', admins: [], ts: Date.now(), last: null, ...over });
// A client frame, masked with a zero key.
const frame = (s) => { const p = Buffer.from(s), n = p.length; return Buffer.concat([n < 126 ? Buffer.from([0x81, 0x80 | n]) : Buffer.from([0x81, 0x80 | 126, n >> 8, n & 255]), Buffer.alloc(4), p]); };
// Writes n documents through as many reading clients as the frame allowance needs (150 each), so the real limits stay on.
async function fill(T, n, op) {
  for (let k = 0; k < n;) { const w = await connect(T.url); await w.hello(); for (const end = Math.min(n, k + 150); k < end; k++) await w.ok(...op(k)); await w.close(); }
}
// The server's side of a connection: the most it held unsent just after any send, and why it was closed.
function watchConn(conn) {
  const o = { conn, peak: 0, reason: null, last: null };
  const send = conn.send, close = conn.close;
  conn.send = function (obj) { const r = send.call(this, obj); o.peak = Math.max(o.peak, this.ws.bufferedAmount); o.last = obj; return r; };
  conn.close = function (reason, ...a) { if (o.reason === null) o.reason = reason; return close.call(this, reason, ...a); };
  return o;
}

// Opens a raw socket, says hello (and sends `first`), then never reads again.
async function deaf(T, first = [], addr = '') {   // `addr`: the address it counts as (the test server trusts the forwarded header)
  const port = Number(new URL(T.url).port), was = new Set(T.srv.conns);
  const s = net.connect(port, '127.0.0.1');
  s.on('error', () => {});
  await new Promise((r) => s.once('connect', r));
  s.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n${addr ? `X-Forwarded-For: ${addr}\r\n` : ''}\r\n`);
  await new Promise((r) => { let b = ''; const on = (d) => { b += d.toString('latin1'); if (b.includes('\r\n\r\n')) { s.off('data', on); r(); } }; s.on('data', on); });
  const d = Object.assign(watchConn([...T.srv.conns].find((c) => !was.has(c))), { s, stop: false });
  s.write(frame('{"i":1,"op":"hello","v":1}'));
  for (const f of first) s.write(frame(f));
  for (let t = 0; t < 100 && !d.conn.helloed; t++) await sleep(10);
  s.pause();   // never read again
  // Frames as fast as the client's own socket takes them (waiting on its drain, so the test's side does not pile up).
  d.flood = (text, n = 2000) => { const batch = Buffer.concat(Array.from({ length: n }, () => frame(text))); const go = () => { while (!d.stop) if (!s.write(batch)) return s.once('drain', go); }; go(); };
  d.end = () => { d.stop = true; s.destroy(); };
  return d;
}
// A reader that reads slowly: its socket takes `step` bytes, then reads nothing for `ms` (a slow link). Returns the server's side.
async function slowReader(T, step = 256 * 1024, ms = 200) {
  const was = new Set(T.srv.conns), r = await connect(T.url);
  const o = watchConn([...T.srv.conns].find((c) => !was.has(c)));
  await r.hello();
  const s = r.ws._socket; let got = 0, stop = false;
  s.on('data', (b) => { got += b.length; if (got >= step && !stop) { got = 0; s.pause(); setTimeout(() => { if (!stop) s.resume(); }, ms).unref(); } });
  const ping = setInterval(() => r.call('ping'), 400);   // the page's keep-alive, more often
  ping.unref();
  o.r = r; o.end = () => { stop = true; clearInterval(ping); r.ws.terminate(); };
  return o;
}
// While `openMs`: never more than `most` held, and still open (its own frames only wait). Then it ends by `reason` within `endMs`.
async function heldThenEnds(T, d, most, reason, { openMs = 1500, endMs = 15000 } = {}) {
  const t0 = Date.now();
  let waiting = 0;   // frames read off the socket and waiting: the socket is read up to a mark while it is held (release 112)
  const look = () => { waiting = Math.max(waiting, (d.conn.later || []).length); return d.peak <= most && waiting <= 5000; };
  while (Date.now() - t0 < openMs && look()) await sleep(25);
  assert.ok(d.peak <= most, `held ${d.peak} bytes, more than ${most}`);
  if (openMs) assert.ok(T.srv.conns.has(d.conn), 'still open after ' + openMs + ' ms');
  while (T.srv.conns.has(d.conn) && look() && Date.now() - t0 < endMs) await sleep(25);
  assert.ok(d.peak <= most, `held ${d.peak} bytes, more than ${most}`);
  assert.ok(waiting <= 5000, waiting + ' frames waiting');
  assert.equal(d.reason, reason);
  for (let t = 0; t < 100 && d.conn.ws.readyState !== CLOSED; t++) await sleep(20);
  assert.equal(d.conn.ws.readyState, CLOSED, 'and its socket gone, with what it held');
}
// A connection from an address of its own (the test server trusts the forwarded header), holding a sign-up proof for `id` when one is given.
async function from(T, addr, id) {
  const c = await connect(T.url, { headers: { 'x-forwarded-for': addr } }), h = await c.hello();
  if (id) await c.ok('prove', { h: id.handle, pub: id.sig, sig: await signText(id.sigKey, sessionMsg(h.nonce, id.handle)) });
  return c;
}
const withServer = async (limits, fn) => {
  const T = await startServer({ limits }), ends = [];
  try { await fn(T, (d) => (ends.push(d), d)); } finally { for (const d of ends) d.end(); await T.stop(); }
};
// The documents (rows with a `d`) the server takes from its databases while `fn` runs, whichever way it reads them, and how many of
// those it parses.
async function rowsRead(fn) {
  const P = StatementSync.prototype, was = { get: P.get, all: P.all, iterate: P.iterate }, parse = JSON.parse, ds = new Set();
  let n = 0, parsed = 0;
  const seen = (r) => { if (r && r.d !== undefined) { n++; ds.add(r.d); } return r; };
  P.get = function (...a) { return seen(was.get.apply(this, a)); };
  P.all = function (...a) { const rs = was.all.apply(this, a); rs.forEach(seen); return rs; };
  P.iterate = function* (...a) { for (const r of was.iterate.apply(this, a)) yield seen(r); };
  JSON.parse = (s, ...a) => { if (ds.has(s)) parsed++; return parse(s, ...a); };
  try { const r = await fn(); return [n, r, parsed]; } finally { Object.assign(P, was); JSON.parse = parse; }
}

test('the allowances: a client\'s frames wait past 1 MB unsent; past 32 MB the connection is closed; one answer is at most 24 MB, so a page reading its own has room for pushes; limits like the others', LIMIT, () => {
  assert.deepEqual([DEFAULT_LIMITS.sendBufferBytes, DEFAULT_LIMITS.sendBufferMaxBytes, DEFAULT_LIMITS.answerBytes], [MB, 32 * MB, 24 * MB]);
});

test('one mget naming one box of 1 MB 30 times, before signing in, under the real limits and rules, is refused toolarge (one answer is at most 24 MB), as is one naming a group record of 1.3 MB 20 times; 20 copies of the box are answered', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const w = await connect(T.url); await w.hello();
    const p = 'vault/v' + 'A'.repeat(32);
    await w.ok('set', { p, d: { iv: 'AAAAAAAAAAAAAAAA', ct: 'A'.repeat(1_040_000) } });
    const big = await w.call('mget', { ps: Array(30).fill(p) });
    assert.deepEqual([big.ok, big.e], [false, 'toolarge']);
    assert.equal((await w.ok('mget', { ps: Array(20).fill(p) })).docs.length, 20);
    await w.close();
  } finally { await T.stop(); }
  await withServer({}, async (T2) => {
    const g = cid('g');
    await fill(T2, 1, () => ['set', { p: 'channels/' + g, d: record(3500) }]);   // a frame is at most 1 MB: the record grows by an update
    await fill(T2, 1, () => ['update', { p: 'channels/' + g, d: { keys: { 0: wraps(2300) } } }]);
    const w = await connect(T2.url); await w.hello();
    const rec = await w.call('mget', { ps: Array(20).fill('channels/' + g) });
    assert.deepEqual([rec.ok, rec.e], [false, 'toolarge']);
    await w.close();
  });
});

test('a query, a watch\'s first load and a watch of several ids past the cap (here 2 MB, set like the other limits) are refused toolarge and no watch is made; below it they are answered', LIMIT, async () => {
  await withServer({ answerBytes: 2 * MB, postsPerMin: 1e6 }, async (T) => {
    const c = cid(), base = `channels/${c}/`, ids = Array.from({ length: 3 }, () => cid('g'));
    await fill(T, 40, (k) => ['add', { p: base + 'posts', d: post(60_000, k) }]);
    await fill(T, 3, (k) => ['set', { p: 'channels/' + ids[k], d: record(3500) }]);
    const r = await connect(T.url); await r.hello();
    assert.equal((await r.call('query', { p: base + 'posts', l: 1000 })).e, 'toolarge');
    assert.equal((await r.ok('query', { p: base + 'posts', l: 30 })).docs.length, 30);
    assert.equal((await r.call('sub', { s: 1, p: base + 'posts', l: 1000 })).e, 'toolarge');
    assert.equal((await r.call('sub', { s: 2, p: 'channels', ids })).e, 'toolarge');
    assert.ok(await r.noPush((f) => f.s === 1 || f.s === 2, 300), 'no first load');
    await r.ok('sub', { s: 3, p: 'channels', ids: ids.slice(0, 2) });
    assert.equal((await r.waitPush((f) => f.s === 3 && f.t === 'init', 10000)).docs.length, 2);
    await fill(T, 1, (k) => ['add', { p: base + 'posts', d: post(100, k) }]);
    assert.ok(await r.noPush((f) => f.s === 1, 300), 'and no push to a watch that was refused');
    await r.close();
  });
});

test('a page that reads on a slow link (the server\'s side corked, as Linux keeps what the kernel has not taken): its acts watch of a chat a member filled (600 acts of 63 KB, 38 MB) is refused toolarge, so a typing mark meanwhile does not close it; the newest 300 posts at the 64 KB cap (19.65 MB) come whole with a typing mark behind them; never closed', LIMIT, async () => {
  await withServer({ postsPerMin: 1e6, sideWritesPerMin: 1e6 }, async (T) => {
    const c = cid(), base = `channels/${c}/`, pid = b64(12).replace(/[^A-Za-z0-9]/g, 'a'), tag = label().replace(/[^A-Za-z0-9]/g, 'a');
    await fill(T, 300, (k) => ['add', { p: base + 'posts', d: post(65_380, k) }]);   // each just under the 64 KB cap
    await fill(T, 600, (k) => ['set', { p: `${base}acts/${pid}~${tag}~k${k}`, d: { post: pid, kind: 'k' + k, iv: 'AAAAAAAAAAAAAAAA', ct: 'A'.repeat(63_000), ts: Date.now() } }]);
    const was = new Set(T.srv.conns), r = await connect(T.url);
    const o = watchConn([...T.srv.conns].find((x) => !was.has(x))), sock = o.conn.ws._socket;
    await r.hello();
    await r.ok('sub', { s: 4, p: base + 'typing', l: 200 });
    await r.waitPush((f) => f.s === 4 && f.t === 'init', 10000);
    const w = await connect(T.url); await w.hello();
    const typed = async (n) => {   // with the page's answer still unsent: a mark from another connection, then the link catches up
      for (let t = 0; t < 400 && !(o.last && (o.last.s === n || (o.last.i !== undefined && o.last.i === r.i))); t++) await sleep(25);
      await w.ok('set', { p: base + 'typing/0~' + label().replace(/[^A-Za-z0-9]/g, 'a'), d: { ts: Date.now(), iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAA' } });
      await sleep(300);
      sock.uncork();
      return r.waitPush((f) => f.s === 4 && f.t === 'set', 30000);
    };
    sock.cork();
    const acts = r.call('sub', { s: 2, p: base + 'acts', l: 1000 });
    await typed(2);
    assert.equal((await acts).e, 'toolarge');
    assert.equal(o.reason, null, 'not closed');
    sock.cork();
    r.ws.send(JSON.stringify({ i: ++r.i, op: 'sub', s: 1, p: base + 'posts', o: ['ts', 'desc'], l: 300 }));
    await typed(1);
    const init = await r.waitPush((f) => f.s === 1 && f.t === 'init', 30000);
    assert.equal(init.docs.length, 300);
    assert.ok(JSON.stringify(init).length > 19.6e6, 'the 300 posts are ' + JSON.stringify(init).length + ' bytes');
    assert.equal(o.reason, null, 'never closed');
    assert.equal((await r.ok('ping')).ok, true);
    await w.close(); await r.close();
  });
});

test('frames that waited while a connection held are counted against the frame allowance when they are handled: a query with a 1.2 MB answer and 1500 frames behind it in one write (the server\'s side corked, so the answer counts unsent), then the client reads; no more frames are answered than the allowance and its refill', LIMIT, async () => {
  await withServer({}, async (T, kept) => {
    const c = cid();
    await fill(T, 20, (k) => ['add', { p: `channels/${c}/posts`, d: post(60_000, k) }]);
    const d = kept(await deaf(T)), t0 = Date.now();
    d.conn.ws._socket.cork();
    // each frame behind the query is answered conflict ("already said hello") within the allowance, ratelimit over it
    d.s.write(Buffer.concat([frame(JSON.stringify({ i: 2, op: 'query', p: `channels/${c}/posts`, l: 20 })), ...Array(1500).fill(frame('{"i":3,"op":"hello","v":1}'))]));
    for (let t = 0; t < 400 && !(d.conn.held && d.conn.later.length > 1000); t++) await sleep(25);
    const waited = d.conn.later.length;
    assert.ok(d.conn.held && waited > 1000, waited + ' frames waiting');
    d.conn.ws._socket.uncork();
    let got = '';
    d.s.on('data', (b) => { got += b.toString('latin1'); });
    d.s.resume();
    while ((d.conn.held || d.conn.later.length) && Date.now() - t0 < 120_000) await sleep(25);
    await sleep(1000);
    const answered = (got.match(/"e":"conflict"/g) || []).length, most = 300 + 5 * (Date.now() - t0) / 1000;
    assert.ok(answered <= most, `${answered} frames answered, the allowance and its refill are ${Math.floor(most)}; ${waited} had waited`);
    assert.ok(answered > 200, answered + ' answered');
  });
});

test('a refused answer is counted as it is read: past the cap (here 2 MB) the server takes at most the cap and one document from its database, whatever the read (an mget of different posts, a query, a watch by query, a watch by ids); a query of one media id\'s pieces past the cap is refused, whatever its l', LIMIT, async () => {
  await withServer({ answerBytes: 2 * MB, postsPerMin: 1e6 }, async (T) => {
    const c = cid(), base = `channels/${c}/`, media = base + 'media/m' + 'A'.repeat(12) + '/chunks', ids = Array.from({ length: 12 }, () => cid('g'));
    const w = await connect(T.url); await w.hello();
    const ps = [];
    for (let k = 0; k < 60; k++) ps.push(base + 'posts/' + (await w.ok('add', { p: base + 'posts', d: post(60_000, k) })).id);
    for (const id of ids) await w.ok('set', { p: 'channels/' + id, d: record(1000) });
    for (let k = 0; k < 20; k++) await w.ok('set', { p: `${media}/${k}`, d: { i: k, iv: 'AAAAAAAAAAAAAAAA', d: b64(190_000) } });
    const most = (p) => Math.floor(2 * MB / JSON.stringify(T.srv.store.get(p).d).length) + 1, bad = [];
    for (const [what, f, p] of [['an mget of 60 posts', { op: 'mget', ps }, ps[0]], ['a query', { op: 'query', p: base + 'posts', l: 1000 }, ps[0]],
      ['a watch by query', { op: 'sub', s: 1, p: base + 'posts', l: 1000 }, ps[0]], ['a watch of 12 records', { op: 'sub', s: 2, p: 'channels', ids }, 'channels/' + ids[0]],
      ['a query of one piece of 20', { op: 'query', p: media, l: 1 }, media + '/0']]) {
      const [n, r] = await rowsRead(() => w.call(f.op, f));
      if (r.e !== 'toolarge' || n > most(p)) bad.push(`${what}: ${r.e || 'answered'}, ${n} documents read, the cap and one are ${most(p)}`);
    }
    assert.deepEqual(bad, []);
    await w.close();
  });
});

test('an mget naming one path many times reads it once and answers it at every place it was named (300 times; and a, b, a)', LIMIT, async () => {
  await withServer({}, async (T) => {
    const c = cid(), w = await connect(T.url); await w.hello();
    const [a, b] = [0, 1].map(async (k) => `channels/${c}/posts/` + (await w.ok('add', { p: `channels/${c}/posts`, d: post(1000, k) })).id);
    const pa = await a, pb = await b;
    const [n, r] = await rowsRead(() => w.ok('mget', { ps: Array(300).fill(pa) }));
    assert.equal(n, 1, 'read once');
    assert.equal(r.docs.length, 300);
    assert.ok(r.docs.every((x) => JSON.stringify(x) === JSON.stringify(r.docs[0]) && x.d.on === 0));
    const r2 = await w.ok('mget', { ps: [pa, pb, pa] });
    assert.deepEqual(r2.docs.map((x) => x.d.on), [0, 1, 0]);
    assert.deepEqual(r2.docs[2], r2.docs[0]);
    await w.close();
  });
});

test('a refused answer is paid for: refusals one after another (here a 2 MB cap and 5 MB a minute) are soon refused ratelimit, so they cannot keep the server busy', LIMIT, async () => {
  await withServer({ answerBytes: 2 * MB, bytesPerMin: 5 * MB, postsPerMin: 1e6 }, async (T) => {
    const c = cid();
    await fill(T, 40, (k) => ['add', { p: `channels/${c}/posts`, d: post(60_000, k) }]);
    const r = await connect(T.url); await r.hello();
    const es = [];
    for (let k = 0; k < 10; k++) es.push((await r.call('query', { p: `channels/${c}/posts`, l: 1000 })).e);
    const large = es.filter((e) => e === 'toolarge').length;
    assert.ok(large >= 2 && large <= 4, es.join(' '));
    assert.deepEqual(es.slice(large), Array(10 - large).fill('ratelimit'), es.join(' '));
    await r.close();
  });
});

test('the public channel listing reads nothing but the records it answers, each by its path, up to the l the client names: SQLite visits no other chat record and sorts none (private ones at lower ids were all read first); it answers the public ones by id; an order or any other condition on it is refused', LIMIT, async () => {
  await withServer({}, async (T) => {
    const w = await connect(T.url); await w.hello();
    const priv = ['c00000000000a', 'c00000000000b'], pubs = ['c10000000000a', 'c10000000000b', 'c10000000000c'];
    for (const id of priv) await w.ok('set', { p: 'channels/' + id, d: channelDoc() });
    for (const id of pubs) await w.ok('set', { p: 'channels/' + id, d: pub() });
    await w.ok('set', { p: 'channels/' + cid('g'), d: groupDoc() });
    const P = StatementSync.prototype, was = { all: P.all, get: P.get, iterate: P.iterate }, sql = new Set();
    for (const m of Object.keys(was)) P[m] = function (...a) { sql.add(this.sourceSQL); return was[m].apply(this, a); };
    let r;
    try { r = await w.ok('query', { p: 'channels', w: [['visibility', '==', 'public']], l: 100 }); } finally { Object.assign(P, was); }
    assert.deepEqual(r.docs.map((x) => x.id), pubs);
    const two = (await w.ok('query', { p: 'channels', w: [['visibility', '==', 'public']], l: 2 })).docs.map((x) => x.id);
    assert.ok(two.length === 2 && two[0] < two[1] && two.every((id) => pubs.includes(id)), 'two of them for an l of 2: ' + two);
    const plans = [...sql].map((q) => T.srv.store.db.prepare('EXPLAIN QUERY PLAN ' + q).all().map((x) => x.detail).join('; ')).sort();
    assert.deepEqual(plans, ['SEARCH docs USING PRIMARY KEY (path=?)']);
    for (const [q, e] of [[{ o: ['ts', 'asc'] }, 'denied'], [{ w: [['visibility', '==', 'public'], ['visibility', '==', 'public']] }, 'denied'], [{ w: [['visibility', '==', 'private']] }, 'denied'],
      [{ o: ['name', 'asc'] }, 'invalid'], [{ o: ['id', 'desc'] }, 'invalid'], [{ w: [['visibility', '==', 'public'], ['name', '==', 'x']] }, 'invalid']]) {   // invalid: a field no query may name (query.js)
      assert.equal((await w.call('query', { p: 'channels', w: [['visibility', '==', 'public']], l: 100, ...q })).e, e, JSON.stringify(q));
    }
    await w.close();
  });
});

test('a connection that has not signed in, or that holds no key to a chat, is refused before the server reads the chat record (here a group record of half a MB): set, update and delete read no document; the owner\'s update goes on', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const owner = await signup(T.url, await makeIdentity('ownerfive')), g = cid('g');
    await createChat(owner, g, hidden());
    const anon = await connect(T.url); await anon.hello();
    const stranger = await connectAs(T.url, await makeIdentity('strangerfive'), { pub: true });   // a sign-up proof: free, no account
    const bad = [];
    for (const [who, c, e] of [['not signed in', anon, 'unauth'], ['no key', stranger, 'denied']]) {
      for (const [op, f] of [['update', { d: { last: null } }], ['set', { d: groupDoc() }], ['delete', {}]]) {
        const [n, r] = await rowsRead(() => c.call(op, { p: 'channels/' + g, ...f }));
        if (r.e !== e || n !== 0) bad.push(`${who}, ${op}: ${r.e || 'answered'}, ${n} documents read`);
      }
    }
    assert.deepEqual(bad, []);
    await owner.ok('update', { p: 'channels/' + g, d: { ts: Date.now() } });
    await anon.close(); await stranger.close(); await owner.close();
  } finally { await T.stop(); }
});

test('a delete of a chat that is already gone answers ok, as before release 110: its owner sending it again (a reply lost), a stranger (a sign-up proof) and a connection not signed in', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const owner = await signup(T.url, await makeIdentity('ownersix')), g = cid('g'), none = cid('g');
    await createChat(owner, g, groupDoc());
    await owner.ok('delete', { p: 'channels/' + g });
    const stranger = await connectAs(T.url, await makeIdentity('strangersix'), { pub: true });
    const anon = await connect(T.url); await anon.hello();
    const got = [];
    for (const [c, id] of [[owner, g], [stranger, g], [stranger, none], [anon, none]]) { const r = await c.call('delete', { p: 'channels/' + id }); got.push(r.ok ? 'ok' : r.e); }
    assert.deepEqual(got, ['ok', 'ok', 'ok', 'ok']);
    await anon.close(); await stranger.close(); await owner.close();
  } finally { await T.stop(); }
});

test('an update of a chat that is already gone answers notfound, as before release 110 (the page reads it when it removes a device): its owner, a stranger (a sign-up proof) and a connection not signed in, for a chat deleted and for one that never was', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const owner = await signup(T.url, await makeIdentity('ownertwelve')), g = cid('g'), none = cid('g');
    await createChat(owner, g, groupDoc());
    await owner.ok('delete', { p: 'channels/' + g });
    const stranger = await connectAs(T.url, await makeIdentity('strangertwelve'), { pub: true });
    const anon = await connect(T.url); await anon.hello();
    const got = [];
    for (const [c, id] of [[owner, g], [stranger, g], [stranger, none], [anon, g], [anon, none]]) got.push((await c.call('update', { p: 'channels/' + id, d: { ts: Date.now() } })).e);
    assert.deepEqual(got, Array(5).fill('notfound'));
    await anon.close(); await stranger.close(); await owner.close();
  } finally { await T.stop(); }
});

test('an update of a chat record that has no row in the chats table (one written by hand: the server makes none) is refused before the record is used, as in release 110: denied or unauth whatever the size of the patch, never toolarge by the size of what is stored', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const g = cid('g');
    T.srv.store.db.prepare('INSERT INTO docs(path, parent, id, d, ts) VALUES (?, ?, ?, ?, ?)').run('channels/' + g, 'channels', g, JSON.stringify(groupDoc({ meta: { e: 0, iv: 'aXY=', ct: b64(1_500_000) } })), 1);
    const stranger = await connectAs(T.url, await makeIdentity('strangerfourteen'), { pub: true });
    const anon = await connect(T.url); await anon.hello();
    const got = [];
    for (const c of [stranger, anon]) for (const n of [10, 700_000]) got.push((await c.call('update', { p: 'channels/' + g, d: { desc: b64(n) } })).e);
    assert.deepEqual(got, ['denied', 'denied', 'unauth', 'unauth'], 'a patch of 10 bytes and one that would take the record past 2 MB');
    const [n] = await rowsRead(async () => { for (const c of [stranger, anon]) await c.call('update', { p: 'channels/' + g, d: { desc: 'x' } }); });
    assert.equal(n, 0, 'and the record\'s text is not taken from the database for it: the server only looks whether it is there');
    await anon.close(); await stranger.close();
  } finally { await T.stop(); }
});

test('a row written by hand whose text is not a JSON object (null, a string, a number) is answered as it was before release 110, never internal: by get and by mget', LIMIT, async () => {
  await withServer({}, async (T) => {
    const put = T.srv.store.db.prepare('INSERT INTO docs(path, parent, id, d, ts) VALUES (?, ?, ?, ?, ?)'), rows = [['rawnull', 'null', null], ['rawtext', '"hello"', 'hello'], ['rawnum', '7', 7]];
    for (const [id, d] of rows) put.run('search/' + id, 'search', id, d, 1);
    const w = await connect(T.url); await w.hello();
    const got = [];
    for (const [id] of rows) { const r = await w.call('get', { p: 'search/' + id }); got.push(r.ok ? r.d : r.e); }
    assert.deepEqual(got, rows.map((r) => r[2]));
    const m = await w.call('mget', { ps: rows.map(([id]) => 'search/' + id) });
    assert.deepEqual(m.ok ? m.docs.map((x) => x.d) : m.e, rows.map((r) => r[2]));
    await w.close();
  });
});

test('an mget and a watch by ids count a document the reader is shown whole by its bytes, to the byte: a chat record for its owner, and one of three-byte characters (bytes, not characters); a cap of that size answers it, one byte less refuses it', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const owner = await signup(T.url, await makeIdentity('ownerseven')), g = cid('g'), euro = cid('g'), L = T.srv.store.limits, bad = [];
    await createChat(owner, g, hidden());
    await createChat(owner, euro, groupDoc({ meta: { e: 0, iv: 'aXY=', ct: '€'.repeat(100_000) } }));
    const bytes = async (id) => Buffer.byteLength(JSON.stringify((await owner.ok('get', { p: 'channels/' + id })).d));
    const whole = await bytes(g), eurob = await bytes(euro);
    assert.ok(whole > 500_000 && eurob > 300_000, `${whole} ${eurob}`);
    let s = 0;
    for (const [what, n, f] of [['mget', whole, () => ({ op: 'mget', ps: ['channels/' + g] })], ['watch', whole, () => ({ op: 'sub', s: ++s, p: 'channels', ids: [g] })],
      ['three-byte characters, mget', eurob, () => ({ op: 'mget', ps: ['channels/' + euro] })], ['three-byte characters, watch', eurob, () => ({ op: 'sub', s: ++s, p: 'channels', ids: [euro] })]]) {
      for (const [cap, e] of [[n, undefined], [n - 1, 'toolarge']]) {
        L.answerBytes = cap;
        const { op, ...x } = f(), r = await owner.call(op, x);
        if (r.e !== e) bad.push(`${what}, cap ${cap} for ${n} bytes: ${r.e || 'answered'}`);
      }
    }
    assert.deepEqual(bad, []);
    await owner.close();
  } finally { await T.stop(); }
});

test('what an mget or a watch by ids is refused for, and what it pays, never tells a reader what it is not shown: a chat record answered as a preview (a stranger with a sign-up proof) or as the copy of a channel a member gets counts as the largest a chat record can be (2 MB), whatever it holds, and a reaction in a channel from before release 97 as the largest a reaction can be (64 KB), there or not; a cap of that size answers each, one byte less refuses it; an answered mget pays that less what it answers', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const st = T.srv.store, L = st.limits, RECORD = 2 * MB, ACT = 64 * 1024, bad = [];
    const owner = await signup(T.url, await makeIdentity('ownerthirteen')), small = cid('g'), large = cid('g'), chs = cid(), chl = cid();
    await createChat(owner, small, groupDoc());
    await createChat(owner, large, hidden());
    const member = await signup(T.url, await makeIdentity('memberthirteen'));
    for (const [c, n] of [[chs, 100], [chl, 200_000]]) await member.ok('chat.open', { cid: c, cap: (await createChat(owner, c, channelDoc({ meta: { e: 0, iv: 'aXY=', ct: b64(n) } }))).caps.m });
    const stranger = await connectAs(T.url, await makeIdentity('strangerthirteen'), { pub: true });
    const col = `channels/${chl}/acts`, act = (ch) => `${'P'.repeat(12)}~${ch.repeat(22)}~r`, there = act('t'), gone = act('u');
    st.db.prepare('INSERT INTO docs(path, parent, id, d, ts) VALUES (?, ?, ?, ?, ?)').run(col + '/' + there, col, there, JSON.stringify({ e: 0, iv: 'aXY=', ct: b64(60_000) }), 1);
    const cases = [['a preview of a small record', stranger, RECORD, 'channels', small, ['mget']], ['a preview of one with half a MB more', stranger, RECORD, 'channels', large, ['mget']],
      ['the copy of a channel a member gets', member, RECORD, 'channels', chs, ['mget', 'sub']], ['the copy of one with a longer sealed list', member, RECORD, 'channels', chl, ['mget', 'sub']],
      ['an old reaction that is there', owner, ACT, col, there, ['mget', 'sub']], ['one that is not', owner, ACT, col, gone, ['mget', 'sub']]];
    let s = 0;
    for (const [what, c, n, p, id, ops] of cases) for (const op of ops) for (const [cap, e] of [[n, undefined], [n - 1, 'toolarge']]) {
      L.answerBytes = cap;
      const r = await c.call(op, op === 'mget' ? { ps: [p + '/' + id] } : { s: ++s, p, ids: [id] });
      if (r.e !== e) bad.push(`${what}, ${op}, cap ${cap}: ${r.e || 'answered'}`);
    }
    assert.deepEqual(bad, []);
    L.answerBytes = DEFAULT_LIMITS.answerBytes;
    const paid = [];
    for (const [what, c, , p, id] of cases) {
      const b = st.unanswered, d = (await c.ok('mget', { ps: [p + '/' + id] })).docs[0].d;
      paid.push([what, st.unanswered - b + Buffer.byteLength(JSON.stringify(d))]);   // none is answered as null, 4 bytes
    }
    assert.deepEqual(paid, cases.map(([what, , n]) => [what, n]), 'what an answered mget pays and what it answers add up to that size, whatever the record holds');
    await stranger.close(); await member.close(); await owner.close();
  } finally { await T.stop(); }
});

test('an mget of chat records that a stranger (a sign-up proof) is shown only previews of counts each as the largest a chat record can be (2 MB): naming 8 of half a MB is refused toolarge past the cap (here 2 MB) with at most two read; one at a time is answered and pays for what it is not shown, so the next are soon refused ratelimit (here 5 MB a minute); the owner, answered whole, pays nothing', LIMIT, async () => {
  const T = await startServer({ authz: 'standard', limits: { answerBytes: 2 * MB, bytesPerMin: 5 * MB } });
  try {
    const owner = await signup(T.url, await makeIdentity('ownernine')), ids = Array.from({ length: 8 }, () => cid('g')), ps = ids.map((g) => 'channels/' + g);
    for (const g of ids) await createChat(owner, g, hidden());
    const own = [];
    for (let k = 0; k < 6; k++) own.push((await owner.call('mget', { ps: ps.slice(0, 3) })).ok);
    assert.deepEqual(own, Array(6).fill(true), 'the owner reads three of its records whole, six times');
    const stranger = await from(T, '203.0.113.21', await makeIdentity('strangernine'));
    const [n, r] = await rowsRead(() => stranger.call('mget', { ps }));
    assert.deepEqual([r.ok, r.e], [false, 'toolarge'], 'eight previews count 16 MB');
    assert.ok(n <= 2, `${n} records read: the second is past the cap`);
    const other = await from(T, '203.0.113.22', await makeIdentity('strangerten')), es = [];
    for (let k = 0; k < 8; k++) { const x = await other.call('mget', { ps: [ps[k]] }); es.push(x.ok ? 'ok' : x.e); }
    const ok = es.filter((e) => e === 'ok').length;
    assert.ok(ok >= 1 && ok <= 4, es.join(' '));
    assert.deepEqual(es.slice(ok), Array(8 - ok).fill('ratelimit'), es.join(' '));
    await other.close(); await stranger.close(); await owner.close();
  } finally { await T.stop(); }
});

test('a refused request pays what it counted, whatever refused it: a watch asked again under an s in use (conflict) and an mget ending in a bad path (invalid), of posts or of media pieces named by path, each after 1.2 MB or more under the cap (here 2 MB), are soon refused ratelimit (here 5 MB a minute)', LIMIT, async () => {
  await withServer({ answerBytes: 2 * MB, bytesPerMin: 5 * MB, postsPerMin: 1e6 }, async (T) => {
    const chat = `channels/${cid()}`, base = chat + '/posts', media = `${chat}/media/m${'A'.repeat(12)}/chunks`, ps = [], pieces = [];
    const w = await from(T, '203.0.113.31');
    for (let k = 0; k < 20; k++) ps.push(base + '/' + (await w.ok('add', { p: base, d: post(60_000, k) })).id);
    for (let k = 0; k < 9; k++) { await w.ok('set', { p: `${media}/${k}`, d: { i: k, iv: 'AAAAAAAAAAAAAAAA', d: b64(190_000) } }); pieces.push(`${media}/${k}`); }
    await w.close();
    const bad = [];
    for (const [what, addr, first, f, e] of [['a watch under an s in use', '203.0.113.32', { op: 'sub', s: 1, p: base, l: 1000 }, { op: 'sub', s: 1, p: base, l: 1000 }, 'conflict'],
      ['an mget ending in a bad path', '203.0.113.33', null, { op: 'mget', ps: [...ps, 'nowhere/x'] }, 'invalid'],
      ['an mget of media pieces ending in a bad path', '203.0.113.34', null, { op: 'mget', ps: [...pieces, 'nowhere/x'] }, 'invalid'],
      ['a watch of media pieces by ids under an s in use', '203.0.113.35', { op: 'sub', s: 1, p: base, l: 1 }, { op: 'sub', s: 1, p: media, ids: pieces.map((p) => p.split('/').pop()) }, 'conflict']]) {
      const r = await from(T, addr), es = [];
      if (first) await r.ok(first.op, first);
      for (let k = 0; k < 10; k++) es.push((await r.call(f.op, f)).e);
      const n = es.filter((x) => x === e).length;
      if (!(n >= 2 && n <= 6) || es.slice(n).some((x) => x !== 'ratelimit')) bad.push(`${what}: ${es.join(' ')}`);
      await r.close();
    }
    assert.deepEqual(bad, []);
  });
});

test('a reaction in a channel from before release 97 (a row with no an) counts as the largest a reaction can be (64 KB), whether it is there or not: 40 of them named by a watch by ids or an mget, each answered as none, are refused toolarge past the cap (here 2 MB) with at most 33 rows read, and 40 names with no row are refused the same with none read; five are answered as none', LIMIT, async () => {
  const T = await startServer({ authz: 'standard', limits: { answerBytes: 2 * MB } });
  try {
    const owner = await signup(T.url, await makeIdentity('ownereleven')), c = cid(), col = `channels/${c}/acts`;
    await createChat(owner, c, channelDoc());
    const put = T.srv.store.db.prepare('INSERT INTO docs(path, parent, id, d, ts) VALUES (?, ?, ?, ?, ?)');
    const ids = Array.from({ length: 40 }, (_, k) => `${'P'.repeat(12)}~${String(k).padStart(22, 't')}~r`), none = ids.map((id) => id.replace(/t/g, 'u'));
    for (const id of ids) put.run(col + '/' + id, col, id, JSON.stringify({ e: 0, iv: 'aXY=', ct: b64(60_000) }), 1);
    const bad = [];
    let s = 0;
    for (const [rows, most] of [[ids, 33], [none, 0]]) for (const [what, f] of [['a watch by ids', () => ({ op: 'sub', s: ++s, p: col, ids: rows })], ['an mget', () => ({ op: 'mget', ps: rows.map((id) => col + '/' + id) })]]) {
      const { op, ...x } = f(), [n, r] = await rowsRead(() => owner.call(op, x));
      if (r.e !== 'toolarge' || n > most) bad.push(`${what}, ${most ? 'rows there' : 'no rows'}: ${r.e || 'answered'}, ${n} rows read, at most ${most}`);
    }
    assert.deepEqual(bad, []);
    const few = await owner.ok('mget', { ps: ids.slice(0, 5).map((id) => col + '/' + id) });
    assert.deepEqual(few.docs.map((d) => d.d), Array(5).fill(null), 'under the cap they are answered as none, as before');
    await owner.close();
  } finally { await T.stop(); }
});

test('a condition or an order may name only the fields the page asks by (ts anywhere; e on member cards; h, n and n2 on search; visibility on the channel listing): any other is refused invalid before anything is read, in a query and in a watch; the page\'s own are answered', LIMIT, async () => {
  await withServer({ postsPerMin: 1e6 }, async (T) => {
    const c = cid(), base = `channels/${c}/`, w = await connect(T.url); await w.hello();
    for (let k = 0; k < 3; k++) await w.ok('add', { p: base + 'posts', d: post(100, k) });
    const bad = [];
    let s = 0;
    for (const [p, q] of [[base + 'posts', { w: [['on', '==', 1]] }], [base + 'posts', { w: [['d', '>=', 'a']] }], [base + 'posts', { o: ['on', 'asc'] }], [base + 'posts', { w: [['e', '>=', 0]] }], [base + 'posts', { w: [['h', '>=', 'a']] }],
      [base + 'comments', { w: [['post', '==', 'x']] }], [base + 'acts', { o: ['e', 'desc'] }], [base + 'roll', { w: [['iid', '==', 'x']] }], [base + 'call', { w: [['from', '==', 'x']] }], ['search', { w: [['ts', '>', 0]] }], ['search', { o: ['h', 'asc'] }]]) {
      for (const op of ['query', 'sub']) {
        const [n, r] = await rowsRead(() => w.call(op, { p, l: 10, ...q, ...(op === 'sub' ? { s: ++s } : {}) }));
        if (r.e !== 'invalid' || n !== 0) bad.push(`${op} ${p.replace(base, '')} ${JSON.stringify(q)}: ${r.e || 'answered'}, ${n} read`);
      }
    }
    const t = Date.now();
    for (const [p, q] of [[base + 'posts', { w: [['ts', '<', t]], o: ['ts', 'desc'], l: 200 }], [base + 'posts', { w: [['ts', '>', 0]], l: 100 }], [base + 'posts', { o: ['ts', 'desc'], l: 300 }], [base + 'posts', { o: ['ts', 'asc'], l: 20 }],
      [base + 'roll', { w: [['e', '>=', 0]], o: ['ts', 'asc'], l: 1000 }], [base + 'roll', { w: [['e', '>=', 0], ['ts', '>=', 0]], o: ['ts', 'asc'], l: 1000 }], [base + 'call', { o: ['ts', 'desc'], l: 50 }],
      ...['h', 'n', 'n2'].map((f) => ['search', { w: [[f, '>=', 'a'], [f, '<=', 'a']], l: 10 }]), ['channels', { w: [['visibility', '==', 'public']], l: 100 }]]) {
      const r = await w.call('query', { p, ...q });
      if (!r.ok) bad.push(`the page's own ${p.replace(base, '')} ${JSON.stringify(q)}: ${r.e}`);
    }
    assert.deepEqual(bad, []);
    assert.equal((await w.ok('query', { p: base + 'posts', w: [['ts', '>', 0]], l: 100 })).docs.length, 3);
    await w.close();
  });
});

test('the refusal allowance refills: once the refusals are paid back (here a 2 MB cap and 30 MB a minute, half a MB a second), the connection\'s watch, query and mget are answered again', LIMIT, async () => {
  await withServer({ answerBytes: 2 * MB, bytesPerMin: 30 * MB, postsPerMin: 1e6 }, async (T) => {
    const base = `channels/${cid()}/posts`;
    await fill(T, 40, (k) => ['add', { p: base, d: post(60_000, k) }]);
    const r = await connect(T.url); await r.hello();
    const es = [];
    while (es.length < 40 && es[es.length - 1] !== 'ratelimit') es.push((await r.call('query', { p: base, l: 1000 })).e);
    assert.equal(es[es.length - 1], 'ratelimit', es.join(' '));
    const t0 = Date.now();
    let w;
    while (!(w = await r.call('sub', { s: 1, p: base, l: 1 })).ok && w.e === 'ratelimit' && Date.now() - t0 < 20_000) await sleep(250);
    assert.ok(w.ok, `the watch after ${Date.now() - t0} ms: ${w.e}`);
    const id = (await r.ok('query', { p: base, l: 1 })).docs[0].id;
    assert.equal((await r.ok('mget', { ps: [base + '/' + id] })).docs[0].id, id);
    await r.close();
  });
});

test('an honest page whose watch of a chat a member filled is refused toolarge each time it opens the chat (here a 2 MB cap and 5 MB a minute) is never pushed below its byte allowance: its keep-alive, writes and reads go on; until the refusals are paid, what can be refused for its size waits, so an attacker\'s refusals still cost it', LIMIT, async () => {
  await withServer({ answerBytes: 2 * MB, bytesPerMin: 5 * MB, sideWritesPerMin: 1e6 }, async (T) => {
    const c = cid(), base = `channels/${c}/`, pid = b64(12).replace(/[^A-Za-z0-9]/g, 'a'), tag = label().replace(/[^A-Za-z0-9]/g, 'a');
    await fill(T, 40, (k) => ['set', { p: `${base}acts/${pid}~${tag}~k${k}`, d: { post: pid, kind: 'k' + k, iv: 'AAAAAAAAAAAAAAAA', ct: 'A'.repeat(60_000), ts: Date.now() } }]);
    const r = await connect(T.url); await r.hello();
    const es = [], bad = [];
    for (let k = 1; k <= 5; k++) {
      es.push((await r.call('sub', { s: k, p: base + 'acts', l: 1000 })).e);
      for (const [op, f] of [['ping', {}], ['set', { p: base + 'typing/0~' + tag, d: { ts: Date.now(), iv: 'AAAAAAAAAAAAAAAA', ct: 'AAAA' } }], ['get', { p: `${base}acts/${pid}~${tag}~k0` }]]) {
        const x = await r.call(op, f);
        if (!x.ok) bad.push(`after watch ${k}: ${op} ${x.e}`);
      }
    }
    assert.deepEqual(bad, []);
    const large = es.filter((e) => e === 'toolarge').length;
    assert.ok(large >= 2 && large <= 4, es.join(' '));
    assert.deepEqual(es.slice(large), Array(5 - large).fill('ratelimit'), es.join(' '));
    assert.equal((await r.call('query', { p: base + 'acts', l: 1 })).e, 'ratelimit');
    assert.equal((await r.call('mget', { ps: [`${base}acts/${pid}~${tag}~k0`] })).e, 'ratelimit');
    await r.close();
  });
});

test('junk frames over the frame allowance, never read, under the real limits: the server holds at most 1 MB and one reply, the frames wait, and the connection ends at idleMs as an idle one does', LIMIT, async () => {
  await withServer({ idleMs: 3000 }, async (T, kept) => {
    const d = kept(await deaf(T));
    d.flood('{"i":0,"op":"x"}');
    await heldThenEnds(T, d, MB + 1024, 'idle');
  });
});

test('the exact keep-alive ping over the allowance, answered and never read: the same', LIMIT, async () => {
  await withServer({ idleMs: 3000 }, async (T, kept) => {
    const d = kept(await deaf(T));
    d.flood('{"i":7,"op":"ping"}');
    await heldThenEnds(T, d, MB + 1024, 'idle');
  });
});

test('real requests within the allowances, large replies never read: at most 1 MB and one reply, the rest wait, the connection ends at idleMs; a client that reads goes on', LIMIT, async () => {
  await withServer({ idleMs: 3000 }, async (T, kept) => {
    const c = cid();
    await fill(T, 10, (k) => ['add', { p: `channels/${c}/posts`, d: post(60_000, k) }]);
    const w = await connect(T.url); await w.hello();
    const keep = setInterval(() => w.call('ping'), 1000);   // its keep-alive: idleMs is 3 s here
    keep.unref();
    const one = Buffer.byteLength(JSON.stringify({ i: 1, ok: true, docs: (await w.ok('query', { p: `channels/${c}/posts`, l: 300 })).docs }));
    const d = kept(await deaf(T));
    for (let k = 0; k < 100; k++) d.s.write(frame(JSON.stringify({ i: 100 + k, op: 'query', p: `channels/${c}/posts`, l: 300 })));
    await heldThenEnds(T, d, MB + one + 1024, 'idle');
    assert.equal((await w.ok('ping')).ok, true);
    clearInterval(keep);
    await w.close();
  });
});

test('pushes to a watch never read are not held back by the client\'s frames: past the hard limit (here 4 MB) the connection is closed, at most that and one push held; the writer goes on', LIMIT, async () => {
  await withServer({ sendBufferMaxBytes: 4 * MB, postsPerMin: 1e6 }, async (T, kept) => {
    const w = await connect(T.url); await w.hello();
    const c = cid();
    const d = kept(await deaf(T, [JSON.stringify({ i: 2, op: 'sub', s: 1, p: `channels/${c}/posts`, o: ['ts', 'desc'], l: 300 })]));
    for (let k = 0; k < 250 && T.srv.conns.has(d.conn) && d.peak <= 4 * MB + 70_000; k++) await w.ok('add', { p: `channels/${c}/posts`, d: post(60_000, k) });
    await heldThenEnds(T, d, 4 * MB + 70_000, 'not reading', { openMs: 0 });
    assert.equal((await w.ok('ping')).ok, true);
    await w.close();
  });
});

test('a slow reader starting with the frame allowance\'s whole burst of record watches (299, groups of 150 members, 8.4 MB), keep-alive pings going, idleMs 1.5 s: unsent bytes pass 1 MB, its frames wait and go on as it drains; never closed, every record arrives', LIMIT, async () => {
  await withServer({ idleMs: 1500 }, async (T, kept) => {
    const ids = Array.from({ length: 299 }, () => cid('g'));
    await fill(T, 299, (k) => ['set', { p: 'channels/' + ids[k], d: record(150) }]);
    const o = kept(await slowReader(T)), t0 = Date.now();
    ids.forEach((id, k) => o.r.ws.send(JSON.stringify({ i: 1000 + k, op: 'sub', s: k, p: 'channels', ids: [id] })));
    const inits = await Promise.all(ids.map((_, k) => o.r.waitPush((f) => f.s === k && f.t === 'init', 60000)));
    const took = Date.now() - t0;
    assert.equal(inits.filter((f) => f.docs.length === 1 && f.docs[0].d).length, 299);
    assert.ok(o.peak > MB, 'unsent bytes passed 1 MB on this machine: ' + o.peak);
    assert.ok(o.peak <= MB + 100_000, 'and never more than 1 MB and a frame\'s answer: ' + o.peak);
    assert.ok(took > 1500, 'it took longer than idleMs (' + took + ' ms); its pings, read between holds, kept it from being idle');
    assert.equal(o.reason, null, 'never closed');
    assert.equal((await o.r.ok('ping')).ok, true);
  });
});

test('a slow reader opening a chat of 300 posts of 16 KB (5 MB in one push) with its other watches, and getting four records of 1.3 MB at once: never closed, everything arrives (one large write is not counted unsent on every system: see the burst above for the counted case)', LIMIT, async () => {
  await withServer({ postsPerMin: 1e6 }, async (T, kept) => {
    const c = cid(), base = `channels/${c}/`, big = Array.from({ length: 4 }, () => cid('g'));
    await fill(T, 300, (k) => ['add', { p: base + 'posts', d: post(16_384, k) }]);
    await fill(T, 4, (k) => ['set', { p: 'channels/' + big[k], d: record(3500) }]);   // a frame is at most 1 MB: the record grows by an update
    await fill(T, 4, (k) => ['update', { p: 'channels/' + big[k], d: { keys: { 0: wraps(2300) } } }]);
    const o = kept(await slowReader(T));
    const subs = [[1, base + 'posts', { o: ['ts', 'desc'], l: 300 }], [2, base + 'acts', { l: 1000 }], [3, base + 'reads', { l: 1000 }], [4, base + 'typing', { l: 200 }], [5, base + 'comments', { l: 1000 }]];
    for (const [s, p, q] of subs) o.r.ws.send(JSON.stringify({ i: 50 + s, op: 'sub', s, p, ...q }));
    const gets = big.map((id) => o.r.call('get', { p: 'channels/' + id }));
    const inits = await Promise.all(subs.map(([s]) => o.r.waitPush((f) => f.s === s && f.t === 'init', 60000)));
    const recs = await Promise.all(gets);
    assert.equal(inits[0].docs.length, 300);
    assert.deepEqual(recs.map((g) => g.ok && JSON.stringify(g.d).length > 1.25 * MB), [true, true, true, true], JSON.stringify(recs.map((g) => g.ok ? JSON.stringify(g.d).length : g.e + ' ' + g.m)));
    assert.equal(o.reason, null, 'never closed');
  });
});

test('whatever the hard limit, what a client asked for never closes it: a slow reader\'s 299-record start (3.6 MB) with the hard limit set to 1 MB under an 8 MB soft one', LIMIT, async () => {
  await withServer({ sendBufferBytes: 8 * MB, sendBufferMaxBytes: MB }, async (T, kept) => {
    const ids = Array.from({ length: 299 }, () => cid('g'));
    await fill(T, 299, (k) => ['set', { p: 'channels/' + ids[k], d: record(50) }]);
    const o = kept(await slowReader(T));
    ids.forEach((id, k) => o.r.ws.send(JSON.stringify({ i: 1000 + k, op: 'sub', s: k, p: 'channels', ids: [id] })));
    await Promise.all(ids.map((_, k) => o.r.waitPush((f) => f.s === k && f.t === 'init', 60000)));
    assert.ok(o.peak > MB, 'past the hard limit: ' + o.peak);
    assert.equal(o.reason, null, 'never closed');
  });
});

test('guard: a page that reads opens a chat of 300 long posts (16 KB each, 5 MB in one push) with its other watches at once, under the real limits: everything arrives, nothing is closed', LIMIT, async () => {
  await withServer({ postsPerMin: 1e6 }, async (T) => {
    const c = cid(), base = `channels/${c}/`;
    await fill(T, 300, (k) => ['add', { p: base + 'posts', d: post(16_384, k) }]);
    const r = await connect(T.url); await r.hello();
    const subs = [[1, base + 'posts', { o: ['ts', 'desc'], l: 300 }], [2, base + 'acts', { l: 1000 }], [3, base + 'reads', { l: 1000 }], [4, base + 'typing', { l: 200 }], [5, base + 'comments', { l: 1000 }]];
    for (const [s, p, q] of subs) r.ws.send(JSON.stringify({ i: 50 + s, op: 'sub', s, p, ...q }));
    const inits = await Promise.all(subs.map(([s]) => r.waitPush((f) => f.s === s && f.t === 'init', 30000)));
    assert.equal(inits[0].docs.length, 300);
    assert.ok(JSON.stringify(inits[0]).length > 4.5 * MB);
    assert.equal(r.ws.readyState, 1, 'still open');
    assert.equal((await r.ok('ping')).ok, true);
    await r.close();
  });
});

test('guard: a page that reads starts with the frame allowance\'s whole burst of watches, one for each chat\'s record as the adapter sends them (records of 50 members), under the real limits: everything arrives, nothing is closed', LIMIT, async () => {
  await withServer({}, async (T) => {
    const ids = Array.from({ length: 299 }, () => cid('g'));   // 299 and the hello: the 300 frames of the burst
    await fill(T, 299, (k) => ['set', { p: 'channels/' + ids[k], d: record(50) }]);
    const r = await connect(T.url); await r.hello();
    let bytes = 0; r.ws.on('message', (m) => { bytes += m.length; });
    ids.forEach((id, k) => r.ws.send(JSON.stringify({ i: 1000 + k, op: 'sub', s: k, p: 'channels', ids: [id] })));
    const inits = await Promise.all(ids.map((_, k) => r.waitPush((f) => f.s === k && f.t === 'init', 30000)));
    assert.equal(inits.filter((f) => f.docs.length === 1 && f.docs[0].d).length, 299);
    assert.ok(bytes > 3 * MB, bytes + ' bytes');
    assert.equal(r.ws.readyState, 1, 'still open');
    await r.close();
  });
});

// ---- Release 112: which public channels the listing shows is not their creators' to choose ------------------------------------------

const LISTING = { p: 'channels', w: [['visibility', '==', 'public']], l: 100 };   // the page's frame
const ids13 = (head, n) => Array.from({ length: n }, (_, k) => head + String(k).padStart(11, '0'));

test('the public channel listing no longer shows the first 100 by id (a creator picks the id): with 100 small channels at the lowest ids and 5 honest ones after them, the page asks as ever and is answered 100 of them all picked at random, in id order, so some honest ones are seen at the first request and every one within five (before: none, ever); when l takes them all it is all of them in id order, as before; a channel made public is in it at once, one deleted is gone at once, and one that is not public as it is read is never answered', LIMIT, async () => {
  await withServer({}, async (T) => {
    const low = ids13('c0', 100), honest = ids13('cz', 5), all = [...honest, ...low];
    await fill(T, 105, (k) => ['set', { p: 'channels/' + all[k], d: pub() }]);
    const w = await connect(T.url); await w.hello();
    const seen = new Set(), sets = new Set();
    for (let k = 0; k < 5; k++) {
      const ids = (await w.ok('query', LISTING)).docs.map((x) => x.id);
      assert.deepEqual([ids.length, new Set(ids).size], [100, 100], 'a hundred, each once');
      assert.deepEqual(ids, [...ids].sort(), 'the ones answered come in id order');
      if (k === 0) assert.ok(ids.some((id) => honest.includes(id)), 'the first request shows honest ones');
      for (const id of ids) if (honest.includes(id)) seen.add(id);
      sets.add(ids.join());
    }
    assert.deepEqual([...seen].sort(), honest, 'every honest one within five requests');
    assert.ok(sets.size > 1, 'not the same hundred each time');
    assert.deepEqual((await w.ok('query', { ...LISTING, l: 1000 })).docs.map((x) => x.id), [...low, ...honest], 'all of them when l allows, in id order');
    await w.ok('set', { p: 'channels/cz99999999999', d: pub() });
    await w.ok('delete', { p: 'channels/' + honest[0] });
    T.srv.store.db.prepare("UPDATE docs SET d = json_set(d, '$.visibility', 'private') WHERE path = ?").run('channels/' + honest[1]);   // behind the server's back
    for (let k = 0; k < 2; k++) assert.deepEqual((await w.ok('query', { ...LISTING, l: 1000 })).docs.map((x) => x.id), [...low, ...honest.slice(2), 'cz99999999999'], 'the new one is there, the deleted one and the one no longer public are not');
    await w.close();
  });
});

test('channels made large no longer end the listing for those after them by id: 14 records of 150 KB at the lowest ids (2.1 MB, past the cap, here 2 MB) and 5 honest ones after them are read in an order each request picks, and it answers the records that fit, so every honest one is seen within five requests (before: 13 large ones and no honest one, ever); it is never refused, reads no record past the first that does not fit and parses none past the cap', LIMIT, async () => {
  await withServer({ answerBytes: 2 * MB }, async (T) => {
    const big = ids13('c0', 14), honest = ids13('cz', 5), w = await connect(T.url); await w.hello();
    for (const id of big) await w.ok('set', { p: 'channels/' + id, d: pub({ photo: 'data:image/jpeg;base64,' + b64(150_000) }) });
    for (const id of honest) await w.ok('set', { p: 'channels/' + id, d: pub() });
    const seen = new Set(), bad = [];
    for (let k = 0; k < 5; k++) {
      const [n, r, parsed] = await rowsRead(() => w.ok('query', LISTING)), ids = r.docs.map((x) => x.id);
      if (ids.filter((id) => big.includes(id)).length !== 13 || n !== ids.length + 1 || parsed !== ids.length) bad.push(`request ${k}: ${ids.length} answered, ${n} read, ${parsed} parsed`);
      for (const id of ids) if (honest.includes(id)) seen.add(id);
    }
    assert.deepEqual(bad, []);
    assert.deepEqual([...seen].sort(), honest, 'every honest one within five requests');
    await w.close();
  });
});

test('a member cannot grow a chat record through closed or last, two of the fields any member may write (a marker takes the place of the one before it whole): closed takes only message ids set to true, 64 KB in all, and last at most a message\'s 64 KB and its fixed fields, each looked at when a write changes it; a stopped poll and a latest-message marker as the page writes them are taken, and a record that held more before goes on taking writes', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const owner = await signup(T.url, await makeIdentity('ownerthirteen')), g = cid('g'), p = 'channels/' + g;
    const { caps } = await createChat(owner, g, groupDoc());
    const member = await signup(T.url, await makeIdentity('memberthirteen'));
    await member.ok('chat.open', { cid: g, cap: caps.m });
    const upd = async (d) => (await member.call('update', { p, d })).e || 'ok', id = (k) => 'm' + String(k).padStart(12, '0');
    const many = (from) => Object.fromEntries(Array.from({ length: 2000 }, (_, k) => [id(from + k), true]));   // 42 KB
    const lastOf = (dLen) => ({ sl: 1, id: id(1), ts: Date.now(), e: 0, n: b64(16), d: b64(dLen), exp: 0, edited: 0, from: null, iv: null, ct: null, sig: null });   // ui.js, lastOf
    const got = [
      ['a stopped poll', await upd({ closed: { [id(1)]: true } }), 'ok'],
      ['a second', await upd({ closed: { [id(2)]: true } }), 'ok'],
      ['the first again', await upd({ closed: { [id(1)]: true } }), 'ok'],
      ['a key that is no message id', await upd({ closed: { x: true } }), 'invalid'],
      ['a value that is not true', await upd({ closed: { [id(3)]: 'A'.repeat(700_000) } }), 'invalid'],
      ['2000 polls stopped in one write (42 KB)', await upd({ closed: many(100) }), 'ok'],
      ['2000 more (past 64 KB)', await upd({ closed: many(5000) }), 'invalid'],
      ['the marker of a message at its cap', await upd({ ts: Date.now(), last: lastOf(60_000) }), 'ok'],
      ['a marker made large', await upd({ last: { ...lastOf(100), d: 'A'.repeat(100_000) } }), 'invalid'],
      ['no marker', await upd({ last: null }), 'ok'],
    ];
    assert.deepEqual(got.filter(([, e, want]) => e !== want).map(([what, e, want]) => `${what}: ${e}, not ${want}`), []);
    // A record from before the caps, written by hand here: what it holds stays and it takes writes, a new stopped poll too.
    const db = T.srv.store.db, row = JSON.parse(db.prepare('SELECT d FROM docs WHERE path = ?').get(p).d);
    db.prepare('UPDATE docs SET d = ? WHERE path = ?').run(JSON.stringify({ ...row, closed: { [id(1)]: true, x: { old: 'A'.repeat(1000) } }, last: { d: 'A'.repeat(100_000) } }), p);
    assert.deepEqual([await upd({ ts: Date.now() }), await upd({ closed: { [id(9000)]: true } }), await upd({ closed: { x: { old: 'B' } } })], ['ok', 'ok', 'invalid']);
    // A marker takes the place of the one before it whole. So what a record holds under a key of last that the page does not write,
    // from before the caps or put there by a member within them, is not in the way of the next message and is gone with it.
    const keys = async () => Object.keys((await owner.ok('get', { p })).d.last).sort().join(' '), PAGE = 'd e edited exp id n sl ts';
    db.prepare('UPDATE docs SET d = ? WHERE path = ?').run(JSON.stringify({ ...row, last: { x: 'A'.repeat(100_000) } }), p);
    assert.deepEqual([await upd({ ts: Date.now(), last: lastOf(200) }), await keys()], ['ok', PAGE], 'a record that held 100 KB under last.x');
    assert.deepEqual([await upd({ last: { x: 'A'.repeat(60_000) } }), await upd({ ts: Date.now(), last: lastOf(60_000) }), await keys()], ['ok', 'ok', PAGE], 'a member puts 60 KB under last.x, then a message at its cap');
    await member.close(); await owner.close();
  } finally { await T.stop(); }
});

// ---- Release 112: what one address may take over all its connections (its sockets were 40 budgets) ----------------------------------

test('one address has so much server time a minute over all its connections (here 3,000 ms, and the test\'s clock makes every frame take 100): past it its frames are refused ratelimit with a retry, on a new connection too, while its keep-alive ping is still answered and another address is answered as ever', LIMIT, async () => {
  let t = 0;
  const T = await startServer({ clock: () => (t += 100), limits: { frameMsPerMinPerAddr: 3000 } });
  try {
    const a = await from(T, '203.0.113.41'), es = [];   // its hello is the first frame; one said again is answered conflict
    for (let k = 0; k < 40; k++) es.push((await a.call('hello', { v: 1 })).e);
    const n = es.indexOf('ratelimit');
    assert.ok(n >= 28 && n <= 32 && es.slice(0, n).every((e) => e === 'conflict') && es.slice(n).every((e) => e === 'ratelimit'), es.join(' '));
    const r = await a.call('hello', { v: 1 });
    assert.ok(r.e === 'ratelimit' && r.retry > 0, JSON.stringify(r));
    // In whole seconds: to the millisecond it told the asker how long its last request had kept the server, a twentieth of a millisecond a unit.
    assert.equal(r.retry % 1000, 0, 'the wait is given in whole seconds: ' + r.retry);
    assert.equal((await a.call('ping')).ok, true, 'its keep-alive is answered all the same');
    const b = await connect(T.url, { headers: { 'x-forwarded-for': '203.0.113.41' } });
    assert.equal((await b.call('hello', { v: 1 })).e, 'ratelimit', 'a new connection from that address has no time of its own');
    const c = await from(T, '203.0.113.42');
    assert.equal((await c.call('hello', { v: 1 })).e, 'conflict', 'another address is answered');
    // However much an address took, it is at most a minute from being answered again: the count stops at one minute's worth below zero.
    const [first] = T.srv.conns, fm = first.ctx.frameMs;   // the first address's connection
    fm.spend(first.fixedTag, 1e9);
    assert.ok(fm.tokensLeft(first.fixedTag) >= -3000, `what that address has left: ${fm.tokensLeft(first.fixedTag)}`);
    const again = await a.call('hello', { v: 1 });
    assert.ok(again.e === 'ratelimit' && again.retry <= 61_000 && again.retry % 1000 === 0, JSON.stringify(again));
    // The server looks at the count twice (to refuse, then for the wait): one made good in between is still told to wait a second, not 0.
    const left = fm.tokensLeft;
    fm.tokensLeft = () => 1;
    const edge = await a.call('hello', { v: 1 });
    fm.tokensLeft = left;
    assert.ok(edge.e === 'ratelimit' && edge.retry === 1000, JSON.stringify(edge));
    await c.close(); await b.close(); await a.close();
  } finally { await T.stop(); }
});

test('a write is not charged the time its pushes take: whoever holds many watches on a chat (here 40 on one connection, and the test\'s clock makes each push take 100 ms) cannot have the people who write in it refused for server time; the writer\'s address pays for its own frame alone', LIMIT, async () => {
  let t = 0;
  const T = await startServer({ clock: () => (t += 5), limits: { frameMsPerMinPerAddr: 3000 } });
  try {
    const p = `channels/${cid()}/posts`, was = new Set(T.srv.conns), w = await from(T, '203.0.113.71');
    const wc = [...T.srv.conns].find((c) => !was.has(c)), send = wc.send.bind(wc);
    let pushes = 0;
    wc.send = (f) => { if (f.t === 'set') { pushes++; t += 100; } return send(f); };   // a push to the watcher takes the server 100 ms
    for (let s = 1; s <= 40; s++) await w.ok('sub', { s, p, l: 10 });
    const a = await from(T, '203.0.113.72'), ac = [...T.srv.conns].find((c) => !was.has(c) && c !== wc), fm = ac.ctx.frameMs, spent = [];
    const spend = fm.spend.bind(fm);
    fm.spend = (k, n, ...r) => { if (k === ac.fixedTag) spent.push(n); return spend(k, n, ...r); };   // what the writer's address is charged, frame by frame
    await a.ok('add', { p, d: post(100, 0) });
    assert.equal(pushes, 40, 'the message went to every watch');
    assert.ok(spent.at(-1) > 0 && spent.at(-1) <= 50, `the writer's address paid ${spent.at(-1)} ms for a frame whose pushes took 4,000`);
    assert.equal((await a.call('add', { p, d: post(100, 1) })).ok, true, 'and its next message is taken');
    await a.close(); await w.close();
  } finally { await T.stop(); }
});

test('a page whose address runs out of server time between the hello and the sign-in of a new connection is not left online and signed out: the server ends a connection whose sign-in it refused for that, and the page as shipped (its adapter, unchanged) comes back and signs in', LIMIT, async () => {
  const T = await startServer({ authz: 'standard', limits: { frameMsPerMinPerAddr: 3000 } });
  const B = '/* ===== HUSH ADAPTER BEGIN ===== */', E = '/* ===== HUSH ADAPTER END ===== */', all = appSource();
  const createHushAdapter = new Function(all.slice(all.indexOf(B) + B.length, all.indexOf(E)) + '\nreturn createHushAdapter;')();
  let drain = null, proves = 0, db;
  class Sock extends WebSocket {
    constructor(url) { super(url, { headers: { 'x-forwarded-for': '203.0.113.61' } }); }
    send(s) { if (/"op":"prove"/.test(s)) { proves++; if (drain) { drain(); drain = null; } } return super.send(s); }
  }
  try {
    const id = await makeIdentity('pagesixtyone');
    await (await signup(T.url, id)).close();
    db = createHushAdapter(T.url, { WebSocket: Sock, pingMs: 2000, callTimeoutMs: 5000, offlineWaitMs: 3000 });
    await db.ready;
    await db.prove({ h: id.handle, pub: id.sig, dev: '', signDev: null, signAcct: (m) => signText(id.sigKey, m) });
    const conn = [...T.srv.conns].find((c) => c.proven === id.handle), fm = conn.ctx.frameMs, tag = conn.fixedTag;
    drain = () => fm.spend(tag, fm.tokensLeft(tag) + 100);   // 100 ms below zero as the page sends its sign-in: two seconds to make good
    proves = 0;
    conn.ws.terminate();   // the connection drops; the page comes back by itself
    const t0 = Date.now();
    while (Date.now() - t0 < 25_000 && !(db.online && db.proven === id.handle && proves > 1)) await sleep(100);
    assert.deepEqual([db.online, db.proven, proves > 1], [true, id.handle, true], `after ${Date.now() - t0} ms, ${proves} sign-ins sent`);
    await db.doc('directory/' + id.handle).update({ bio: 'back' });
  } finally { if (db) db.close(); await T.stop(); }
});

test('the refusal allowance is one address\'s over all its connections: once refused answers have used it up (here 5 MB a minute, an answer of 2.4 MB under a 2 MB cap), a new connection from that address is refused ratelimit at once, with nothing read, also when it comes after the address closed every socket it had; another address has its own', LIMIT, async () => {
  await withServer({ answerBytes: 2 * MB, bytesPerMin: 5 * MB, postsPerMin: 1e6 }, async (T) => {
    const p = `channels/${cid()}/posts`, w = await from(T, '203.0.113.51');
    for (let k = 0; k < 40; k++) await w.ok('add', { p, d: post(60_000, k) });
    await w.close();
    const q = { p, l: 1000 }, a = await from(T, '203.0.113.52'), es = [];
    for (let k = 0; k < 6; k++) es.push((await a.call('query', q)).e);
    assert.ok(es[0] === 'toolarge' && es[5] === 'ratelimit', es.join(' '));
    const b = await from(T, '203.0.113.52'), [n, r] = await rowsRead(() => b.call('query', q));
    assert.deepEqual([r.e, n], ['ratelimit', 0], 'a new connection from that address');
    await b.close(); await a.close();
    for (let t = 0; t < 100 && [...T.srv.conns].some((x) => !x.closed); t++) await sleep(20);
    assert.equal(T.srv.conns.size, 0, 'the address has no socket open');
    const back = await from(T, '203.0.113.52');
    assert.equal((await back.call('query', q)).e, 'ratelimit', 'it comes back and finds what it left');
    const c = await from(T, '203.0.113.53');
    assert.equal((await c.call('query', q)).e, 'toolarge', 'another address is refused by the cap, from its own allowance');
    await c.close(); await back.close();
  });
});

test('what is unsent to one address over all its connections has a budget (here 6 MB): 12 connections that never read each ask for a 2.4 MB answer, and the server holds at most the budget and one answer for them all, the others\' frames waiting; a push to one of them holding more than 1 MB closes it (not reading), and with the address below its budget again one waiting frame is answered; another address is answered meanwhile', LIMIT, async () => {
  await withServer({ unsentBytesPerAddr: 6 * MB }, async (T, kept) => {
    const p = `channels/${cid()}/posts`;
    await fill(T, 40, (k) => ['add', { p, d: post(60_000, k) }]);
    const ds = [], ask = frame(JSON.stringify({ i: 9, op: 'query', p, l: 40 }));
    for (let k = 0; k < 12; k++) { const d = kept(await deaf(T, [], '203.0.113.61')); d.conn.ws._socket.cork(); ds.push(d); }
    ds[0].s.write(frame(JSON.stringify({ i: 8, op: 'sub', s: 1, p, o: ['ts', 'desc'], l: 1 })));   // the first watches the chat as well
    const unsent = (d) => (T.srv.conns.has(d.conn) ? d.conn.ws.bufferedAmount : 0), total = () => ds.reduce((n, d) => n + unsent(d), 0), big = () => ds.filter((d) => unsent(d) > MB);
    let most = 0;
    for (const d of ds) { d.s.write(ask); for (let t = 0; t < 20; t++) { await sleep(10); most = Math.max(most, total()); } }
    for (let t = 0; t < 50; t++) { await sleep(20); most = Math.max(most, total()); }
    assert.ok(most <= 6 * MB + 2.5 * MB, `${(most / MB).toFixed(1)} MB held for the address at most; its budget and one answer are 8.5`);
    assert.deepEqual([big().length, ds.filter((d) => d.conn.later.length === 1).length], [3, 9], 'three were answered (the third went past the budget), nine wait');
    const other = await connect(T.url); await other.hello();
    assert.equal((await other.ok('query', { p, l: 40 })).docs.length, 40, 'another address is answered');
    await other.ok('add', { p, d: post(100, 99) });   // a push for the first, which holds its answer unsent
    for (let t = 0; t < 100 && ds[0].reason === null; t++) await sleep(20);
    assert.equal(ds[0].reason, 'not reading');
    for (let t = 0; t < 100 && big().length < 3; t++) await sleep(20);
    await sleep(300);
    assert.deepEqual([big().length, big().includes(ds[0]), ds.filter((d) => d.conn.later.length === 1).length], [3, false, 8], 'one that waited is answered in its place');
    await other.close();
  });
});

test('a connection that is held is still read, so its close is seen: one that asked for a 2.4 MB answer and never read it sends a close frame, another ends its socket, and each is gone within a second with what it held (before: at idleMs, here 30 s)', LIMIT, async () => {
  await withServer({ idleMs: 30_000 }, async (T, kept) => {
    const p = `channels/${cid()}/posts`;
    await fill(T, 40, (k) => ['add', { p, d: post(60_000, k) }]);
    for (const [what, bye] of [['a close frame', (s) => s.write(Buffer.from([0x88, 0x80, 0, 0, 0, 0]))], ['the end of its socket', (s) => s.end()]]) {
      const d = kept(await deaf(T));
      d.conn.ws._socket.cork();
      d.s.write(frame(JSON.stringify({ i: 2, op: 'query', p, l: 40 })));
      for (let t = 0; t < 200 && !d.conn.held; t++) await sleep(10);
      assert.ok(d.conn.held && d.conn.ws.bufferedAmount > MB, what + ': held');
      bye(d.s);
      const t0 = Date.now();
      while (T.srv.conns.has(d.conn) && Date.now() - t0 < 5000) await sleep(20);
      const ms = Date.now() - t0;
      assert.ok(!T.srv.conns.has(d.conn) && ms < 1000, `${what}: ${T.srv.conns.has(d.conn) ? 'still open' : 'gone'} after ${ms} ms`);
      for (let t = 0; t < 100 && d.conn.ws.readyState !== CLOSED; t++) await sleep(20);
      assert.equal(d.conn.ws.readyState, CLOSED, what + ': and its socket gone');
    }
  });
});
