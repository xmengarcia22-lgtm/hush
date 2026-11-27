// The page's paced start (release 111; release 101's tests carried over by hand, and the first round's list). A page with many
// chats sent about 4 frames a chat at once when it started; past about 70 chats that is more than a connection's allowance (300
// frames, then 5 a second, SPEC.md 9.4), and the refusals that followed kept the list from loading and the chat just tapped from
// opening. Now the adapter keeps its own count of the allowance (the server's number comes with hello) and the start's own frames
// for chats nobody is looking at wait in one queue, at the one place a frame is sent: the record read for a chat's keys,
// chat.open, the record watch, the call watch, the unread count, chat.base. Anything else, and everything for a chat the user
// is in or acts on, goes at once. The queue belongs to one account on one connection.
// The adapter runs as written, against a stand-in server that counts every frame with the real server's own bucket.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { world, page, pageKept, start, count, callWatch, openChat, tick, range, cidOf, who, what, refused, lose, back, fast, at } from './adapter-pace-kit.js';

const gets = (W, sock = 0) => W.sent.filter((f) => f.sock === sock && f.op === 'get').map(what);

test('a start with many chats is sent at the pace the server allows: nothing is refused, the allowance is used at once down to a reserve, and the rest follows as it refills', async () => {
  const W = world({ fpm: 60 }), db = page(W);
  try {
    await db.ready;
    start(db, 40, range(20, 40));   // 40 records at 3 frames, 40 unread counts, 20 call watches, 20 chat.base: 220 frames against 60
    await tick(1500);
    const n = W.sent.length;
    assert.equal(W.over.length, 0, refused(W));
    assert.ok(n >= 40 && n <= 46, 'most of the allowance is used at once; a fifth is kept for what the user does, and a tenth is never counted on (the page\'s clock is not the server\'s): ' + n + ' frames');
    await tick(3300);
    assert.ok(W.sent.length >= n + 2 && W.sent.length <= n + 5, 'the rest follows as the allowance refills, a frame a second: ' + n + ' then ' + W.sent.length);
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); }
});

test('under about 70 chats on the real allowance nothing waits: a start of 60 chats is whole in a few round trips, as before', async () => {
  const W = world({ fpm: 300 }), db = page(W);
  try {
    await db.ready; const P = start(db, 60, [], { counts: false });   // 180 frames against the 209 that go at once
    await tick(200);
    assert.equal(P.live.size, 60, 'every chat is live');
    assert.deepEqual([W.sent.length, W.over.length], [181, 0], 'the hello and three frames a chat, none refused');
  } finally { db.close(); }
});

test('a chat opened in the middle of the start does not wait its turn: all it needs goes at once and it is drawn in a few round trips', async () => {
  const W = world({ fpm: 60 }), db = page(W);
  try {
    await db.ready; start(db, 60); await tick(400);
    const cid = cidOf(55), had = W.sent.filter((f) => what(f).includes(cid)).length, t0 = Date.now(); let drawn = 0;   // a chat far down the list
    openChat(db, cid, () => { drawn = drawn || Date.now() - t0; });
    await tick(250);
    assert.ok(drawn > 0 && drawn < 150, 'its posts came ' + drawn + ' ms after the tap');
    assert.equal(had, 0, 'though nothing of it had gone out before the tap');
    assert.deepEqual(W.sent.filter((f) => what(f).includes(cid) && f.op !== 'query').map(what).sort(), ['get c055', 'open c055', 'sub c055/posts', 'watch c055'], 'its record read, which was waiting, its open and its watches');
    assert.equal(W.over.length, 0, refused(W));
    for (const k of [56, 57]) openChat(db, cidOf(k));   // and two more chats, one after the other
    await tick(100);
    assert.equal(W.over.length, 0, 'the reserve is there for this: ' + refused(W));
  } finally { db.close(); }
});

test('something the user does in a chat that is not on screen does not wait its turn either: a write to a chat far down the list is answered at once', async () => {
  const W = world({ fpm: 60 }), db = page(W);
  try {
    await db.ready; start(db, 60); await tick(400);
    assert.ok(!gets(W).includes('get c055'), 'its record read was still waiting');
    const t0 = Date.now();
    const done = await Promise.race([db.doc('channels/' + cidOf(55) + '/posts/p1').set({ x: 1 }).then(() => true), tick(2000)]);   // not awaited for ever: in its turn it would be a minute
    assert.ok(done && Date.now() - t0 < 150, done ? 'written after ' + (Date.now() - t0) + ' ms' : 'not written in 2 s: it waits its turn');
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); }
});

test('the order of the queue: the call watches and their chats first, then the other chats\' records in the order the page began them, then the unread counts, chat.base last', async () => {
  const T = fast(5), W = world({ fpm: 60, now: T.now }), db = page(W);   // a frame of allowance in two turns of the queue, so a frame is answered before the next goes, as on the real clock. The order is among the frames that wait together: on a faster clock a count can go while the last chat's open is on its way
  try {
    await db.ready; const P = start(db, 20, [16, 17, 18, 19]);   // 88 frames against the 41 that go at once
    for (let k = 0; k < 300 && W.sent.filter((f) => f.op === 'chat.base').length < 4; k++) await tick(50);
    const A = (name) => { const k = at(W, name); assert.ok(k >= 0, name + ' was sent'); return k; };
    assert.deepEqual(gets(W).slice(0, 5), ['get c016', 'get c017', 'get c018', 'get c019', 'get c000'], 'a chat that rings is begun first');
    const calls = [16, 17, 18, 19].map((k) => A('sub ' + cidOf(k) + '/call')), ring = [16, 17, 18, 19].map((k) => A('watch ' + cidOf(k))), others = range(0, 16).map((k) => A('watch ' + cidOf(k)));
    assert.ok(Math.max(...calls, ...ring) < Math.min(...others), 'every call watch, and the record watch of its chat, before the record watch of a chat that has none');
    assert.deepEqual(others, [...others].sort((a, b) => a - b), 'the others in the order the page began them');
    const counts = W.sent.map((f, k) => f.op === 'query' ? k : -1).filter((k) => k >= 0), bases = W.sent.map((f, k) => f.op === 'chat.base' ? k : -1).filter((k) => k >= 0);
    assert.equal(counts.length, 20, 'every count was sent');
    assert.ok(Math.min(...counts) > Math.max(...others, ...calls), 'the unread counts after the records and the call watches');
    assert.ok(Math.min(...bases) > Math.max(...counts), 'chat.base waits for all of it');
    assert.equal(P.live.size, 20); assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); T.off(); }
});

test('once frames wait, a chat\'s next frame goes before a later chat\'s first: the list fills from the top, chat by chat, not a part of every chat', async () => {
  const T = fast(10), W = world({ fpm: 60, now: T.now }), db = page(W);
  try {
    await db.ready; const P = start(db, 60, [], { counts: false });   // the 41 frames that go at once are the first 41 record reads
    for (let k = 0; k < 60 && P.live.size < 4; k++) await tick(50);
    const first = W.sent.findIndex((f) => f.op !== 'hello' && f.op !== 'get'), burst = W.sent.slice(1, first).map(what), after = W.sent.slice(first).map(what);
    assert.ok(burst.length >= 41 && burst.length <= 42, 'at once: ' + burst.length + ' frames');
    assert.deepEqual(burst, range(0, burst.length).map((k) => 'get ' + cidOf(k)), 'the record reads of the first chats, in the order the page began them');
    assert.ok(!after.slice(0, 8).some((x) => x.startsWith('get ')), 'then, as the allowance refills, no later chat is begun while an earlier one has a frame waiting: ' + after.slice(0, 8).join(', '));
    for (const k of range(0, 4)) { const w = after.indexOf('watch ' + cidOf(k)), o = after.indexOf('open ' + cidOf(k + 3)); assert.ok(w >= 0 && (o < 0 || w < o), 'chat ' + k + ' is finished before the chat three places down is gone on with: ' + after.slice(0, 12).join(', ')); }
    assert.deepEqual([...P.live].slice(0, 4), ['c000', 'c001', 'c002', 'c003'], 'the list fills from the top');
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); T.off(); }
});

test('the page can give the order: with its list\'s order, the most recent chat goes first though it was begun last, and a chat the list does not hold goes last', async () => {
  const W = world({ fpm: 60 }), db = page(W, { rank: (cid) => cid === 'c011' ? -1 : 10 - Number(cid.slice(1)) });   // c010 is the list's first row, c000 its last; c011 is not in it
  try {
    await db.ready; start(db, 12, [], { counts: false });
    for (let k = 0; k < 100 && gets(W).length < 12; k++) await tick(50);   // the eleven are all among the list's first 20, whose room for their next frames is the whole burst here: the one the list does not hold goes when that room is let go, 3 s after their last frame
    assert.deepEqual(gets(W), [...range(0, 11).reverse().map((k) => 'get ' + cidOf(k)), 'get c011'], 'in the list\'s order, the one the list does not hold after every chat it does');
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); }
});

test('a start begun before the connection is up (the list kept from last time) is paced the same: its reads wait their turn when the connection comes', async () => {
  const W = world({ fpm: 60 }), db = page(W);
  try {
    start(db, 40, range(20, 40)); await db.ready; await tick(40);
    assert.equal(gets(W)[0], 'get c020', 'a chat with a call watch first');
    await tick(1400);
    assert.equal(W.over.length, 0, refused(W));
    assert.ok(W.sent.length >= 40 && W.sent.length <= 46, 'the hello, what goes at once, and what a second and a half gives back: ' + W.sent.length + ' frames');
  } finally { db.close(); }
});

test('the queue belongs to one account on one connection: after a sign-out or a switch of account in the middle of a start, nothing of the old account goes out on the new connection', async () => {
  for (const next of [null, who('bob')]) {
    const W = world({ fpm: 60 }), db = page(W);
    try {
      await db.ready; await db.prove(who('alice')); start(db, 40, range(20, 40)); await tick(150);
      let heard = null; count(db, 'c019').then(() => { heard = 'answered'; }, (e) => { heard = e.code; });   // a count whose chat is still far down the queue
      await db.prove(next);
      if (next) db.doc('channels/c050').onSnapshot(() => {}, () => {});   // the next account begins its own start, which sets the queue going again
      await tick(900);
      assert.deepEqual(W.sent.filter((f) => f.sock === 1).map(what), next ? ['hello', 'prove', 'get c050', 'open c050', 'watch c050'] : ['hello'], next ? 'after a switch of account: its own chat and nothing else' : 'after a sign-out');
      assert.equal(heard, 'offline', 'and what waited in the queue is told so, not left waiting for ever');
      assert.equal(W.socks.length, 2);
    } finally { db.close(); }
  }
});

test('what an account had waiting for a connection when it signed out is not sent when the connection comes', async () => {
  const W = world({ fpm: 60 }), db = page(W);
  try {
    await db.ready; await db.prove(who('alice'));
    lose(W, 0);   // the connection is lost
    for (const k of range(0, 5)) count(db, cidOf(k)).catch(() => {});   // her counts wait for the next one
    await tick(20); await db.prove(null); await tick(300);
    assert.deepEqual(W.sent.filter((f) => f.sock === 1).map(what), ['hello']);
  } finally { db.close(); }
});

test('a chat whose keys were still being worked out when the account changed is not opened on the new account\'s connection, nor is the read that waited for it sent there (call refuses another account\'s frame)', async () => {
  let open; const gate = new Promise((r) => { open = r; });
  const W = world({ fpm: 60 }), db = page(W, { caps: (cid) => gate.then(() => 'cap-' + cid) });
  try {
    await db.ready; await db.prove(who('alice'));
    db.doc('channels/c000').onSnapshot(() => {}, () => {});
    count(db, 'c000').catch(() => {});
    await tick(50); await db.prove(who('bob')); open(); await tick(300);
    assert.deepEqual(W.sent.filter((f) => f.sock === 1).map(what), ['hello', 'prove']);
  } finally { db.close(); }
});

test('keys worked out for the account before are not taken as opening the chat for the next one: what the old account had waiting on them is told there is no connection, and is not sent as the new account', async () => {
  let open, asked = 0; const gate = new Promise((r) => { open = r; });
  const W = world({ fpm: 60 }), db = page(W, { caps: (cid) => ++asked === 1 ? gate.then(() => 'cap-' + cid) : Promise.resolve('cap-' + cid) });   // both accounts hold the same key for this chat
  try {
    await db.ready; await db.prove(who('alice'));
    let heard = null; db.setBase('c000', 'alice-base').then(() => { heard = 'sent'; }, (e) => { heard = e.code; });   // Alice's, while her keys are still being worked out
    await tick(30); await db.prove(who('bob'));
    let live = false; db.doc('channels/c000').onSnapshot(() => { live = true; }, () => {});   // Bob is in the same chat, and his connection now holds it
    await tick(100); assert.ok(live, 'Bob\'s watch is live');
    open(); await tick(200);
    assert.equal(heard, 'offline', 'Alice\'s call heard ' + heard);
    assert.deepEqual(W.sent.filter((f) => f.sock === 1 && f.op === 'chat.base').map((f) => f.cap), [], 'and her chat.base did not go out on Bob\'s connection');
  } finally { db.close(); }
});

test('and the next account\'s own watch of that chat is opened with its own keys, worked out afresh, not left waiting on the old account\'s', async () => {
  let open, asked = 0; const gate = new Promise((r) => { open = r; });
  const W = world({ fpm: 60 }), db = page(W, { caps: (cid) => { const n = ++asked; return gate.then(() => 'key' + n + '-' + cid); } });
  try {
    await db.ready; await db.prove(who('alice'));
    db.doc('channels/c000').onSnapshot(() => {}, () => {});   // Alice's: her keys (the first asked for) are still being worked out
    await tick(50); await db.prove(who('bob'));
    let live = false; db.doc('channels/c000').onSnapshot(() => { live = true; }, () => {});   // Bob is in the same chat
    await tick(50); open(); await tick(1);
    count(db, 'c000').catch(() => {});   // his unread count, while his open is on its way
    await tick(400);
    const on1 = W.sent.filter((f) => f.sock === 1);
    assert.deepEqual(on1.filter((f) => f.op === 'chat.open').map((f) => f.cap), ['key2-c000'], 'opened once, with the keys asked for after the switch');
    assert.deepEqual([on1.filter((f) => what(f) === 'watch c000').length, live], [1, true], 'and his watch is live');
  } finally { db.close(); }
});

test('call watches added when their chats are already open wait their turn too, so the reserve is still there for the user', async () => {
  const W = world({ fpm: 60 }), db = pageKept(W);   // the page keeps a chat's record once read (capsFor), so a later watch costs its one frame
  try {
    await db.ready; const P = start(db, 10); await tick(300);   // 10 records and 10 counts, 40 frames: the allowance is down to the reserve
    assert.equal(P.live.size, 10);
    for (const k of range(0, 10)) callWatch(db, cidOf(k));   // as the page does once its list has come
    await tick(200);
    const n = W.sent.filter((f) => /\/call$/.test(f.p || '')).length;
    assert.ok(n >= 1 && n <= 3, 'not ten at once: ' + n);
    for (const k of [20, 21]) openChat(db, cidOf(k));   // and the user opens two chats
    await tick(100);
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); }
});

test('a chat is hurried for one connection only: after a reconnect a chat the user had opened and left takes its turn again', async () => {
  const W = world({ fpm: 60 }), db = page(W);
  try {
    await db.ready; start(db, 40, [], { counts: false }); await tick(300);
    const un = openChat(db, 'c030'); await tick(50); un();   // opened, and left again
    await back(W, db, 0); await tick(300);
    const again = gets(W, 1);
    assert.ok(again.length >= 6 && !again.slice(0, 6).includes('get c030'), 'c030 is not sent ahead of the list\'s first chats: ' + again.slice(0, 8).join(', '));
    assert.equal(W.over.filter((f) => f.sock === 1).length, 0, refused(W));
  } finally { db.close(); }
});

test('the allowance is the server\'s own number, told at hello: a server that allows 120 a minute is sent more at once than one that allows 60, and still nothing is refused', async () => {
  const W = world({ fpm: 120 }), db = page(W);
  try {
    await db.ready; start(db, 60, range(30, 60)); await tick(1400);   // 360 frames against 120
    assert.equal(W.over.length, 0, refused(W));
    assert.ok(W.sent.length >= 84 && W.sent.length <= 92, 'the hello, the 83 that go at once and two a second: ' + W.sent.length + ' frames');
  } finally { db.close(); }
});

test('a server from before release 100 names no allowance: the page paces itself by 300 a minute, and nothing is refused there either', async () => {
  const W = world({ fpm: 300, old: true }), db = page(W);
  try {
    await db.ready; start(db, 150, range(75, 150)); await tick(1600);   // 750 frames against 300
    assert.equal(W.over.length, 0, refused(W));
    assert.ok(W.sent.length >= 210 && W.sent.length <= 224, 'the hello, the 209 that go at once and five a second: ' + W.sent.length + ' frames');
  } finally { db.close(); }
});

test('a number under 60, a number in a string or a list is not believed as the allowance: the page paces itself by 300', async () => {
  for (const told of [30, 59, '600', [600]]) {
    const W = world({ fpm: 300, told }), db = page(W);
    try {
      await db.ready; start(db, 150, range(75, 150)); await tick(400);
      assert.equal(W.over.length, 0, JSON.stringify(told) + ': ' + refused(W));
      assert.ok(W.sent.length >= 210 && W.sent.length <= 216, JSON.stringify(told) + ': the hello and the 209 that go at once on 300, ' + W.sent.length + ' frames');
    } finally { db.close(); }
  }
});

test('a server from before release 100 refuses a keep-alive over the allowance: the page takes the refusal for an answer, not for a dead socket', async () => {
  const W = world({ fpm: 2, old: true }), db = page(W, { pingMs: 100 });   // the hello and one keep-alive, then nothing for 30 s
  try {
    await db.ready; await tick(650);
    assert.ok(W.over.filter((f) => f.op === 'ping').length >= 3, 'keep-alives were refused: ' + W.over.length);
    assert.deepEqual([W.socks.length, db.online], [1, true], 'one connection, still online');
  } finally { db.close(); }
});

test('if the server refuses a frame for its allowance all the same, the queue stops until the allowance is back: a few frames are refused, not the rest of the start', async () => {
  const W = world({ fpm: 300, told: 600 }), db = page(W);   // a server that allows half of what it says; its refusal says retry 200, as the real one's
  try {
    await db.ready; start(db, 150, range(75, 150)); await tick(300);
    const n = W.sent.length; await tick(2500);
    assert.ok(W.over.length > 0 && W.over.length <= 125, 'what was on its way when the first refusal was heard, not more: ' + refused(W));   // the page believed 600: its first burst is 419 frames and what its count grew by meanwhile (10 a second), and the server took 299 of them
    assert.ok(W.over.every((f) => f.at - W.over[0].at < 100), 'all of them in the moment before the first refusal was heard');
    assert.ok(W.sent.length - n <= 2, 'and then the queue is still: ' + (W.sent.length - n) + ' frames in the two and a half seconds after');
  } finally { db.close(); }
});

// ---- the points of the reviews of release 101 ----

test('a chat the user tapped while its record was still queued is let through at once: the page says so (hurry), and what waited for that chat goes ahead of the queue', async () => {
  const W = world({ fpm: 60 }), db = page(W);
  try {
    await db.ready; start(db, 60, [], { counts: false }); await tick(300);
    assert.equal(typeof db.hurry, 'function', 'the page can hurry a chat');
    assert.ok(!gets(W).includes('get c059'), 'the last chat begun is still waiting');
    db.hurry('c059'); await tick(100);
    for (const name of ['get c059', 'open c059', 'watch c059']) assert.ok(at(W, name) >= 0, name + ' went at once');
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); }
});

test('the chat the user is waiting for (the page\'s `first`: the row tapped, or a pushed call\'s chat) never queues: on a start begun before the connection, and again after a reconnect, when the adapter has forgotten what was hurried', async () => {
  let want = 'c059'; const W = world({ fpm: 60 }), db = page(W, { first: (cid) => cid === want });
  try {
    start(db, 60, [], { counts: false }); await db.ready; await tick(150);
    for (const name of ['get c059', 'open c059', 'watch c059']) assert.ok(at(W, name) >= 0, name + ' went at once, though it was begun last');
    assert.ok(!gets(W).includes('get c058'), 'its neighbour waits its turn');
    await tick(600); await back(W, db, 0); await tick(150);
    const again = W.sent.filter((f) => f.sock === 1).map(what);
    assert.ok(again.includes('watch c059'), 'on the new connection it is watched at once: ' + again.slice(0, 8).join(', '));
    want = null; const n = W.sent.length; db.doc('channels/c100').onSnapshot(() => {}, () => {}); await tick(60);
    assert.ok(!W.sent.slice(n).some((f) => what(f) === 'get c100'), 'a chat nobody is waiting for queues as before');
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); }
});

test('the device\'s clock is set back or forward: the queue goes on at its pace (its count runs on a clock that never steps)', async () => {
  for (const step of [-60000, 60000]) {
    const W = world({ fpm: 60 }), db = page(W), real = Date.now;
    try {
      await db.ready; start(db, 60, [], { counts: false }); await tick(400);
      Date.now = () => real() + step;   // a time sync, a change of zone by hand
      const n = W.sent.length; await tick(3200);
      Date.now = real;
      assert.ok(W.sent.length >= n + 2 && W.sent.length <= n + 5, step + ' ms: a frame a second, no standstill and no burst: ' + n + ' then ' + W.sent.length);
      assert.equal(W.over.length, 0, step + ' ms: ' + refused(W));
    } finally { Date.now = real; db.close(); }
  }
});

test('a clock that stands still (a sleeping phone) only makes the page send less, and one that jumps back does not stall it', async () => {
  const real = performance.now; let shift = 1e6, frozen = null;   // a clock that has run a quarter of an hour (the browser's never goes under zero)
  performance.now = () => frozen == null ? real.call(performance) + shift : frozen;
  const W = world({ fpm: 60 }), db = page(W);
  try {
    await db.ready; start(db, 60, [], { counts: false }); await tick(300);
    frozen = performance.now(); const n = W.sent.length; await tick(1500);
    assert.equal(W.sent.length, n, 'while it stands still nothing more of the queue is sent');
    frozen = null; shift -= 60000;   // and it comes back a minute behind
    await tick(2400);
    assert.ok(W.sent.length >= n + 1, 'the queue goes on from there: ' + n + ' then ' + W.sent.length);
    assert.equal(W.over.length, 0, refused(W));
  } finally { performance.now = real; db.close(); }
});

test('a drop in the middle of a start loses no watch: every chat\'s watch is sent once on the new connection, against a server that refuses a watch id it already holds', async () => {
  const T = fast(20), W = world({ fpm: 60, now: T.now }), db = pageKept(W);
  try {
    await db.ready; const P = start(db, 20, [], { counts: false }); await tick(150);   // 41 frames went, the other chats' opens and watches wait
    assert.ok(P.live.size < 20, 'the start is not through: ' + P.live.size + ' live');
    await back(W, db, 0);
    for (let k = 0; k < 100 && P.live.size < 20; k++) await tick(50);
    assert.deepEqual(P.ended, [], 'no watch was given up');
    assert.deepEqual([P.trimmed, gets(W, 1)], [[], []], 'and no chat was taken for one this device holds no key for (shown from the copy anyone may read)');
    assert.equal(W.conflicts.length, 0, 'no watch id was sent twice: ' + W.conflicts.map(what).join(', '));
    assert.equal(P.live.size, 20, 'every chat is live');
    assert.equal(W.socks[1].held.size, 20, 'and the server holds one watch a chat');
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); T.off(); }
});

test('a watch that ended while it waited its turn is not sent after its own unsub', async () => {
  const T = fast(20), W = world({ fpm: 60, now: T.now }), db = pageKept(W);
  try {
    await db.ready; const P = start(db, 20, [], { counts: false });
    for (let j = 0; j < 400 && P.live.size < 20; j++) await tick(10);   // 60 frames: the allowance is down to the reserve as the last goes
    const uns = range(0, 20).map((k) => callWatch(db, cidOf(k)));
    await tick(30);
    const waiting = range(0, 20).filter((k) => at(W, 'sub ' + cidOf(k) + '/call') < 0);
    assert.ok(waiting.length >= 10, 'most call watches wait: ' + waiting.length);
    const k = waiting[waiting.length - 1]; uns[k]();   // the page drops one (its chat left the first 90)
    for (let j = 0; j < 100 && W.sent.filter((f) => /\/call$/.test(f.p || '')).length < 19; j++) await tick(50);
    await tick(100);
    assert.equal(at(W, 'sub ' + cidOf(k) + '/call'), -1, 'its watch was never sent');
    assert.equal(W.sent.filter((f) => f.op === 'unsub').length, 1, 'only its unsub');
    assert.equal(W.socks[0].held.size, 39, 'the server holds the twenty records and nineteen call watches, no orphan');
  } finally { db.close(); T.off(); }
});

test('only an unread count waits: a query of a chat\'s messages with an order (loading earlier messages, Delete for everyone\'s sweep) goes at once', async () => {
  const W = world({ fpm: 60 }), db = pageKept(W);
  try {
    await db.ready; start(db, 12, [], { counts: false }); await tick(300);   // 36 frames: 5 above the reserve
    for (const k of range(0, 12)) count(db, cidOf(k)).catch(() => {});   // 12 counts: the last ones wait
    await tick(100);
    assert.ok(W.sent.filter((f) => f.op === 'query').length < 12, 'counts are waiting');
    const posts = db.collection('channels/c011/posts'), t0 = Date.now();
    await posts.where('ts', '<', 5).orderBy('ts', 'desc').limit(200).get();   // loadOlder's, and wipeChat's
    await posts.orderBy('ts', 'desc').limit(200).get();
    assert.ok(Date.now() - t0 < 150, 'both answered after ' + (Date.now() - t0) + ' ms');
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); }
});

test('a file sent to a chat that is not on screen (a forward) does not wait its turn: asking for its media ticket hurries the chat', async () => {
  const W = world({ fpm: 60 }), db = page(W, { fetch: async () => ({ ok: true, json: async () => ({ created: true }) }) });
  try {
    await db.ready; start(db, 60, [], { counts: false }); await tick(300);
    assert.ok(!gets(W).includes('get c058'), 'its record read was still waiting');
    let sent = 0; const t0 = Date.now(); db.putPiece('c058', 'm1', 0, new Uint8Array(1)).then(() => { sent = Date.now() - t0; }, () => {});
    await tick(400);
    assert.ok(sent > 0 && sent < 150, 'the piece was sent after ' + sent + ' ms');
    assert.ok(at(W, 'media.ticket') > at(W, 'open c058') && at(W, 'open c058') > 0);
    assert.equal(W.over.length, 0, refused(W));
  } finally { db.close(); }
});

test('the next account begins its own order: the places the account before had in the queue are forgotten with it', async () => {
  const W = world({ fpm: 60 }), db = page(W);
  try {
    await db.ready; await db.prove(who('alice')); start(db, 10, [], { counts: false }); await tick(150);
    await db.prove(who('bob'));
    for (const k of range(0, 10).reverse()) db.doc('channels/' + cidOf(k)).onSnapshot(() => {}, () => {});   // Bob begins the same chats the other way round
    await tick(200);
    assert.deepEqual(gets(W, 1), range(0, 10).reverse().map((k) => 'get ' + cidOf(k)), 'in the order Bob began them');
  } finally { db.close(); }
});

test('a closed adapter tries no watch again: a watch that was waiting to be tried when the page closed it asks for no key after', async () => {
  const realT = globalThis.setTimeout; let asked = 0;
  const W = world({ fpm: 60, on: (f) => f.op === 'get' ? { ok: false, e: 'internal', m: 'no' } : undefined });   // the copy anyone may read cannot be had just now
  const db = page(W, { offlineWaitMs: 50, caps: async () => { asked++; return null; } });   // and this device holds no key for the chat
  try {
    await db.ready;
    globalThis.setTimeout = (fn, ms, ...a) => realT(fn, ms >= 5000 ? 60 : ms, ...a);   // the adapter tries again 5 s later: 60 ms here
    db.doc('channels/c000').onSnapshot(() => {}, () => {});
    await tick(30); assert.equal(asked, 1);
    await tick(80); assert.ok(asked >= 2, 'while open it tries again: ' + asked);
    const n = asked; db.close(); await tick(250);
    assert.equal(asked, n, 'closed: ' + n + ' then ' + asked);
  } finally { globalThis.setTimeout = realT; db.close(); }
});

// ---- two roads a record read takes to the queue, found by the deliberate breaks (no test above failed without them) ----

test('a start of chats this device holds no key for is paced the same: the read of each record, shown from the copy anyone signed in may read, waits its turn, and none is refused', async () => {
  const W = world({ fpm: 60 }), db = page(W, { caps: async () => null });
  try {
    await db.ready; const P = start(db, 100, [], { counts: false });
    await tick(1500);
    assert.equal(W.over.length, 0, refused(W));
    assert.ok(W.sent.length >= 40 && W.sent.length <= 46, 'the hello, what goes at once, and what a second and a half gives back: ' + W.sent.length + ' frames');
    assert.deepEqual([gets(W)[0], P.trimmed.length >= 38, P.ended.length, P.live.size], ['get c000', true, 0, 0], 'from the top, each shown as it comes: ' + P.trimmed.length);
  } finally { db.close(); }
});

test('a start begun while a sign-in is on its way is paced the same: the reads that waited for the sign-in wait their turn when it is done', async () => {
  let proving = null;
  const W = world({ fpm: 60, on: (f, sock) => { if (f.op === 'prove' && proving == null) { proving = f.i; sock.bucket.take(1, Date.now()); return 'drop'; } } });   // the answer to the sign-in comes late
  const db = page(W);
  try {
    await db.ready; const signedIn = db.prove(who('alice'));
    for (let k = 0; k < 100 && proving == null; k++) await tick(5);
    assert.notEqual(proving, null, 'the sign-in is on its way');
    start(db, 100, [], { counts: false }); await tick(60);
    assert.deepEqual(gets(W), [], 'nothing of the start goes before the sign-in is answered');
    W.push(0, { i: proving, ok: true }); await signedIn; await tick(1500);
    assert.equal(W.over.length, 0, refused(W));
    assert.ok(W.sent.length >= 40 && W.sent.length <= 47, 'the hello, the sign-in, what goes at once, and what a second and a half gives back: ' + W.sent.length + ' frames');
    assert.equal(gets(W)[0], 'get c000');
  } finally { db.close(); }
});

test('a drop while chats\' opens still wait their turn: what waited is told there is no connection, and no chat is taken for one this device holds no key for; each is watched once on the new connection', async () => {
  const T = fast(20), W = world({ fpm: 60, now: T.now }), db = pageKept(W);
  try {
    await db.ready; const P = start(db, 60, [], { counts: false }); await tick(150);   // the 41 frames that went at once are record reads; no chat is open yet
    assert.ok(!W.sent.some((f) => f.op === 'sub'), 'no watch has gone yet');
    await back(W, db, 0);
    for (let k = 0; k < 200 && P.live.size < 60; k++) await tick(50);
    assert.deepEqual([P.trimmed, gets(W, 1)], [[], []], 'no chat was shown from the copy anyone may read, and no record was read for that');
    assert.deepEqual([P.ended, W.conflicts.length, P.live.size, W.socks[1].held.size, W.over.length], [[], 0, 60, 60, 0], 'none given up, no watch id twice, every chat live, one watch a chat, nothing refused');
  } finally { db.close(); T.off(); }
});
