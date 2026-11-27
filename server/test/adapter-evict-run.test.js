// A run of evictions of one chat (release 111, review fix 6: security review N2 of the review fixes).
// Each eviction costs the page four frames: its read of the record, chat.open, the record watch, the call watch (five for the
// chat on screen). The other person of a one-on-one chat can ask for one again and again (chat.rebase has no allowance of its
// own), and as soon as the level is back the next one lands. With the paced queue that chat's frames took every frame the
// queue may send, for as long as the run lasted: a list of 150 chats did not load at all; for a chat on screen the cycle ran
// at 25 frames a second and the user's own writes were refused. So a chat that is evicted a third time within a minute of its
// last re-open waits before the next one, and each time after: 0.5 to 1 s the first time, twice as long each time after, 8 to
// 16 s at most, and the wait comes before the page's own read. The first two evictions of a minute wait for nothing, and a
// quiet minute after the last re-open starts the count again. (Review fix 10. Fix 6 made the second wait already; but one
// admin action is two evictions some 25 ms apart, and a device whose removal began inside that wait did not hold the chat's
// newest key, so the removal passed the chat over as locked: channel-history-admin3.test.js, test 78, is the real-page test
// that failed.) Nor does an eviction wait while the page says a device removal is running (the option evictNow), though the
// count goes on. The adapter's own retry of an open that failed too busy or with no connection always waits, whatever the
// count and whatever the page says.
// The adapter runs as written, against a stand-in server that keeps levels as the real one does (adapter-evict-kit.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tick, range, cidOf, what, who } from './adapter-pace-kit.js';
import { server, until } from './adapter-evict-kit.js';

const V = 'c003';
const again = async (S, ms = 300) => { const t0 = Date.now(); const ok = await until(() => S.heldOf(V) === 'call,record', ms); return ok ? Date.now() - t0 : -1; };
// The adapter's waits before a re-open (random, so never a whole number of ms; 250 ms or more) run `k` times as fast here and
// are noted as they were asked for; every other timer is real.
function quick(k = 50) {
  const real = globalThis.setTimeout, asked = [];
  globalThis.setTimeout = (fn, ms, ...a) => Number.isFinite(ms) && !Number.isInteger(ms) && ms >= 250 ? (asked.push(ms), real(fn, ms / k, ...a)) : real(fn, ms, ...a);
  return { asked, k, off() { globalThis.setTimeout = real; } };
}

// ---- when it waits, and how long ----

test('one eviction alone waits for nothing, as before: the chat is opened again and its watches are held within 300 ms', async (t) => {
  const S = server();
  try {
    await S.whole(20, { 3: { call: true } });
    assert.ok(S.evict(V)); const ms = await again(S);
    t.diagnostic('live again ' + ms + ' ms after the eviction');
    assert.ok(ms >= 0, 'both watches are held again within 300 ms: ' + (S.heldOf(V) || 'none'));
    assert.deepEqual([S.ended, S.hooks.length], [[], 1], 'nothing ended; the page was told once');
  } finally { S.end(); }
});

// the first two evictions of a minute: each lands and is answered at once
const pair = async (S) => { for (const j of [1, 2]) { assert.ok(S.evict(V), 'eviction ' + j + ' lands'); assert.ok(await again(S) >= 0, 'and eviction ' + j + ' is answered at once: ' + (S.heldOf(V) || 'none')); } };

test('the first two evictions of a minute wait for nothing, as on the live page (one admin action is two evictions some tens of ms apart): after the second, as after the first, the page is asked at once to read the record and the chat is opened again and its watches held within 300 ms', async (t) => {
  const S = server(), Q = quick(1);
  try {
    await S.whole(20, { 3: { call: true } });
    const t1 = Date.now(); assert.ok(S.evict(V), 'the first lands'); assert.ok(await again(S) >= 0, 'and is answered at once');
    const n = S.W.sent.length, t2 = Date.now(); assert.ok(S.evict(V), 'the second lands as soon as the level is back');
    const ms = await again(S), first = S.about(V, n)[0];
    t.diagnostic('the second eviction ' + (t2 - t1) + ' ms after the first; the page asked to read the record ' + (S.hooks.length === 2 ? S.hooks[1][1] - t2 : '?') + ' ms after it; live again after ' + ms + ' ms: ' + S.about(V, n).map(what).join(', '));
    assert.ok(ms >= 0, 'live again within 300 ms of the second eviction: ' + (S.heldOf(V) || 'none'));
    assert.equal(S.hooks.length, 2, 'the page was asked to read the record for both');
    assert.ok(S.hooks[1][1] - t2 <= 150, 'and for the second at once: ' + (S.hooks[1][1] - t2) + ' ms after it');
    assert.equal(what(first), 'get ' + V, 'the page\'s read of the record is the first frame for the chat');
    assert.deepEqual([Q.asked.length, S.ended, S.W.conflicts.length], [0, [], 0], 'no wait was asked for, nothing ended, no watch sent twice');
  } finally { Q.off(); S.end(); }
});

test('a chat evicted a third time within a minute of its last re-open waits before the next one, 0.5 to 1 s the first time: nothing is sent for it in that time, not the page\'s own record read either; then it is opened again and live', async (t) => {
  const S = server();
  try {
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    const n = S.W.sent.length, t0 = Date.now(); assert.ok(S.evict(V), 'evicted a third time');
    await tick(430);
    assert.deepEqual([S.about(V, n).map(what), S.hooks.length], [[], 2], 'for the first 430 ms nothing is sent for the chat and the page is not asked to read its record');
    assert.ok(await until(() => S.heldOf(V) === 'call,record', 1500), 'then it is live again: ' + (S.heldOf(V) || 'none'));
    const first = S.about(V, n)[0], ms = first.at - t0;
    t.diagnostic('the first frame for the chat ' + ms + ' ms after the third eviction: ' + S.about(V, n).map(what).join(', '));
    assert.equal(what(first), 'get ' + V, 'the page\'s read of the record comes first, after the wait');
    assert.ok(ms >= 480 && ms <= 1150, 'between 0.5 and 1 s after the eviction: ' + ms + ' ms');
    assert.deepEqual([S.ended, S.W.conflicts.length], [[], 0]);
  } finally { S.end(); }
});

test('a quiet minute after the chat\'s last re-open starts the count again: the next two evictions wait for nothing, and the one after them waits 0.5 to 1 s, not the doubled wait of the run before', async (t) => {
  const S = server({ k: 200 }), Q = quick(1);   // the page's clock 200 times as fast: a minute is 300 ms
  try {
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    assert.ok(S.evict(V), 'a third inside the minute'); assert.ok(await again(S, 1500) >= 0, 'which is answered after its wait');
    assert.equal(Q.asked.length, 1, 'one wait so far, before the third');
    await tick(400);   // 80 s of the page's clock
    for (const j of [4, 5]) { assert.ok(S.evict(V), 'eviction ' + j + ' lands'); const ms = await again(S); t.diagnostic('eviction ' + j + ', after the quiet minute: live again after ' + ms + ' ms'); assert.ok(ms >= 0, 'eviction ' + j + ' is answered at once: ' + (S.heldOf(V) || 'none')); }
    assert.equal(Q.asked.length, 1, 'no wait was asked for before either of them');
    assert.ok(S.evict(V), 'a sixth, the third since the quiet minute'); assert.ok(await again(S, 1500) >= 0, 'which is answered after its wait');
    t.diagnostic('the waits asked for, in ms: ' + Q.asked.map((x) => Math.round(x)).join(', '));
    assert.equal(Q.asked.length, 2, 'it waited');
    assert.ok(Q.asked[1] >= 500 && Q.asked[1] < 1000, 'and 0.5 to 1 s, the first wait of a run, not 1 to 2 s: ' + Math.round(Q.asked[1]));
    assert.deepEqual(S.ended, []);
  } finally { Q.off(); S.end(); }
});

test('the wait doubles with each eviction after the third that follows a re-open within the minute and is never above 16 s; when the run stops the chat is live again within the last wait', async (t) => {
  const S = server(), Q = quick(50);
  try {
    await S.whole(20, { 3: { call: true } });
    let last = 0;
    for (let j = 0; j < 8; j++) { assert.ok(S.evict(V), 'eviction ' + (j + 1) + ' lands'); last = await again(S, 2000); assert.ok(last >= 0, 'and the chat is live again after it: ' + (S.heldOf(V) || 'none')); }
    t.diagnostic('the waits asked for, in ms: ' + Q.asked.map((x) => Math.round(x)).join(', ') + '; live again ' + last * Q.k + ' ms (of the waits\' time) after the last eviction');
    assert.equal(Q.asked.length, 6, 'no wait before the first two, one before each of the six after them');
    for (const [j, top] of [1000, 2000, 4000, 8000, 16000, 16000].entries()) assert.ok(Q.asked[j] >= top / 2 && Q.asked[j] <= top, 'wait ' + (j + 1) + ' is between ' + top / 2 + ' and ' + top + ' ms: ' + Math.round(Q.asked[j]));
    assert.ok(last <= Q.asked[5] / Q.k + 300, 'live again within the last wait (and 300 ms) of the last eviction');
    assert.deepEqual([S.ended, S.W.conflicts.length], [[], 0]);
  } finally { Q.off(); S.end(); }
});

// ---- what may happen during the wait ----

test('the connection lost during the wait: the next connection opens the chat and watches it again, and the eviction that waited then runs on and ends nothing (what it sends again the server refuses as held already)', async (t) => {
  const S = server();
  try {
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    assert.ok(S.evict(V), 'evicted a third time: the wait begins'); await tick(100);
    await S.next();
    assert.ok(await until(() => S.heldOf(V) === 'call,record' && S.W.socks[1].held.size === 21, 400), 'the next connection has every watch back before the wait is over: ' + S.W.socks[1].held.size + ' of 21');
    await tick(1300);
    t.diagnostic('on the next connection, for the chat: ' + S.sentOf(V, 1).join(', ') + '; ' + S.W.conflicts.length + ' refused as held already');
    assert.deepEqual([S.ended, S.heldOf(V), S.W.socks[1].held.size], [[], 'call,record', 21], 'nothing ended, and the server holds every watch');
    assert.ok(S.W.conflicts.length <= 2, 'at most the chat\'s two watches were sent a second time: ' + S.W.conflicts.map(what).join(', '));
  } finally { S.end(); }
});

test('the account changed during the wait: nothing of the account before is sent afterwards, and the page is not asked to read that chat\'s record', async () => {
  const S = server();
  try {
    await S.db.ready; await S.db.prove(who('alice'));
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    assert.ok(S.evict(V), 'evicted a third time: the wait begins'); await tick(100);
    const n = S.W.sent.length, hooks = S.hooks.length;
    await S.db.prove(who('bob'));
    await tick(1300);
    assert.deepEqual([S.about(V, n).map(what), S.hooks.length - hooks], [[], 0], 'no frame for the chat and no read of its record under the next account');
    assert.deepEqual(S.ended, [], 'and the page is told nothing about watches it no longer has');
  } finally { S.end(); }
});

test('the page ends the chat\'s watches during the wait: none of them is sent again', async () => {
  const S = server();
  try {
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    assert.ok(S.evict(V), 'evicted a third time: the wait begins'); await tick(100);
    const n = S.W.sent.length; for (const off of S.offs.get(V)) off();
    await tick(1300);
    assert.deepEqual([S.about(V, n).filter((f) => f.op === 'sub').map(what), S.heldOf(V), S.ended], [[], '', []], 'no watch of the chat is sent or held, and nothing is told');
  } finally { S.end(); }
});

test('an eviction that lands during another\'s wait (the chat was opened again meanwhile by another road, here the page asking for it) takes the wait over: the earlier one does nothing more, so the page reads the record once and the chat is opened again once, after the later one\'s wait', async (t) => {
  const S = server();
  try {
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    assert.ok(S.evict(V), 'evicted a third time: this one waits 0.5 to 1 s');
    await tick(60); await S.db.refreshChat(V);   // the level is back by another road, during that wait
    const n = S.W.sent.length, t0 = Date.now(); assert.ok(S.evict(V), 'and evicted a fourth time, during the third\'s wait: this one waits 1 to 2 s');
    await tick(2100);   // past both waits
    assert.ok(await until(() => S.heldOf(V) === 'call,record', 900), 'the chat is live again: ' + (S.heldOf(V) || 'none'));
    await tick(150);
    const sent = S.about(V, n), names = sent.map(what), ms = sent[0].at - t0;
    t.diagnostic('after the fourth eviction: ' + names.join(', ') + '; the first of them after ' + ms + ' ms; the page was asked ' + (S.hooks.length - 2) + ' time(s) after the first two evictions; ' + S.W.conflicts.length + ' watches refused as held');
    assert.deepEqual([names.filter((x) => x === 'get ' + V).length, names.filter((x) => x.startsWith('open ' + V)).length, S.hooks.length - 2], [1, 1, 1], 'one read of the record and one open after the fourth eviction, not two of each: ' + names.join(', '));
    assert.ok(ms >= 950, 'and not before the fourth eviction\'s own wait, 1 to 2 s: ' + ms + ' ms');
    assert.deepEqual([S.ended, S.heldOf(V), S.W.conflicts.length], [[], 'call,record', 0], 'nothing ended, both watches held, no watch sent twice');
  } finally { S.end(); }
});

test('the page closed during the wait: nothing more happens (the page is not asked to read the record)', async () => {
  const S = server();
  try {
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    assert.ok(S.evict(V), 'evicted a third time: the wait begins'); await tick(100);
    const hooks = S.hooks.length; S.db.close();
    await tick(1300);
    assert.equal(S.hooks.length - hooks, 0);
  } finally { S.end(); }
});

// ---- while the page says a device removal is running (review fix 10: the option evictNow) ----
// A removal puts every key the device can reach into its key store before the account key changes; a chat that waits here is
// one whose newest key the device does not hold yet. So no eviction waits then, as on the live page. The count goes on.

test('while the page says a device removal is running no eviction waits: five in a row are each opened again at once, and the page is asked to read the record each time', async (t) => {
  const S = server({ extra: { evictNow: () => true } }), Q = quick(1);
  try {
    await S.whole(20, { 3: { call: true } });
    const took = [];
    for (let j = 0; j < 5; j++) { assert.ok(S.evict(V), 'eviction ' + (j + 1) + ' lands'); const ms = await again(S); took.push(ms); assert.ok(ms >= 0, 'and the chat is live again within 300 ms: ' + (S.heldOf(V) || 'none')); }
    t.diagnostic('live again after, in ms: ' + took.join(', '));
    assert.deepEqual([Q.asked.length, S.hooks.length, S.ended, S.W.conflicts.length], [0, 5, [], 0], 'no wait was asked for, the page was asked five times, nothing ended, no watch sent twice');
  } finally { Q.off(); S.end(); }
});

test('the count goes on while the removal runs: after two evictions that did not wait because of it (the third and fourth of the minute), the next one, with the removal over, waits 2 to 4 s as the fifth of a run does, not 0.5 to 1 s', async (t) => {
  let removal = false; const S = server({ extra: { evictNow: () => removal } }), Q = quick(50);
  try {
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    removal = true;
    for (const j of [3, 4]) { assert.ok(S.evict(V), 'eviction ' + j + ' lands'); assert.ok(await again(S) >= 0, 'and eviction ' + j + ' is answered at once: ' + (S.heldOf(V) || 'none')); }
    assert.equal(Q.asked.length, 0, 'no wait was asked for so far');
    removal = false;
    assert.ok(S.evict(V), 'the fifth lands, the removal over'); assert.ok(await again(S, 2000) >= 0, 'and is answered after its wait');
    t.diagnostic('the waits asked for, in ms: ' + Q.asked.map((x) => Math.round(x)).join(', '));
    assert.equal(Q.asked.length, 1, 'one wait');
    assert.ok(Q.asked[0] >= 2000 && Q.asked[0] <= 4000, 'the wait of a fifth eviction, 2 to 4 s: ' + Math.round(Q.asked[0]));
    assert.deepEqual([S.ended, S.W.conflicts.length], [[], 0]);
  } finally { Q.off(); S.end(); }
});

for (const [name, fn] of [['answers no', () => false], ['throws', () => { throw new Error('the page failed'); }]]) test('when the page\'s evictNow ' + name + ', the wait is as without it: the first two evictions of a minute are answered at once and the third waits 0.5 to 1 s', async (t) => {
  const S = server({ extra: { evictNow: fn } }), Q = quick(50);
  try {
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    assert.equal(Q.asked.length, 0, 'no wait before the first two');
    assert.ok(S.evict(V), 'a third lands'); assert.ok(await again(S, 2000) >= 0, 'and is answered after its wait: ' + (S.heldOf(V) || 'none'));
    t.diagnostic('the waits asked for, in ms: ' + Q.asked.map((x) => Math.round(x)).join(', '));
    assert.equal(Q.asked.length, 1, 'one wait');
    assert.ok(Q.asked[0] >= 500 && Q.asked[0] < 1000, '0.5 to 1 s: ' + Math.round(Q.asked[0]));
    assert.deepEqual([S.ended, S.hooks.length], [[], 3]);
  } finally { Q.off(); S.end(); }
});

test('an eviction that is waiting when the removal begins: a new one then (the chat opened again meanwhile by another road, the removal\'s own read of it) is answered at once, and the one that waited does nothing more when it wakes: one read of the record, one open, each watch sent once', async (t) => {
  let removal = false; const S = server({ extra: { evictNow: () => removal } });
  try {
    await S.whole(20, { 3: { call: true } });
    await pair(S);
    assert.ok(S.evict(V), 'evicted a third time: this one waits 0.5 to 1 s');
    await tick(60); removal = true; await S.db.refreshChat(V);   // the removal begins, and the level is back by another road, during that wait
    const n = S.W.sent.length, hooks = S.hooks.length; assert.ok(S.evict(V), 'and a new evict frame comes');
    const ms = await again(S);
    assert.ok(ms >= 0, 'this one is answered at once, live again within 300 ms: ' + (S.heldOf(V) || 'none'));
    await tick(1300);   // past the third's wait
    const sent = S.about(V, n), names = sent.map(what);
    t.diagnostic('after the new eviction, live again after ' + ms + ' ms; in all for the chat: ' + names.join(', ') + '; the page was asked ' + (S.hooks.length - hooks) + ' time(s); ' + S.W.conflicts.length + ' watches refused as held');
    assert.deepEqual([names.filter((x) => x === 'get ' + V).length, names.filter((x) => x.startsWith('open ' + V)).length, sent.filter((f) => f.op === 'sub').length, S.hooks.length - hooks], [1, 1, 2, 1], 'one read of the record, one open, two watches, the page asked once: the eviction that waited sent nothing when it woke: ' + names.join(', '));
    assert.deepEqual([S.ended, S.heldOf(V), S.W.conflicts.length], [[], 'call,record', 0], 'nothing ended, both watches held, no watch sent twice');
  } finally { S.end(); }
});

// The adapter's own retry of an open that failed for a passing reason (review fix 7) is not one of the pair and not exempt:
// the wait is its only pause.
const BUSY = { ok: false, e: 'ratelimit', m: 'slow down', retry: 1000 };
for (const removal of [false, true]) test('an open the server was too busy for is tried again after a wait, 0.5 to 1 s, and never at once: ' + (removal ? 'also while the page says a device removal is running' : 'though that try is the second run of the minute'), async (t) => {
  let busy = 0; const S = server({ open: (f) => f.cid === V && busy-- > 0 ? BUSY : undefined, extra: { evictNow: () => removal } }), Q = quick(1);
  try {
    await S.whole(20, { 3: { call: true } });
    busy = 1; assert.ok(S.evict(V), 'evicted; the re-open is answered "slow down" once');
    assert.ok(await until(() => S.heldOf(V) === 'call,record', 6000), 'the chat is live again in the end: ' + (S.heldOf(V) || 'none'));
    const gap = S.hooks.length === 2 ? S.hooks[1][1] - S.hooks[0][1] : -1;
    t.diagnostic('the waits asked for, in ms: ' + Q.asked.map((x) => Math.round(x)).join(', ') + '; the page asked to read the record again ' + gap + ' ms after the first time');
    assert.equal(S.hooks.length, 2, 'the eviction ran twice: once, and once again after the refusal');
    assert.equal(Q.asked.length, 1, 'one wait was asked for, before the second run');
    assert.ok(Q.asked[0] >= 500 && Q.asked[0] < 1000, '0.5 to 1 s: ' + Math.round(Q.asked[0]));
    assert.ok(gap >= 480, 'and the second run began after it: ' + gap + ' ms after the first');
    assert.deepEqual(S.ended, [], 'nothing ended');
  } finally { Q.off(); S.end(); }
});

// ---- the run itself ----
// A first start of 110 chats whose keys the page holds (two frames a chat), rows 1 to 50 with a call watch, round trip 30 ms,
// the real clock. Row 0 is evicted every 200 ms from the start to the end of the run, whenever the connection holds its level.
// Without the run the list costs 12.4 s: its 271 frames less the 209 the page may send at once, at five a second.
async function run(t, { ring }) {
  const n = 110, rings = range(ring ? 0 : 1, 51), cost = (2 * n + rings.length - 209) / 5, S = server({ rtt: 30 });
  let landed = 0, iv = null;
  try {
    await S.db.ready; const t0 = Date.now();
    iv = setInterval(() => { if (S.evict(cidOf(0))) landed++; }, 200);
    for (const j of range(0, n)) S.watch(j, { call: rings.includes(j) });
    const others = () => range(1, n).filter((j) => S.live.has(cidOf(j))).length;
    const ok = await until(() => others() === n - 1, (cost + 8) * 1000), secs = (Date.now() - t0) / 1000, its = S.about(cidOf(0)).length;
    t.diagnostic('the other ' + (n - 1) + ' chats live after ' + secs.toFixed(1) + ' s (the list alone costs ' + cost.toFixed(1) + ' s); ' + landed + ' evictions landed; ' + its + ' frames were for the evicted chat; ' + S.W.over.length + ' refused');
    assert.ok(ok, 'every other chat is live within 8 s of what the list costs: ' + others() + ' of ' + (n - 1) + ' after ' + secs.toFixed(0) + ' s; ' + its + ' frames were for the evicted chat');
    assert.ok(its <= 32, 'the evicted chat took 32 frames at most (its own three and four a step): ' + its);
    assert.deepEqual([S.W.over.length, S.ended], [0, []], 'nothing refused, nothing ended');
  } finally { clearInterval(iv); S.end(); }
}
test('a chat with a call watch, first in the list, evicted every 200 ms while a list of 110 chats loads: the list loads all the same', (t) => run(t, { ring: true }));
test('the same for a request, first in the list with no call watch: the chats after it load all the same', (t) => run(t, { ring: false }));

test('the chat on screen evicted every 200 ms for 25 s: after the first steps it takes a frame a second at most, and none of the two writes a second the user makes in another chat is refused', async (t) => {
  const S = server({ rtt: 30 });
  let landed = 0, iv = null, wr = null; const writes = [];
  try {
    await S.whole(20, { 3: { call: true, posts: true } });
    const n = S.W.sent.length, t0 = Date.now();
    iv = setInterval(() => { if (S.evict(V)) landed++; }, 200);
    wr = setInterval(() => { const k = writes.length; writes.push('sent'); S.db.doc('channels/c005/reads/m' + (k % 2)).set({ ts: Date.now() }).then(() => { writes[k] = 'ok'; }, (e) => { writes[k] = e && e.code; }); }, 500);
    await tick(25000); clearInterval(iv); clearInterval(wr); await tick(200);
    const its = S.about(V, n), late = its.filter((f) => f.at - t0 >= 10000).length;
    t.diagnostic(landed + ' evictions landed; ' + its.length + ' frames for the chat in 25 s, ' + late + ' of them in the last 15 s; ' + writes.length + ' writes in another chat, ' + writes.filter((x) => x !== 'ok').length + ' not answered ok; ' + S.W.over.length + ' frames refused');
    assert.ok(its.length <= 40, 'the chat took 40 frames at most in 25 s (five a step): ' + its.length);
    assert.ok(late <= 15, 'and 15 at most in the last 15 s: ' + late);
    assert.deepEqual([writes.filter((x) => x !== 'ok'), S.W.over.length, S.ended], [[], 0, []], 'every write of the user\'s answered ok, nothing refused, nothing ended');
  } finally { clearInterval(iv); clearInterval(wr); S.end(); }
});
