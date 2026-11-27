// The paced queue after the reviews of release 111: what a long list gets back first when its connection was lost and is made
// again with the records kept (every wake of a phone, every change of network). The call watches come back inside the first
// burst, before everything else, whatever else waits; nothing is refused; and the whole list is back no later than before.
// And the first unread count of a chat among the list's first 20 goes with its record on every connection, not only the first.
// The adapter runs as written, against a stand-in server with the real server's frame and query buckets.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TokenBucket } from '../src/limits.js';
import { world, page, pageKept, callWatch, count, tick, range, cidOf, what, refused, back, fast } from './adapter-pace-kit.js';

const until = async (fn, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms && !fn();) await tick(20); return fn(); };
const num = (cid) => Number(cid.slice(1));
const isCall = (f) => f.op === 'sub' && /\/call$/.test(f.p);
const chatIn = (f) => f.cid || (f.ids && f.ids[0]) || (/^channels\/([^/]+)/.exec(f.p || '') || [])[1];   // the chat a frame is for
const EVERY_SECOND = range(0, 90).map((j) => j * 2);   // 90 one-on-one chats: every second row of the list's first 180

// A page that is whole, then loses its connection. The first connection has an allowance nobody reaches, so the start is through
// at once; the next one has the real allowances (`fpm` frames at once less what is kept back, then fpm / 60 a second).
//   n, ring   the chats, in the list's order, and the rows that have a call watch
//   k         the clock runs k times as fast (allowance seconds pass in 1 / k s); 0 is the real clock
//   rtt       the round trip on the new connection: ms, or rtt(frame)
//   on        the test's own answer on the new connection (as the kit's)
//   caps      the page's keys for a chat, when working them out takes time; else the record is read once and kept
function scene({ n, ring, fpm = 300, k = 0, rtt = 30, on = null, caps = null }) {
  const T = k ? fast(k) : null;
  const W = world({ fpm, qpm: 120, now: T ? T.now : null, rtt: (f, sock) => sock.n === 0 ? 2 : typeof rtt === 'function' ? rtt(f) : rtt,
    on: (f, sock, rec) => {
      if (sock.n > 0) return on ? on(f, sock, rec) : undefined;
      if (f.op === 'hello') { sock.bucket = new TokenBucket(1e6, 1e6); sock.queries = null; return { ok: true, nonce: 'n0', now: Date.now(), limits: { framesPerMin: 600000 } }; }
    } });
  const db = caps ? page(W, { caps, rank: num }) : pageKept(W, { rank: num });
  const S = { W, db, live: new Set(), ended: [], t0: 0, onRecord: null };
  S.whole = async () => {
    await db.ready;
    for (const j of range(0, n)) db.doc('channels/' + cidOf(j)).onSnapshot((s) => { if (s.exists && s.data().full) { S.live.add(cidOf(j)); if (S.onRecord) S.onRecord(cidOf(j)); } }, (e) => S.ended.push(cidOf(j) + ' ' + (e && e.code)));
    for (const j of ring) callWatch(db, cidOf(j));
    assert.ok(await until(() => W.socks[0].held.size === n + ring.length && S.live.size === n, 15000), 'the page is whole: ' + W.socks[0].held.size + ' watches of ' + (n + ring.length));
    await tick(60);   // and every watch has had its first answer
  };
  S.lose = async () => { await back(W, db, 0); S.t0 = W.sent.find((f) => f.sock === 1).at; };   // t0: the new connection's hello
  S.on1 = () => W.sent.filter((f) => f.sock === 1 && f.op !== 'hello');
  S.calls = () => S.on1().filter(isCall);
  S.held = () => W.socks[1].held.size;
  S.secs = (at = Date.now()) => (at - S.t0) * (k || 1) / 1000;   // allowance seconds since the hello
  S.cost = (burst = Math.floor(fpm * 0.9) - 1 - fpm * 0.2) => (S.on1().length - burst) / (fpm / 60);   // what the frames sent so far cost at the allowance's rate, after the first burst
  S.clean = () => [W.over.filter((f) => f.sock === 1).length, W.conflicts.length];
  S.end = () => { db.close(); if (T) T.off(); };
  return S;
}

// ---- the call watches come back inside the first burst ----

const SHAPES = [
  ['300 chats, 90 of them with a call watch', 300, EVERY_SECOND],
  ['100 chats, 90 of them with a call watch', 100, range(0, 90)],
  ['100 chats of mine, 90 with a call watch, under 120 newer chats that have none (message requests)', 220, range(120, 210)],
];
for (const [name, n, ring] of SHAPES) test('after a dropped connection every call watch is sent within 1 s of the new connection\'s hello, and none is refused: ' + name, async (t) => {
  const S = scene({ n, ring });
  try {
    await S.whole(); await S.lose(); await tick(1000);
    const ms = S.calls().map((f) => f.at - S.t0), soon = ms.filter((x) => x <= 1000).length;
    t.diagnostic('call watches sent within 1 s: ' + soon + ' of ' + ring.length + (ms.length ? ', the last of them after ' + Math.max(...ms.filter((x) => x <= 1000)) + ' ms' : ''));
    assert.equal(soon, ring.length, 'call watches sent within 1 s of the hello: ' + soon + ' of ' + ring.length);
    await tick(80);
    assert.equal([...S.W.socks[1].held.values()].filter(isCall).length, ring.length, 'and the server holds every one');
    assert.deepEqual([...S.clean(), S.ended.length], [0, 0, 0], 'none refused, no watch id twice, none given up: ' + refused(S.W));
  } finally { S.end(); }
});

test('the whole list is back no later than before: 300 chats and 90 call watches are all watched again within 5 s of what their frames cost at the allowance\'s rate (96 s), and none is refused', async (t) => {
  const S = scene({ n: 300, ring: EVERY_SECOND, k: 20, rtt: 5 });
  try {
    await S.whole(); await S.lose();
    assert.ok(await until(() => S.held() === 390, 9000), 'every watch is held again: ' + S.held() + ' of 390');
    const secs = S.secs(), cost = S.cost();
    t.diagnostic('the whole list after ' + secs.toFixed(1) + ' s of allowance; its ' + S.on1().length + ' frames cost ' + cost.toFixed(1) + ' s');
    assert.equal(S.on1().length, 690, 'one open and one record watch a chat, one call watch for each of the 90: no frame twice');
    assert.ok(secs <= cost + 5, 'the whole list after ' + secs.toFixed(1) + ' s, its frames cost ' + cost.toFixed(1) + ' s');
    assert.deepEqual([...S.clean(), S.ended.length], [0, 0, 0], 'none refused: ' + refused(S.W));
  } finally { S.end(); }
});

test('the same when the answers come back apart: opens answered 20 to 420 ms later, every call watch is still sent within 1 s (a chat\'s record watch does not take the place kept for a call watch still to come)', async (t) => {
  const S = scene({ n: 300, ring: EVERY_SECOND, rtt: (f) => f.op === 'chat.open' ? 20 + (num(f.cid) % 6) * 80 : 20 });   // over four turns of the queue: a late turn cannot gather every answer
  try {
    await S.whole(); await S.lose(); await tick(1000);
    const ms = S.calls().map((f) => f.at - S.t0), soon = ms.filter((x) => x <= 1000).length;
    t.diagnostic('call watches sent within 1 s: ' + soon + ' of 90');
    assert.equal(soon, 90, 'call watches sent within 1 s of the hello: ' + soon + ' of 90');
    assert.deepEqual(S.clean(), [0, 0], 'none refused: ' + refused(S.W));
  } finally { S.end(); }
});

test('the same when the keys of the chats that ring are worked out last: the other chats\' opens, first in the queue, leave room for the opens and the call watches still to come', async (t) => {
  const late = (cid) => num(cid) >= 150 && num(cid) < 240;   // the 90 one-on-one chats are rows 150 to 239, and their keys take 120 ms
  const S = scene({ n: 300, ring: range(150, 240), caps: async (cid) => { if (late(cid)) await tick(120); return 'cap-' + cid; } });
  try {
    await S.whole(); await S.lose(); await tick(1000);
    const ms = S.calls().map((f) => f.at - S.t0), soon = ms.filter((x) => x <= 1000).length;
    t.diagnostic('call watches sent within 1 s: ' + soon + ' of 90');
    assert.equal(soon, 90, 'call watches sent within 1 s of the hello: ' + soon + ' of 90');
    assert.deepEqual(S.clean(), [0, 0], 'none refused: ' + refused(S.W));
  } finally { S.end(); }
});

// ---- a call watch that cannot come holds nothing back ----

test('chats that ring but can no longer be opened (the server says "denied") hold the others back by nothing: every other chat is watched within 5 s of what the frames cost', async (t) => {
  const shut = new Set(EVERY_SECOND.slice(0, 40).map(cidOf));
  const S = scene({ n: 300, ring: EVERY_SECOND, k: 20, rtt: 5, on: (f) => f.op === 'chat.open' && shut.has(f.cid) ? { ok: false, e: 'denied', m: 'not a member' } : undefined });
  try {
    await S.whole(); await S.lose();
    assert.ok(await until(() => S.held() === 310, 9000), 'every chat that can be opened is watched again, 260 records and 50 call watches: ' + S.held());
    const secs = S.secs(), cost = S.cost();
    t.diagnostic('the others after ' + secs.toFixed(1) + ' s of allowance; the ' + S.on1().length + ' frames cost ' + cost.toFixed(1) + ' s');
    assert.ok(secs <= cost + 5, 'the others after ' + secs.toFixed(1) + ' s, the frames cost ' + cost.toFixed(1) + ' s');
    assert.deepEqual(S.clean(), [0, 0], 'none refused: ' + refused(S.W));
  } finally { S.end(); }
});

test('nor do chats that ring whose open the server is too busy for, again and again: every other chat is watched within 5 s of what the frames cost', async (t) => {
  const busy = new Set(EVERY_SECOND.slice(0, 10).map(cidOf));
  const S = scene({ n: 300, ring: EVERY_SECOND, k: 20, rtt: 5, on: (f) => f.op === 'chat.open' && busy.has(f.cid) ? { ok: false, e: 'ratelimit', m: 'slow down' } : undefined });
  try {
    await S.whole(); await S.lose();
    assert.ok(await until(() => S.held() === 370, 9000), 'every chat that can be opened is watched again, 290 records and 80 call watches: ' + S.held());
    const secs = S.secs(), cost = S.cost();
    t.diagnostic('the others after ' + secs.toFixed(1) + ' s of allowance; the ' + S.on1().length + ' frames cost ' + cost.toFixed(1) + ' s');
    assert.ok(secs <= cost + 5, 'the others after ' + secs.toFixed(1) + ' s, the frames cost ' + cost.toFixed(1) + ' s');
    assert.equal(S.ended.length, 0, 'and no watch is given up: ' + S.ended.join(', '));
  } finally { S.end(); }
});

// ---- a server of 60 frames a minute ----

test('a server of 60 frames a minute: 40 chats, 30 of them with a call watch, are all watched again, the call watches before any frame of a chat that has none, none refused, in the time the frames cost', async (t) => {
  const S = scene({ n: 40, ring: range(10, 40), fpm: 60, k: 30, rtt: 5 });   // the ten newest chats have no call watch
  try {
    await S.whole(); await S.lose();
    assert.ok(await until(() => S.held() === 70, 6000), 'every watch is held again: ' + S.held() + ' of 70');
    const secs = S.secs(), cost = S.cost(), names = S.on1(), lastCall = names.findLastIndex(isCall), firstOther = names.findIndex((f) => num(chatIn(f)) < 10);
    t.diagnostic('the whole list after ' + secs.toFixed(1) + ' s of allowance; its ' + names.length + ' frames cost ' + cost.toFixed(1) + ' s');
    assert.ok(lastCall < firstOther, 'every call watch before the first frame of a chat that has none: the last call watch is frame ' + lastCall + ', ' + what(names[firstOther]) + ' is frame ' + firstOther);
    assert.ok(secs <= cost + 5, 'the whole list after ' + secs.toFixed(1) + ' s, its frames cost ' + cost.toFixed(1) + ' s');
    assert.deepEqual([...S.clean(), S.ended.length], [0, 0, 0], 'none refused: ' + refused(S.W));
  } finally { S.end(); }
});

test('on such a server, chats that ring whose open is never answered do not hold the others back for good: once the count is full the others go at the allowance\'s rate', async (t) => {
  const mute = new Set(range(15, 40).map(cidOf));   // 25 of the 30 chats that ring
  const S = scene({ n: 40, ring: range(10, 40), fpm: 60, k: 10, rtt: 5, on: (f) => f.op === 'chat.open' && mute.has(f.cid) ? 'drop' : undefined });
  try {
    await S.whole(); await S.lose();
    const ok = await until(() => S.held() === 20, 7500);   // 75 s of allowance: the count is full after 36 s, then 25 frames at one a second
    t.diagnostic('the chats that can be opened after ' + S.secs().toFixed(1) + ' s of allowance: ' + S.held() + ' watches of 20');
    assert.ok(ok, 'the fifteen chats that can be opened are watched, and the five call watches among them: ' + S.held() + ' of 20 after ' + S.secs().toFixed(0) + ' s of allowance');
  } finally { S.end(); }
});

// ---- after a reconnect a top row's first unread count goes with its record again ----

// The rows in `rows` were counted once on the first connection, as every chat with something unread is at a start.
const countedOnce = (S, rows) => Promise.all(rows.map((j) => count(S.db, cidOf(j))));
// On the new connection the chats in `rows` have a new message: when the record of one comes back the page asks its count, and
// for a row in `twice` asks it once more when that count is answered (a busy chat). `at` keeps, for each count, how many frames
// the new connection had sent when it was asked; `open` is how many are not answered yet.
function fresh(S, rows, twice = []) {
  const want = new Set(rows.map(cidOf)), again = new Set(twice.map(cidOf)), A = { at: new Map(), open: 0 };
  const ask = (cid, name) => { A.at.set(name, S.on1().length); A.open++; return count(S.db, cid).then(() => { A.open--; }, () => { A.open--; }); };
  S.onRecord = (cid) => { if (want.delete(cid)) ask(cid, cid).then(() => { if (again.has(cid)) ask(cid, cid + ' again'); }); };
  return A;
}
const frame = (S, name, nth = 0) => { const fs = S.on1(), ks = fs.map((f, k) => what(f) === name ? k : -1).filter((k) => k >= 0); return ks.length > nth ? { k: ks[nth], at: fs[ks[nth]].at } : null; };

test('after a dropped connection the first unread count of a chat among the list\'s first 20 goes with its record again, not behind every record of the list: for the first and the nineteenth row of 300 chats, chats that ring, the count is sent within 1 s of the chat\'s record watch', async (t) => {
  const S = scene({ n: 300, ring: EVERY_SECOND });
  try {
    await S.whole(); await countedOnce(S, range(0, 20));
    fresh(S, [0, 18]); await S.lose(); await tick(2000);
    for (const j of [0, 18]) {
      const w = frame(S, 'watch ' + cidOf(j)), c = frame(S, 'query ' + cidOf(j) + '/posts');
      t.diagnostic('row ' + j + ': its record watch ' + (w ? (w.at - S.t0) + ' ms' : 'not sent') + ' after the hello, its count ' + (c ? (c.at - S.t0) + ' ms after' : 'not sent in 2 s'));
      assert.ok(w && c && c.at - w.at <= 1000, 'row ' + j + ': the count within 1 s of the record watch: ' + (w && c ? (c.at - w.at) + ' ms' : 'the count was not sent in 2 s'));
    }
    assert.deepEqual([...S.clean(), S.W.qover.length], [0, 0, 0], 'none refused: ' + refused(S.W));
  } finally { S.end(); }
});

test('the same for chats that do not ring: once asked, the count of the second and of the twentieth row is the next frame the queue sends, before every chat further down; since the queue-order fix a chat past the twentieth row no longer waits for every chat\'s open (its first count goes with its row), and a second count of a top row on the same connection goes ahead of the bulk too, but not before 5 s after the row\'s first', async (t) => {
  const S = scene({ n: 300, ring: EVERY_SECOND, k: 20, rtt: 5 });
  try {
    await S.whole(); await countedOnce(S, [...range(0, 20), 30, 31]);
    const A = fresh(S, [1, 19, 30, 31], [1]); await S.lose();
    assert.ok(await until(() => S.held() === 390 && A.at.size === 5 && A.open === 0, 12000), 'the list is back and every count answered: ' + S.held() + ' watches, ' + A.at.size + ' counts asked, ' + A.open + ' not answered');
    const lastOpen = S.on1().findLastIndex((f) => f.op === 'chat.open'), secs = (x) => S.secs(x.at).toFixed(1) + ' s';
    for (const j of [1, 19]) {
      const cid = cidOf(j), w = frame(S, 'watch ' + cid), c = frame(S, 'query ' + cid + '/posts');
      t.diagnostic('row ' + j + ' (no call watch): its record watch ' + secs(w) + ' of allowance after the hello, its count ' + secs(c));
      assert.ok(c.k - A.at.get(cid) <= 1, 'row ' + j + ': its count is the next frame sent once it is asked: ' + (c.k - A.at.get(cid)) + ' frames went before it');
    }
    for (const j of [30, 31]) {
      const cid = cidOf(j), w = frame(S, 'watch ' + cid), c = frame(S, 'query ' + cid + '/posts');
      t.diagnostic('row ' + j + ' (past the first 20): its record watch ' + secs(w) + ' of allowance after the hello, its count ' + secs(c));
      assert.ok(c.k < lastOpen, 'row ' + j + ' goes with its row, not after every chat\'s open: its count is frame ' + c.k + ', the last open frame ' + lastOpen);
    }
    const first = frame(S, 'query c001/posts'), again = frame(S, 'query c001/posts', 1);
    t.diagnostic('the second count of row 1 on this connection: ' + secs(again) + ' of allowance after the hello, its first ' + secs(first));
    assert.ok(again.k < lastOpen, 'a second count of the same top row goes ahead of the bulk: frame ' + again.k + ', the last open frame ' + lastOpen);
    assert.ok(S.secs(again.at) - S.secs(first.at) >= 4.9, 'but not before 5 s after the row\'s first count went: ' + (S.secs(again.at) - S.secs(first.at)).toFixed(1) + ' s');
    assert.deepEqual([...S.clean(), S.W.qover.length], [0, 0, 0], 'none refused: ' + refused(S.W));
  } finally { S.end(); }
});
