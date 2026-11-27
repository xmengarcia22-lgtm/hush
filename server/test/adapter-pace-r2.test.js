// The paced start, the second round's points (release 111): unread counts are also held under the page's own count of the query
// allowance (120 at once, then 2 a second; the last 24 are left for profile reads), they go in the order they waited, a held count
// holds nothing else back, the first count of each chat on the list goes with its row (since release 111's queue-order fix; before
// it, of the list's first 20 chats only), a watch is sent once on a connection, and after a dropped connection every watch goes back
// through the queue.
// The adapter runs as written, against a stand-in server with the real server's frame and query buckets.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { world, page, pageKept, start, count, callWatch, openChat, tick, range, cidOf, who, what, refused, back, fast, at } from './adapter-pace-kit.js';

const queries = (W, from = 0) => W.sent.slice(from).filter((f) => f.op === 'query' && /\/posts$/.test(f.p)).map(what);
const until = async (fn, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms && !fn();) await tick(25); return fn(); };
const keyed = (W, extra = {}) => page(W, { caps: async (cid) => 'cap-' + cid, ...extra });   // the keys held already (a record the page has read): a chat's open costs one frame
const dirQueries = (db, n) => { for (let k = 0; k < n; k++) db.collection('directory').where('h', '==', 'u' + k).get().catch(() => {}); };   // queries that are not counts: never held, always counted

test('unread counts are held under the query allowance too: a start asks for no more counts at once than the server answers, the rest follow as it refills, and none is refused', async () => {
  const T = fast(10), W = world({ fpm: 600, qpm: 120, now: T.now }), db = keyed(W);
  try {
    await db.ready; const done = []; for (const k of range(0, 150)) count(db, cidOf(k)).then(() => done.push(k), () => {});   // 150 opens and 150 counts: frames are no bound here
    await tick(150);
    const n = queries(W).length;
    assert.ok(n >= 84 && n <= 90, 'at once: the page\'s 108 less the 24 it leaves for profile reads, ' + n + ' counts');
    const t0 = Date.now(), reads = [];
    for (let k = 0; k < 20; k++) { reads.push(db.doc('directory/u' + k).get().then(() => Date.now() - t0, (e) => e.code)); await tick(1); }   // twenty profile reads, each its own moment
    const ms = await Promise.race([Promise.all(reads), tick(3000).then(() => [])]);
    assert.ok(ms.length === 20 && ms.every((x) => typeof x === 'number' && x < 900), 'profile reads are not held behind the counts: each answered within half a second and a round trip: ' + ms.join(', '));
    assert.equal(W.sent.filter((f) => f.op === 'mget').length, 1, 'made while the page\'s query count is under 48, they are joined: one request');
    assert.ok(await until(() => done.length === 150, 12000), 'every count is answered in the end: ' + done.length);
    assert.deepEqual([W.qover.length, W.over.length], [0, 0], 'none refused');
  } finally { db.close(); T.off(); }
});

test('unread counts go in the order they waited, not in the list\'s order: a chat\'s next count joins behind every count already waiting', async () => {
  const T = fast(10), W = world({ fpm: 600, qpm: 120, now: T.now }), db = keyed(W, { rank: (cid) => Number(cid.slice(1)) });
  try {
    await db.ready;
    await Promise.all([23, 25, 29].map((k) => count(db, cidOf(k))));   // three chats outside the list's first 20, opened and counted once
    dirQueries(db, 116); await tick(50);   // the query allowance is spent: the server has 1 left
    const n = W.sent.length;
    for (const k of [29, 25, 23]) count(db, cidOf(k)).catch(() => {});
    await tick(20); count(db, 'c029').catch(() => {});   // the first of them is asked for again while its count still waits
    await tick(100);
    assert.equal(queries(W, n).length, 0, 'the counts wait');
    assert.ok(await until(() => queries(W, n).length === 4, 10000), 'and go as the allowance comes back: ' + queries(W, n).join(', '));
    assert.deepEqual(queries(W, n), ['query c029/posts', 'query c025/posts', 'query c023/posts', 'query c029/posts'], 'in the order they were asked');
    assert.equal(W.qover.length, 0, 'none refused');
  } finally { db.close(); T.off(); }
});

test('a count that is held for the query allowance holds nothing back: the records behind it in the queue and chat.base go on', async () => {
  const T = fast(10), W = world({ fpm: 600, qpm: 120, now: T.now }), db = keyed(W, { rank: (cid) => Number(cid.slice(1)) });
  try {
    await db.ready; dirQueries(db, 100); await tick(50);   // the page's count of the query allowance is under the 24 it leaves
    const n = W.sent.length, P = start(db, 5); db.setBase('c004', 'base').catch(() => {});   // the first counts of the list's first chats sit among their records
    await tick(200);
    assert.equal(queries(W, n).length, 0, 'the counts wait');
    assert.equal(P.live.size, 5, 'every record is live');
    assert.ok(at(W, 'base c004', n) >= 0, 'and chat.base went');
    assert.ok(await until(() => queries(W, n).length === 5), 'the counts follow: ' + queries(W, n).length);
    assert.deepEqual([W.qover.length, W.over.length], [0, 0], 'none refused');
  } finally { db.close(); T.off(); }
});

test('the first count of each chat on the list goes with its row, so its badge comes with its row: before the record watch of the row after it, the first 20 rows and the rows further down alike; a first chat\'s second count goes too', async () => {
  const T = fast(40), W = world({ fpm: 60, qpm: 120, now: T.now }), db = page(W, { rank: (cid) => Number(cid.slice(1)) });
  try {
    await db.ready; start(db, 60, [], { counts: false });
    const firsts = range(0, 60).map((k) => count(db, cidOf(k)).catch(() => {}));
    firsts[0].then(() => count(db, 'c000').catch(() => {}));   // the first chat changes again: its second count
    assert.ok(await until(() => queries(W).length === 61, 15000), 'every count is sent in the end: ' + queries(W).length);
    const late = range(0, 59).filter((k) => at(W, 'query ' + cidOf(k) + '/posts') > at(W, 'watch ' + cidOf(k + 1)));
    assert.deepEqual(late, [], 'each chat\'s first count before the record watch of the row after it (before release 111\'s queue-order fix only the first 20 rows\' counts went with the records)');
    assert.equal(queries(W).filter((x) => x === 'query c000/posts').length, 2, 'the second count of the first chat went after');
    assert.deepEqual([W.qover.length, W.over.length], [0, 0], refused(W));
  } finally { db.close(); T.off(); }
});

test('the next account has its own first counts: what the account before was counted for is forgotten with it', async () => {
  const T = fast(40), W = world({ fpm: 60, qpm: 120, now: T.now }), db = page(W, { rank: (cid) => Number(cid.slice(1)) });
  try {
    await db.ready; await db.prove(who('alice')); await count(db, 'c000');   // Alice's first count of the list's first chat
    await db.prove(who('bob')); const n = W.sent.length;
    start(db, 60, [], { counts: false }); count(db, 'c000').catch(() => {});   // Bob's first count of the same chat
    assert.ok(await until(() => at(W, 'get c059', n) >= 0, 15000), 'the last chat is begun');
    assert.ok(at(W, 'query c000/posts', n) >= 0 && at(W, 'query c000/posts', n) < at(W, 'get c059', n), 'his first count went with the records');
  } finally { db.close(); T.off(); }
});

test('a watch whose open was waiting for the connection when it came back is sent once, not once by the send that waited and once by the reconnect: with few watches and with more than 120', async () => {
  for (const others of [0, 125]) {
    const W = world({ fpm: 600 }), ended = []; let live = 0, posts = 0;
    const db = page(W, { caps: async (cid) => { await tick(1); await db.preview(cid); return 'cap-' + cid; } });
    try {
      await db.ready;
      for (const k of range(0, others)) db.doc('directory/u' + k).onSnapshot(() => {}, () => {});
      await tick(50);
      W.socks[0].readyState = 3;   // the socket is closing under the page, which has not heard of it yet
      db.doc('channels/c000').onSnapshot((s) => { if (s.exists && s.data().full) live++; }, (e) => ended.push('record ' + e.code));
      openChat(db, 'c001', () => { posts++; }); db.collection('channels/c001/typing').onSnapshot(() => {}, (e) => ended.push('typing ' + e.code));
      await tick(20);   // their key reads now wait for a connection
      W.socks[0].onclose({ code: 1006 }); db.probe(50);
      await until(() => db.online && W.socks.length === 2, 3000); await tick(1500);
      const on1 = W.sent.filter((f) => f.sock === 1 && f.op === 'sub' && /^channels/.test(f.p)).map(what).sort();
      assert.equal(W.conflicts.length, 0, others + ' other watches: a watch id was sent twice: ' + W.conflicts.map(what).join(', '));
      assert.deepEqual(ended, [], others + ' other watches: no watch was given up');
      assert.deepEqual(on1, ['sub c001/posts', 'sub c001/typing', 'watch c000'], others + ' other watches: each sent once');
      assert.ok(live >= 1 && posts >= 1, 'and both are live');
    } finally { db.close(); }
  }
});

test('a watch the server was too busy for is sent again a little later under the same id, and so is one whose chat the server took away and the page opened again', async () => {
  let refuse = 1;
  const W = world({ fpm: 600, on: (f) => f.op === 'sub' && f.p === 'channels' && refuse-- > 0 ? { ok: false, e: 'ratelimit', m: 'too many subscriptions on this connection' } : undefined });
  const db = page(W);
  try {
    await db.ready; const P = start(db, 1, [], { counts: false });
    await tick(100); assert.equal(P.live.size, 0, 'refused once');
    assert.ok(await until(() => P.live.size === 1, 4000), 'sent again');
    assert.deepEqual([W.sent.filter((f) => what(f) === 'watch c000').length, W.conflicts.length, P.ended.length], [2, 0, 0]);
    W.socks[0].held.clear(); W.push(0, { t: 'evict', cid: 'c000' });   // the server ends the chat's watches with its level (a key change), then says so
    await tick(150);
    assert.deepEqual([W.sent.filter((f) => what(f) === 'watch c000').length, W.conflicts.length, P.ended.length], [3, 0, 0], 'opened again, and watched again');
    assert.equal(W.socks[0].held.size, 1);
  } finally { db.close(); }
});

test('the page counts what the server counts as a query: an invite read, a look-up of its own reactions and one of member cards are counted too', async () => {
  const T = fast(10), W = world({ fpm: 600, qpm: 120, now: T.now }), db = keyed(W);
  try {
    await db.ready; await count(db, 'c000');
    for (const k of range(0, 40)) { db.inviteBlob('c000', 'i' + k).catch(() => {}); db.mine('c000', ['p' + k]).catch(() => {}); if (k < 30) db.slots('c000', 'cap', ['u' + k]).catch(() => {}); }   // 110 of them
    await tick(50);
    const done = []; for (const k of range(1, 21)) count(db, cidOf(k)).then(() => done.push(k), () => {});
    assert.ok(await until(() => done.length === 20, 12000), 'every count is answered: ' + done.length);
    assert.equal(W.qover.length, 0, 'and the server refused no query: ' + W.qover.map(what).slice(0, 5).join(', '));
  } finally { db.close(); T.off(); }
});

test('after a dropped connection every watch goes back through the queue: in the list\'s order, the chats that ring first, each watch once, and no frame refused on the real allowances', async () => {
  const rank = (cid) => 149 - Number(cid.slice(1));   // the list's first row is the chat the page began last
  const T = fast(20), W = world({ fpm: 300, qpm: 120, now: T.now }), db = pageKept(W, { rank });
  try {
    await db.ready; const P = start(db, 150, range(130, 150), { counts: false });   // the list's first 20 ring
    assert.ok(await until(() => P.live.size === 150, 12000), 'the start is through: ' + P.live.size);
    await tick(600);   // the allowance comes back
    await back(W, db, 0);
    const on1 = () => W.sent.filter((f) => f.sock === 1);
    assert.ok(await until(() => on1().filter((f) => f.op === 'sub').length === 170, 10000), 'every watch is sent again: ' + on1().filter((f) => f.op === 'sub').length);
    await tick(100);
    assert.deepEqual([W.over.filter((f) => f.sock === 1).length, W.conflicts.length, P.ended.length], [0, 0, 0], 'none refused, no watch id twice, none given up: ' + refused(W));
    assert.deepEqual(on1().filter((f) => f.op === 'chat.open').map((f) => f.cid), range(0, 150).reverse().map(cidOf), 'the chats are opened in the list\'s order');
    const names = on1().map(what), calls = range(130, 150).map((k) => names.indexOf('sub ' + cidOf(k) + '/call')), plain = range(0, 130).reverse().map((k) => names.indexOf('watch ' + cidOf(k)));
    assert.ok(Math.min(...calls) >= 0 && Math.max(...calls) < Math.min(...plain), 'every call watch before the record watch of a chat that has none');
    assert.deepEqual(plain, [...plain].sort((a, b) => a - b), 'and those in the list\'s order');
    assert.equal(W.socks[1].held.size, 170, 'the server holds one watch for each');
  } finally { db.close(); T.off(); }
});
