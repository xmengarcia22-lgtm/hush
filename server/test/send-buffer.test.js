// A client that does not read (release 110). The server held every reply and every push for it, with no limit: one socket sending
// junk frames over its allowance made it hold about 1 MB more a second, and one address has 40 sockets. Now, what a client asks for
// is held back by the client itself: while more than sendBufferBytes is unsent, its frames wait unread, so its own requests can make
// the server hold at most that and one frame's answer, and a slow reader is only slowed, never closed. What it did not ask for (a
// watch's pushes) can still grow, so past sendBufferMaxBytes the connection is closed. A connection that waits and never drains ends
// at idleMs as before; one that drains is not idle. Raw TCP clients that never read, slow readers, and readers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { StatementSync } from 'node:sqlite';

import { startServer, connect, connectAs, signup, makeIdentity, createChat, sleep, label, wrap, groupDoc, channelDoc } from './helpers.js';
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
async function deaf(T, first = []) {
  const port = Number(new URL(T.url).port), was = new Set(T.srv.conns);
  const s = net.connect(port, '127.0.0.1');
  s.on('error', () => {});
  await new Promise((r) => s.once('connect', r));
  s.write(`GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
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
  let waiting = 0;   // frames read off the socket and waiting: no more than one read's worth, since the socket is not read meanwhile
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

test('the public channel listing as the page asks for it (visibility public, 100), with channels made large past the cap (here 2 MB), is answered with the records that fit, in order, never refused: five honest ones, then two of four large ones; the server reads no record past the first that does not fit, and parses none past the cap', LIMIT, async () => {
  await withServer({ answerBytes: 2 * MB }, async (T) => {
    const w = await connect(T.url); await w.hello();
    const honest = Array.from({ length: 5 }, (_, k) => 'c0' + String(k).padStart(11, '0')), big = Array.from({ length: 4 }, (_, k) => 'cz' + String(k).padStart(11, '0'));
    for (const id of honest) await w.ok('set', { p: 'channels/' + id, d: pub({ photo: 'data:image/jpeg;base64,' + b64(15_000) }) });
    for (const id of big) {
      await w.ok('set', { p: 'channels/' + id, d: pub() });
      await w.ok('update', { p: 'channels/' + id, d: { closed: { x: 'A'.repeat(700_000) } } });   // a member's field (authz.js)
    }
    const [n, r, parsed] = await rowsRead(() => w.ok('query', { p: 'channels', w: [['visibility', '==', 'public']], l: 100 }));
    assert.deepEqual(r.docs.map((x) => x.id), [...honest, ...big.slice(0, 2)]);
    assert.deepEqual([n, parsed], [8, 7], 'records read, records parsed');
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

test('the public channel listing goes through its own index, in id order, up to the client\'s l: SQLite visits no other chat record and sorts none (private ones at lower ids were all read first); it answers what the page got, the public ones by id; an order or any other condition on it is refused', LIMIT, async () => {
  await withServer({}, async (T) => {
    const w = await connect(T.url); await w.hello();
    const priv = ['c00000000000a', 'c00000000000b'], pubs = ['c10000000000a', 'c10000000000b', 'c10000000000c'];
    for (const id of priv) await w.ok('set', { p: 'channels/' + id, d: channelDoc() });
    for (const id of pubs) await w.ok('set', { p: 'channels/' + id, d: pub() });
    await w.ok('set', { p: 'channels/' + cid('g'), d: groupDoc() });
    const P = StatementSync.prototype, iterate = P.iterate, sql = [];
    P.iterate = function (...a) { sql.push(this.sourceSQL); return iterate.apply(this, a); };
    let r;
    try { r = await w.ok('query', { p: 'channels', w: [['visibility', '==', 'public']], l: 100 }); } finally { P.iterate = iterate; }
    assert.deepEqual(r.docs.map((x) => x.id), pubs);
    assert.deepEqual((await w.ok('query', { p: 'channels', w: [['visibility', '==', 'public']], l: 2 })).docs.map((x) => x.id), pubs.slice(0, 2), 'the client\'s l');
    const plans = sql.map((s) => T.srv.store.db.prepare('EXPLAIN QUERY PLAN ' + s).all().map((x) => x.detail).join('; '));
    assert.equal(plans.length, 1, plans.join(' | '));
    assert.match(plans[0], /^SEARCH docs USING INDEX docs_channels_vis \(<expr>=\?\)$/);
    for (const q of [{ o: ['name', 'asc'] }, { o: ['id', 'desc'] }, { w: [['visibility', '==', 'public'], ['name', '==', 'x']] }, { w: [['visibility', '==', 'public'], ['visibility', '==', 'public']] }]) {
      assert.equal((await w.call('query', { p: 'channels', w: [['visibility', '==', 'public']], l: 100, ...q })).e, 'denied', JSON.stringify(q));
    }
    await w.close();
  });
});

test('a connection that has not signed in, or that holds no key to a chat, is refused before the server reads the chat record (here a group record of 1.4 MB): set, update and delete read no document; the owner\'s update goes on', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const owner = await signup(T.url, await makeIdentity('ownerfive')), g = cid('g');
    await createChat(owner, g, groupDoc());
    for (const f of ['x', 'y']) await owner.ok('update', { p: 'channels/' + g, d: { closed: { [f]: 'A'.repeat(700_000) } } });
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

test('an mget and a watch by ids count what they answer, to the byte: a chat record whole for its owner, its preview for a stranger (a sign-up proof); a cap of that size answers it, one byte less refuses it', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const owner = await signup(T.url, await makeIdentity('ownerseven')), g = cid('g'), p = 'channels/' + g;
    await createChat(owner, g, groupDoc());
    await owner.ok('update', { p, d: { closed: { x: 'A'.repeat(700_000) } } });   // a member's field (authz.js): not in the preview
    const stranger = await connectAs(T.url, await makeIdentity('strangerseven'), { pub: true });
    const size = async (c) => Buffer.byteLength(JSON.stringify((await c.ok('mget', { ps: [p] })).docs[0].d));
    const whole = await size(owner), preview = await size(stranger), L = T.srv.store.limits, bad = [];
    assert.ok(whole > 700_000 && preview < 10_000, `${whole} ${preview}`);
    let s = 0;
    for (const [what, c, n, f] of [['owner, mget', owner, whole, () => ({ op: 'mget', ps: [p] })], ['owner, watch', owner, whole, () => ({ op: 'sub', s: ++s, p: 'channels', ids: [g] })], ['stranger, mget', stranger, preview, () => ({ op: 'mget', ps: [p] })]]) {
      for (const [cap, e] of [[n, undefined], [n - 1, 'toolarge']]) {
        L.answerBytes = cap;
        const { op, ...x } = f(), r = await c.call(op, x);
        if (r.e !== e) bad.push(`${what}, cap ${cap} for ${n} bytes: ${r.e || 'answered'}`);
      }
    }
    assert.deepEqual(bad, []);
    await stranger.close(); await owner.close();
  } finally { await T.stop(); }
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
