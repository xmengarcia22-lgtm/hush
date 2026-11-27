// When the server takes a chat's level away (release 111, the fix after the reviews: code review 4, security review B4).
// A key change, an admin change or a removal ends the connection's level for the chat and its watches of it, and the server says
// { t: 'evict', cid }. The page opens the chat again and sends the watches again. What went wrong: a re-open that failed for a
// reason that says nothing about membership (too busy, not answered, no connection) ended every watch of the chat with `denied`
// "You are no longer in this chat", which the page takes as removal: it forgets a group or channel and deletes its mailbox
// note, on every device. And a watch that still waited in the queue when the eviction came was refused `denied` by the server,
// which started a second re-open (both then sent the watch, and the second was refused `conflict` and ended), or, the second
// time in a page session, ended the watch `denied`. This release made that wait long: up to 40 s after a reconnect on a long list.
// The adapter runs as written, against a stand-in server that keeps levels as the real one does (adapter-evict-kit.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tick, cidOf, what, who } from './adapter-pace-kit.js';
import { server, until, chatOfSub, GONE } from './adapter-evict-kit.js';

const V = 'c003', SLOW = (retry) => ({ ok: false, e: 'ratelimit', m: 'slow down', retry });

// ---- a re-open that fails for a reason that says nothing about membership ends no watch ----

for (const retry of [200, 2000]) test('an eviction whose re-open the server refuses "slow down" (ask again in ' + retry + ' ms) ends no watch and tells the page nothing; after the backoff the chat is opened again and its watches are live', async () => {
  let refuse = 0;
  const S = server({ open: (f) => f.cid === V && refuse-- > 0 ? SLOW(retry) : undefined });
  try {
    await S.whole(20, { 3: { call: true } });
    refuse = 1; assert.ok(S.evict(V), 'the server evicts'); await tick(500);
    assert.deepEqual(S.ended, [], 'no watch of the chat is ended');
    assert.ok(await until(() => S.heldOf(V) === 'call,record', retry < 1000 ? 16000 : 9000), 'the chat is opened again and both its watches are held (a refusal with a wait under a second empties the page\'s count, and the re-open waits in the queue for the reserve, 12 s): ' + (S.heldOf(V) || 'none') + '; sent: ' + S.sentOf(V).slice(-6).join(', '));
    assert.deepEqual([S.ended, S.W.conflicts.length], [[], 0], 'nothing ended, no watch id sent twice');
  } finally { S.end(); }
});

test('the same when the re-open is not answered in time: no watch is ended, and the chat is opened again after the backoff', async () => {
  let mute = 0;
  const S = server({ open: (f) => f.cid === V && mute-- > 0 ? 'drop' : undefined, extra: { callTimeoutMs: 400 } });
  try {
    await S.whole(20, { 3: { call: true } });
    mute = 1; assert.ok(S.evict(V)); await tick(700);
    assert.deepEqual(S.ended, [], 'no watch of the chat is ended when the open\'s time is up');
    assert.ok(await until(() => S.heldOf(V) === 'call,record', 9000), 'both watches are held again: ' + (S.heldOf(V) || 'none'));
    assert.deepEqual([S.ended, S.W.conflicts.length], [[], 0]);
  } finally { S.end(); }
});

test('the connection lost while the re-open still waits in the queue: no watch is ended, and the next connection opens the chat and watches it again', async () => {
  let slow = 0;
  const S = server({ any: (f) => f.op === 'mget' && slow-- > 0 ? SLOW(20000) : undefined });
  try {
    await S.whole(20, { 3: { call: true } });
    slow = 1; await S.db.doc('directory/u1').get().catch(() => {});   // a refusal that makes the queue stand still for 20 s
    const n = S.W.sent.length; assert.ok(S.evict(V)); await tick(300);
    assert.equal(S.W.sent.slice(n).filter((f) => f.op === 'chat.open').length, 0, 'the re-open waits in the queue');
    await S.next(); await tick(100);
    assert.deepEqual(S.ended, [], 'no watch is ended when the connection goes');
    assert.ok(await until(() => S.heldOf(V) === 'call,record' && S.W.socks[1].held.size === 21, 6000), 'on the next connection every watch is back, the evicted chat\'s too: ' + (S.heldOf(V) || 'none'));
    assert.deepEqual(S.ended, []);
  } finally { S.end(); }
});

test('the connection lost while the re-open is on its way: the same', async () => {
  let mute = 0;
  const S = server({ open: (f) => f.cid === V && mute-- > 0 ? 'drop' : undefined });
  try {
    await S.whole(20, { 3: { call: true } });
    mute = 1; assert.ok(S.evict(V)); await tick(80);
    assert.deepEqual(S.sentOf(V).slice(-1), ['open ' + V], 'the re-open is on its way');
    await S.next(); await tick(100);
    assert.deepEqual(S.ended, [], 'no watch is ended when the connection goes');
    assert.ok(await until(() => S.heldOf(V) === 'call,record' && S.W.socks[1].held.size === 21, 6000), 'on the next connection every watch is back: ' + (S.heldOf(V) || 'none'));
  } finally { S.end(); }
});

test('a re-open the server refuses for every key is a removal, as before: every watch of the chat ends with denied "You are no longer in this chat", and no other chat is touched', async () => {
  let out = false;
  const S = server({ open: (f) => f.cid === V && out ? { ok: false, e: 'denied', m: 'that key does not open this chat' } : undefined });
  try {
    await S.whole(20, { 3: { call: true, posts: true } });
    out = true; assert.ok(S.evict(V));
    assert.ok(await until(() => S.ended.length === 3, 4000), 'the three watches end: ' + S.ended.join('; '));
    assert.deepEqual([...S.ended].sort(), ['call', 'posts', 'record'].map((kind) => V + ' ' + kind + ' denied "' + GONE + '"'));
    assert.equal(S.W.socks[0].held.size, 19, 'the other chats are watched as they were');
  } finally { S.end(); }
});

test('the chat on screen, as before: evicted and opened again, its record, its posts and its call watch are live again at once', async () => {
  const S = server();
  try {
    await S.whole(20, { 3: { call: true, posts: true } });
    assert.ok(S.evict(V));
    assert.ok(await until(() => S.heldOf(V) === 'call,posts,record', 3000), 'all three are held again: ' + (S.heldOf(V) || 'none'));
    assert.deepEqual([S.ended, S.W.conflicts.length], [[], 0]);
  } finally { S.end(); }
});

test('a chat the page has no key for after the eviction (deleted, or this device left out of the new key) is a removal too, as before: its watches end with denied "You are no longer in this chat", and no chat.open is sent for it', async () => {
  let gone = false;
  const S = server({ extra: { caps: async (cid) => cid === V && gone ? null : 'cap-' + cid } });
  try {
    await S.whole(20, { 3: { call: true } });
    const n = S.W.sent.length; gone = true; assert.ok(S.evict(V));
    assert.ok(await until(() => S.ended.length === 2, 4000), 'both watches end: ' + S.ended.join('; '));
    assert.deepEqual([...S.ended].sort(), ['call', 'record'].map((kind) => V + ' ' + kind + ' denied "' + GONE + '"'));
    assert.equal(S.W.sent.slice(n).filter((f) => f.op === 'chat.open').length, 0, 'no key, so nothing to open it with');
  } finally { S.end(); }
});

test('a watch the server refuses for a reason of its own (a call watch on a group: "calls are for one-on-one chats") ends by itself with the server\'s words after one try at opening the chat again, and takes no other watch of the chat with it', async () => {
  const S = server({ any: (f) => f.op === 'sub' && /\/call$/.test(f.p) && chatOfSub(f) === V ? { ok: false, e: 'denied', m: 'calls are for one-on-one chats' } : undefined });
  try {
    await S.whole(20, { 3: { posts: true } });
    S.db.collection('channels/' + V + '/call').orderBy('ts', 'desc').limit(50).onSnapshot(() => {}, (e) => S.ended.push(V + ' call ' + e.code + ' "' + e.message + '"'));
    assert.ok(await until(() => S.ended.length >= 1, 4000), 'the call watch ends');
    await tick(400);
    assert.deepEqual([S.ended, S.heldOf(V)], [[V + ' call denied "calls are for one-on-one chats"'], 'posts,record'], 'only it ends: the chat\'s record and posts are watched as they were');
    assert.equal(S.sentOf(V).filter((x) => x === 'open ' + V).length, 2, 'the chat was opened again once');
  } finally { S.end(); }
});

// ---- a watch that still waits in the queue when the eviction comes ----
// A whole page of 300 chats whose connection is lost: on the next one every chat's open goes at once or soon, and the record
// watch of the chat at row 150 waits about 30 s of allowance for its turn. In that wait its level is taken away.

const ROW = 150, C = cidOf(ROW);
// evicts chat C on connection n, `after` ms after the server gave its `nth` open there
const evictAt = (S, n, nth = 1, after = 50) => { let seen = 0, done = false; const before = S.onOpen;
  S.onOpen = (rec, s) => { if (before) before(rec, s); if (rec.cid === C && s.n === n && ++seen === nth) setTimeout(() => { done = S.evict(C, n); }, after); };
  return () => done; };

for (const call of [false, true]) test('a watch that meets an eviction while it waits its turn is sent again once the chat is open again, on two connections running (a ' + (call ? 'chat with a call watch' : 'group') + ' at row 150 of 300): nothing is ended, no watch id is sent twice, and the server holds the watches at the end', async () => {
  const S = server({ k: 10, rtt: 30, wide: [0] });
  try {
    await S.whole(300, { [ROW]: { call } });
    const want = call ? 'call,record' : 'record';
    for (const n of [1, 2]) {
      const hit = evictAt(S, n); await S.next();
      assert.ok(await until(hit, 6000), 'connection ' + n + ': the chat is evicted 50 ms after its open is answered');
      assert.ok(await until(() => S.heldOf(C, n) === want, 9000), 'connection ' + n + ': the server holds the chat\'s watches again: ' + (S.heldOf(C, n) || 'none') + '; ended: ' + S.ended.join('; '));
      await tick(1500);   // a second frame of the same watch would have gone by now, also one that a second run of the eviction sends after its wait (0.5 to 1 s on the first of the two connections)
      assert.deepEqual([S.ended, S.W.conflicts.map(what), S.heldOf(C, n)], [[], [], want], 'connection ' + n + ': nothing ended, no watch id sent twice, the watches held');
    }
  } finally { S.end(); }
});

test('two evictions inside one wait (the watch sent again waits its turn again and meets the second): the watch survives both', async () => {
  const S = server({ k: 10, rtt: 30, wide: [0] });
  try {
    await S.whole(300);
    const first = evictAt(S, 1, 1), second = evictAt(S, 1, 2); await S.next();
    assert.ok(await until(() => first() && second(), 8000), 'the chat is evicted twice, each time 50 ms after an open of it is answered');
    assert.ok(await until(() => S.heldOf(C, 1) === 'record', 9000), 'the server holds the watch in the end: ' + (S.heldOf(C, 1) || 'none') + '; ended: ' + S.ended.join('; '));
    assert.deepEqual([S.ended, S.W.conflicts.map(what)], [[], []], 'nothing ended, no watch id sent twice');
  } finally { S.end(); }
});

test('with a slow round trip (120 ms) and the page\'s own read of the record at an eviction: one eviction in the wait ends nothing and no watch id is sent twice', async () => {
  const S = server({ k: 10, rtt: 120, wide: [0] });
  try {
    await S.whole(300);
    const hit = evictAt(S, 1); await S.next();
    assert.ok(await until(hit, 6000), 'the chat is evicted');
    assert.ok(await until(() => S.heldOf(C, 1) === 'record', 9000), 'the server holds the watch again: ' + (S.heldOf(C, 1) || 'none') + '; ended: ' + S.ended.join('; '));
    await tick(600);
    assert.deepEqual([S.ended, S.W.conflicts.map(what), S.heldOf(C, 1)], [[], [], 'record'], 'nothing ended, no watch id sent twice, one live watch');
  } finally { S.end(); }
});

test('when the re-open passes the watch that waits (the chat is the one the user is waiting for by then): the server takes the watch sent after the re-open and refuses the one that waited as held already, and the watch is live, not ended', async () => {
  let wanted = null;
  const S = server({ k: 10, rtt: 30, wide: [0], extra: { first: (cid) => cid === wanted } });
  try {
    await S.whole(300);
    let armed = false, done = false;   // the eviction 50 ms after the chat's open is answered, when its watch waits its turn; from then the page says the user waits for this chat, so what is made for it now does not wait
    // As the chat's open goes the person sends fifteen frames of their own (queries that do not wait): the queue is then under its
    // reserve for about 3 s of allowance, and the chat's watch waits that long. Before the queue-order fix row 150's watch waited
    // behind the rows above it for seconds anyway; since it, those rows are through by the time row 150 is opened, and its watch
    // would go at the queue's next turn, as often before the re-open as after it.
    S.onOpen = (rec, s) => { if (rec.cid === C && s.n === 1 && !armed) { armed = true; setTimeout(() => { for (let i = 0; i < 15; i++) S.db.collection('directory').where('h', '==', 'x' + i).get().catch(() => {}); }, 0); setTimeout(() => { wanted = C; done = S.evict(C, 1); }, 50); } };
    await S.next();
    assert.ok(await until(() => done, 6000), 'the chat is evicted');
    assert.ok(await until(() => S.heldOf(C, 1) === 'record', 4000), 'the server holds the watch sent after the re-open: ' + (S.heldOf(C, 1) || 'none'));
    assert.ok(await until(() => S.W.sent.filter((f) => f.sock === 1 && f.op === 'sub' && chatOfSub(f) === C).length >= 2, 9000), 'the watch that waited is sent in its turn');
    await tick(300);
    assert.equal(S.W.conflicts.length, 1, 'the server refused the one that waited: it holds that id');
    assert.deepEqual([S.ended, S.heldOf(C, 1)], [[], 'record'], 'the watch is not ended: the server holds it');
  } finally { S.end(); }
});

test('a level that went with nothing said (a change the page has not heard of), on two connections running: each time the refused watch opens the chat again once and is live; the one try is given back when the watch is answered', async () => {
  const S = server({ k: 10, rtt: 30, wide: [0] });
  try {
    await S.whole(300);
    for (const n of [1, 2]) {
      let gone = false; S.onOpen = (rec, s) => { if (rec.cid === C && s.n === n && !gone) { gone = true; setTimeout(() => S.forget(C, n), 50); } };
      await S.next();
      assert.ok(await until(() => S.heldOf(C, n) === 'record', 9000), 'connection ' + n + ': the watch is held: ' + (S.heldOf(C, n) || 'none') + '; ended: ' + S.ended.join('; '));
      await tick(900);
      assert.deepEqual([S.ended, S.W.conflicts.map(what), S.heldOf(C, n)], [[], [], 'record'], 'connection ' + n + ': nothing ended, no watch id sent twice, the watch held');
      assert.equal(S.sentOf(C, n).filter((x) => x === 'open ' + C).length, 2, 'connection ' + n + ': the chat was opened again once');
    }
  } finally { S.end(); }
});

// ---- a member who really was removed, when the first re-open failed for a passing reason (review fix 7) ----
// After fix 5 a re-open the server was too busy for kept the watches and sent each again later. When that later open said the
// person was out, the watch was put aside as for a chat with no key yet, and a watch that had answered once tells the page
// nothing then: the chat stayed in the list, dead, until the page was loaded again. Now the eviction is run again as a whole
// after the wait, so the open that says so ends the watches as the first would have.

const OUT = { ok: false, e: 'denied', m: 'you were removed from this chat' };
// blocked from a group and evicted; the first `busy` re-opens are refused "slow down", every open after that is refused for good
const removed = (busy) => { let refuse = 0, out = false;
  const S = server({ open: (f) => f.cid !== V ? undefined : refuse-- > 0 ? SLOW(1000) : out ? OUT : undefined });
  S.remove = () => { out = true; refuse = busy; return S.evict(V); };
  return S; };
const BOTH = ['call', 'record'].map((kind) => V + ' ' + kind + ' denied "' + GONE + '"');

test('a member who was removed, when the first re-open was refused "slow down": the watches end with denied "You are no longer in this chat" at the next open, within 2.5 s', async (t) => {
  const S = removed(1);
  try {
    await S.whole(20, { 3: { call: true } });
    const n = S.W.sent.length, t0 = Date.now(); assert.ok(S.remove());
    const ok = await until(() => S.ended.length === 2, 2500);
    t.diagnostic('ended ' + (ok ? Date.now() - t0 + ' ms after the removal' : 'not at all in 2.5 s') + '; sent for the chat: ' + S.about(V, n).map(what).join(', '));
    assert.ok(ok, 'both watches end: ' + (S.ended.join('; ') || 'none ended') + '; sent: ' + S.about(V, n).map(what).join(', '));
    assert.deepEqual([...S.ended].sort(), BOTH);
    await tick(1500);
    const opens = S.about(V, n).filter((f) => f.op === 'chat.open').length;
    t.diagnostic(opens + ' opens in all');
    assert.ok(opens <= 3, 'nothing is tried again and again after the end: ' + opens + ' opens in all');
  } finally { S.end(); }
});

test('the same when the connection is lost after that first re-open: the watches end with denied on the next connection, within 2.5 s of it', async (t) => {
  const S = removed(1);
  try {
    await S.whole(20, { 3: { call: true } });
    const n = S.W.sent.length; assert.ok(S.remove());
    assert.ok(await until(() => S.about(V, n).some((f) => f.op === 'chat.open'), 1000), 'the first re-open is sent, and refused "slow down"'); await tick(40);
    await S.next(); const t0 = Date.now();
    const ok = await until(() => S.ended.length === 2, 2500);
    t.diagnostic('ended ' + (ok ? Date.now() - t0 + ' ms after the next connection' : 'not at all in 2.5 s') + '; sent for the chat there: ' + S.about(V, n, 1).map(what).join(', '));
    assert.ok(ok, 'both watches end on the next connection: ' + (S.ended.join('; ') || 'none ended'));
    assert.deepEqual([...S.ended].sort(), BOTH);
    assert.equal(S.W.socks[1].held.size, 19, 'the other chats are watched there as they were');
  } finally { S.end(); }
});

test('a re-open the server is too busy for three times running, for a member who is still in: nothing is ended, each try waits half a second or more, and the chat is live again once the server answers', async (t) => {
  let refuse = 0;
  const S = server({ open: (f) => f.cid === V && refuse-- > 0 ? SLOW(1000) : undefined });
  try {
    await S.whole(20, { 3: { call: true } });
    const n = S.W.sent.length; refuse = 3; assert.ok(S.evict(V));
    assert.ok(await until(() => S.heldOf(V) === 'call,record', 14000), 'live again: ' + (S.heldOf(V) || 'none') + '; ended: ' + S.ended.join('; '));
    const opens = S.about(V, n).filter((f) => f.op === 'chat.open').map((f) => f.at), gaps = opens.slice(1).map((x, j) => x - opens[j]);
    t.diagnostic('the opens came ' + gaps.join(', ') + ' ms apart');
    assert.deepEqual([S.ended, opens.length >= 4 && opens.length <= 6], [[], true], 'nothing ended; an open for each refusal and the one that was answered (' + opens.length + ')');
    assert.ok(gaps.every((x) => x >= 450), 'no two tries less than half a second apart: ' + gaps.join(', '));
  } finally { S.end(); }
});

test('a re-open answered "notfound" (the chat was deleted between the page\'s read and the open) is a removal too: the watches end with denied, within 2.5 s, and the chat is not opened again and again', async () => {
  let gone = false;
  const S = server({ open: (f) => f.cid === V && gone ? { ok: false, e: 'notfound', m: 'no such chat' } : undefined });
  try {
    await S.whole(20, { 3: { call: true } });
    const n = S.W.sent.length; gone = true; assert.ok(S.evict(V));
    assert.ok(await until(() => S.ended.length === 2, 2500), 'both watches end: ' + (S.ended.join('; ') || 'none ended'));
    assert.deepEqual([...S.ended].sort(), BOTH);
    await tick(2500);
    assert.ok(S.about(V, n).filter((f) => f.op === 'chat.open').length <= 3, 'no run of opens after the first: ' + S.about(V, n).map(what).join(', '));
  } finally { S.end(); }
});

test('a watch that no eviction touched, of a chat this device has no key for yet, is put aside as before and not ended: it shows the copy anyone signed in may read, and goes live when the key comes', async () => {
  let key = false; const seen = [];
  const S = server({ extra: { caps: async (cid) => cid === V && !key ? null : 'cap-' + cid } });
  try {
    await S.db.ready;
    S.db.doc('channels/' + V).onSnapshot((s) => seen.push(s.exists ? (s.data().full ? 'whole' : 'trimmed') : 'none'), (e) => S.ended.push(V + ' record ' + e.code));
    assert.ok(await until(() => seen.length === 1, 2000), 'a first snapshot comes');
    await tick(300);
    assert.deepEqual([seen, S.ended, S.heldOf(V)], [['trimmed'], [], ''], 'the trimmed copy, nothing ended, no watch held yet');
    key = true; await S.db.refreshChat(V);
    assert.ok(await until(() => seen[seen.length - 1] === 'whole', 2000), 'live once the chat can be opened: ' + seen.join(', '));
    assert.deepEqual(S.ended, []);
  } finally { S.end(); }
});

test('after an eviction that ended well (the re-open too busy once, then answered), a later connection on which the chat cannot be opened puts its watches aside as for any chat: they are not ended', async () => {
  let refuse = 0, key = true;
  const S = server({ open: (f) => f.cid === V && refuse-- > 0 ? SLOW(1000) : undefined, extra: { caps: async (cid) => cid === V && !key ? null : 'cap-' + cid } });
  try {
    await S.whole(20, { 3: { call: true } });
    refuse = 1; assert.ok(S.evict(V));
    assert.ok(await until(() => S.heldOf(V) === 'call,record', 5000), 'live again after the one refusal: ' + (S.heldOf(V) || 'none'));
    key = false; await S.next();
    assert.ok(await until(() => S.W.socks[1].held.size === 19, 3000), 'the next connection has the other chats\' watches');
    await tick(2500);
    assert.deepEqual([S.ended, S.heldOf(V)], [[], ''], 'the chat with no key is put aside, not ended');
  } finally { S.end(); }
});

test('the account changed while the re-open was on its way: the eviction is not run again for the account before (no frame for the chat, no read of its record)', async () => {
  let mute = 0;
  const S = server({ open: (f) => f.cid === V && mute-- > 0 ? 'drop' : undefined });
  try {
    await S.db.ready; await S.db.prove(who('alice'));
    await S.whole(20, { 3: { call: true } });
    const n0 = S.W.sent.length; mute = 1; assert.ok(S.evict(V));
    assert.ok(await until(() => S.about(V, n0).some((f) => f.op === 'chat.open'), 1000), 'the re-open is on its way');
    const n = S.W.sent.length, hooks = S.hooks.length;
    await S.db.prove(who('bob'));
    await tick(1500);
    assert.deepEqual([S.about(V, n).map(what), S.hooks.length - hooks, S.ended], [[], 0, []]);
  } finally { S.end(); }
});
