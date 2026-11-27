// Release 111 (page), the unread count's side of the pace: computeUnread in app/ui.js, lifted from the page's source and run
// with stand-ins. The first four tests are release 101's (pace-page.test.js at 0d3bd18), carried over by hand; the rest are
// rounds 1 and 2 of the release 111 plan.
//  - A count the server did not answer (it was busy, the call was late, there was no connection) used to show as 1 and was
//    never asked for again. Now nothing is made up: it is asked for again after a wait (2 s, doubling once per wait, a
//    minute at most, one timer for all of them). Any other failure still shows 1.
//  - A count that comes back after its chat was opened or read is stale and is not shown. The calls among its messages are
//    noted all the same, as before.
//  - One count a chat, waiting or on its way: a chat written to faster than it can be counted gets no second count until
//    the first is back, and then one more if the chat moved meanwhile. So a busy chat's counts take turns with the others'.
// WHAT IT DOES NOT SEE: the connection and its queue (pace-unread-starve.test.js runs this function over the adapter), the
// real unsealing, the list and the title (stand-ins that count their calls).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appSource } from './helpers.js';

const src = appSource();
const between = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, 'found: ' + a); return src.slice(i, j); };
const coded = (code) => Object.assign(new Error(code), { code });
const tick = () => new Promise((r) => setImmediate(r));

// computeUnread over chats whose newest message is someone else's and unread. `answers` are the server's answers in turn: an
// error code, a number of posts, or 'hold' (the answer is given later by hand: P.held[k].answer(n) or .refuse(code)). The timers
// it sets are kept and run by hand. `gate`: unsealing waits for P.unseal() when set.
function unreadPage(answers, { gate = false } = {}) {
  const body = /^const mentionsMe=.*;$/m.exec(src)[0] + '\n' + between('async function computeUnread(){', 'async function notifyNew(');
  const make = new Function('S', 'lastRead', 'unsealAll', 'typeOf', 'openPost', 'noteCalls', 'renderList', 'updateTitle', 'isBlocked', 'setTimeout', 'clearTimeout', body + '\nreturn computeUnread;');
  const now = Date.now(), timers = [], held = [], asks = [], noted = [], read = new Map(), unseals = []; let drawn = 0;
  const posts = (n) => ({ docs: Array.from({ length: n }, (_, i) => ({ id: 'p' + i, data: () => ({ from: 'bob', text: 'x', ts: now - 9 + i }) })) });
  const get = (cid, lr) => async () => { asks.push(cid + ':' + lr); const a = answers.shift();
    if (a === 'hold') return new Promise((ok, no) => held.push({ cid, answer: (n) => ok(posts(n)), refuse: (code) => no(coded(code)) }));
    if (typeof a === 'string') throw coded(a); return posts(a); };
  const S = { me: { handle: 'alice' }, chan: null, unread: new Map(), mentions: new Map(), unreadKey: new Map(), convs: [{ id: 'd1', type: 'dm', last: { from: 'bob', ts: now - 1 } }],
    db: { collection: (p) => ({ where: (_f, _op, lr) => ({ limit: () => ({ get: get(p.split('/')[1], lr) }) }) }) } };
  const unsealAll = async (c, ds) => { if (gate) await new Promise((r) => unseals.push(r)); return ds; };
  const computeUnread = make(S, (k) => read.get(k) || 0, unsealAll, (c) => c.type, async (c, d) => ({ text: d.text }), (c, ds, os) => { noted.push(c.id + ':' + ds.length + ':' + os.length); },
    () => { drawn++; }, () => {}, () => false, (fn, ms) => { const t = { fn, ms, on: true }; timers.push(t); return t; }, (t) => { if (t) t.on = false; });
  const due = () => timers.filter((t) => t.on);
  const fire = async (ms) => { const t = due().find((x) => ms === undefined || x.ms === ms); assert.ok(t, 'a timer is set' + (ms === undefined ? '' : ' for ' + ms + ' ms')); t.on = false; await t.fn(); await tick(); };   // the timer's own pass is not awaited by the page: let it finish
  const say = (id) => { const c = S.convs.find((x) => x.id === id); c.last = { from: 'bob', ts: c.last.ts + 1 }; };   // one more message in that chat
  return { S, computeUnread, due, fire, say, held, asks, noted, read, unseal: () => unseals.splice(0).forEach((r) => r()), asked: () => asks.length, drawn: () => drawn };
}

// ---- release 101's four, carried over ----
test('an unread count the server was too busy to answer is not shown as 1: it is asked for again after a wait, and then shown', async () => {
  for (const code of ['ratelimit', 'timeout', 'offline']) {
    const P = unreadPage([code, 3]);
    await P.computeUnread();
    assert.deepEqual([P.S.unread.get('d1'), P.asked(), P.due().map((t) => t.ms)], [undefined, 1, [2000]], code + ': no count made up, one wait set');
    await P.computeUnread(); await P.computeUnread();
    assert.equal(P.asked(), 1, code + ': not asked again before the wait is over, however often the list is redrawn');
    await P.fire();
    assert.deepEqual([P.S.unread.get('d1'), P.asked(), P.due().length], [3, 2, 0], code + ': asked once more, answered, and no timer left');
  }
});

test('while the counts keep failing the wait doubles, up to a minute; after an answer it starts short again', async () => {
  const P = unreadPage([...Array(8).fill('ratelimit'), 2, 'ratelimit']);
  await P.computeUnread();
  const waits = [P.due()[0].ms];
  for (let k = 0; k < 7; k++) { await P.fire(); waits.push(P.due()[0].ms); }
  assert.deepEqual(waits, [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
  assert.equal(P.due().length, 1, 'one timer, not one for every failure');
  await P.fire();
  assert.deepEqual([P.S.unread.get('d1'), P.due().length], [2, 0]);
  P.say('d1'); await P.computeUnread();   // a newer message, and the server is busy again
  assert.deepEqual(P.due().map((t) => t.ms), [2000]);
});

test('a second chat that fails while the first is waiting shares its timer and does not double the wait: one wait, then both are asked for again', async () => {
  const P = unreadPage(['ratelimit', 'timeout', 1, 2]);
  await P.computeUnread();
  P.S.convs.push({ id: 'd2', type: 'dm', last: { from: 'bob', ts: Date.now() - 1 } }); await P.computeUnread();   // a message in another chat, the server still busy
  assert.deepEqual([P.asked(), P.due().map((t) => t.ms)], [2, [2000]], 'the first chat was not asked for again; one timer, and the wait it had (release 101 doubled it here: 4000)');
  await P.fire();
  assert.deepEqual([P.S.unread.get('d1'), P.S.unread.get('d2'), P.asked(), P.due().length], [1, 2, 4, 0]);
});

test('a count that was refused for another reason still shows as 1 and is not asked for again', async () => {
  const P = unreadPage(['denied', 5]);
  await P.computeUnread(); await P.computeUnread();
  assert.deepEqual([P.S.unread.get('d1'), P.asked(), P.due().length], [1, 1, 0]);
});

// ---- round 1: a stale count ----
test('a count that comes back after its chat was opened is not shown; the calls among its messages are noted all the same', async () => {
  const P = unreadPage(['hold']);
  const run = P.computeUnread(); await tick();
  P.S.chan = 'd1';   // opened while the count waited its turn
  P.held[0].answer(4); await run;
  assert.deepEqual([P.S.unread.get('d1'), P.S.mentions.get('d1')], [undefined, undefined], 'four unread is not written over an open chat');
  assert.deepEqual(P.noted, ['d1:4:4'], 'what the count opened still feeds the Calls list, as before');
  await P.computeUnread();
  assert.deepEqual([P.S.unread.get('d1'), P.asked()], [0, 1], 'the open chat has none, and is not counted');
});

test('a count that comes back after its chat was read (Mark as read, or read while its messages were unsealed) is not shown', async () => {
  const P = unreadPage(['hold']);
  let run = P.computeUnread(); await tick();
  P.read.set('d1', P.S.convs[0].last.ts);   // Mark as read from the list, while the count waited
  P.held[0].answer(4); await run;
  assert.equal(P.S.unread.get('d1'), undefined, 'not shown');
  await P.computeUnread();
  assert.deepEqual([P.S.unread.get('d1'), P.asked()], [0, 1], 'read: nothing unread and nothing asked');

  const Q = unreadPage([4], { gate: true });
  run = Q.computeUnread(); await tick(); await tick();
  Q.read.set('d1', Q.S.convs[0].last.ts);   // read while the answer was being unsealed
  Q.unseal(); await run;
  assert.equal(Q.S.unread.get('d1'), undefined, 'the answer was in, the chat was read before it was shown: dropped');
});

test('a count dropped because its chat was on screen is asked again once the chat is left with the message still unread', async () => {
  const P = unreadPage(['hold', 4]);
  const run = P.computeUnread(); await tick();
  P.S.chan = 'd1';   // opened while the count waited its turn; the page was hidden, or scrolled up: nothing is marked read
  P.held[0].answer(4); await run;
  await P.computeUnread();
  assert.deepEqual([P.S.unread.get('d1'), P.asked()], [0, 1], 'while it is on screen: no badge and nothing asked');
  P.S.chan = null;   // left, the read mark where it was
  await P.computeUnread();
  assert.deepEqual([P.S.unread.get('d1'), P.asked()], [4, 2], 'asked once more and shown: the dropped count did not stand for the chat');
  await P.computeUnread();
  assert.equal(P.asked(), 2, 'and then not again');
});

test('a count that is not stale is shown as before: the number, the mentions of a group, the calls noted, the list drawn', async () => {
  const P = unreadPage([3]);
  await P.computeUnread();
  assert.deepEqual([P.S.unread.get('d1'), P.S.mentions.get('d1'), P.noted, P.drawn(), P.asks], [3, 0, ['d1:3:3'], 1, ['d1:0']]);
});

// ---- round 2: one count a chat ----
test('one count a chat: while one is waiting or on its way, more messages in that chat ask for nothing; when it is back the chat is counted once more', async () => {
  const P = unreadPage(['hold', 7]);
  const first = P.computeUnread(); await tick();
  for (let k = 0; k < 5; k++) { P.say('d1'); await P.computeUnread(); }   // the chat is written to five times before the count is back
  assert.deepEqual([P.asked(), P.due().length], [1, 0], 'one count out, nothing queued behind it and no timer');
  P.held[0].answer(2); await first;
  assert.equal(P.S.unread.get('d1'), 2, 'the count that came back is shown (the chat was not read meanwhile)');
  assert.deepEqual(P.due().map((t) => t.ms), [0], 'and the chat is looked at again at once, since it moved');
  await P.fire(0);
  assert.deepEqual([P.asked(), P.S.unread.get('d1'), P.due().length], [2, 7, 0], 'counted once more, with the newest message; nothing further');
});

test('a chat that did not move while its count was on its way is not counted twice', async () => {
  const P = unreadPage(['hold']);
  const first = P.computeUnread(); await tick();
  await P.computeUnread(); await P.computeUnread();   // the list is drawn again (another chat changed), this chat did not
  P.held[0].answer(1); await first;
  assert.deepEqual([P.asked(), P.due().length, P.S.unread.get('d1')], [1, 0, 1]);
});

test('a chat whose count is on its way does not hold another chat\'s count back', async () => {
  const P = unreadPage(['hold', 2]);
  const first = P.computeUnread(); await tick();
  P.S.convs.push({ id: 'd2', type: 'dm', last: { from: 'bob', ts: Date.now() - 1 } }); P.say('d1');
  await P.computeUnread();
  assert.deepEqual([P.asks.map((a) => a.split(':')[0]), P.S.unread.get('d2')], [['d1', 'd2'], 2], 'the other chat is asked for and shown at once');
  P.held[0].answer(1); await first;
});

test('a busy chat\'s count that is refused is never shown as 1: it is counted again when it comes back, and the wait is set once', async () => {
  const P = unreadPage(['hold', 5, 5]);
  const first = P.computeUnread(); await tick();
  P.say('d1'); await P.computeUnread();
  P.held[0].refuse('ratelimit'); await first;
  assert.deepEqual([P.S.unread.get('d1'), P.due().map((t) => t.ms).sort((a, b) => a - b)], [undefined, [0, 2000]], 'nothing made up; looked at again at once (it moved) and after the wait');
  await P.fire(0);
  assert.deepEqual([P.S.unread.get('d1'), P.asked()], [5, 2]);
  await P.fire(2000);
  assert.deepEqual([P.S.unread.get('d1'), P.due().length], [5, 0], 'the wait\'s own ask finds the same, and no timer is left');
});

test('a switch of account starts the record of counts to ask again anew: the other account\'s chats and its wait are not carried over', () => {
  const start = between('function start(id){', '\n}');
  assert.match(start, /Object\.assign\(S,\{convs:\[\],seenLast:new Map\(\),convsLoaded:false,unread:new Map\(\),unreadKey:new Map\(\),unreadRedo:null,mentions:new Map\(\),showArchived:false\}\)/, 'made new where the counts and their keys are');
  assert.match(between('async function computeUnread(){', 'async function notifyNew('), /R=S\.unreadRedo\|\|\(S\.unreadRedo=\{ids:new Set\(\),wait:0,t:null,busy:new Set\(\),again:new Set\(\)\}\)/, 'and computeUnread makes a fresh one when there is none');
});

test('nobody signed in, or no connection object: nothing is asked and nothing is set', async () => {
  const P = unreadPage([1]); P.S.me = null; await P.computeUnread();
  const Q = unreadPage([1]); Q.S.db = null; await Q.computeUnread();
  assert.deepEqual([P.asked(), Q.asked(), P.due().length, Q.due().length], [0, 0, 0, 0]);
});
