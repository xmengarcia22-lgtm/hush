// Release 111 (page; the owner's word on D14, 2026-11-24: the queue must keep moving AND nothing of the person's own may
// be refused for the queue's sake): the chat on screen writes at most one read mark and one update of the chat's
// latest-message marker a second, however fast messages arrive, and no longer the delete of the old named read mark.
//
// Before: for every message that arrived in the chat on screen the page wrote three frames, none of which waits in the
// start's queue: the read mark (writeSeen), the delete of the read mark under the username (which the server has refused
// as "bad id" since release 91: a read mark's id is `<key number>~<tag>`, paths.js SIDE_ID), and, when the chat record did
// not name the message as its latest yet, an update of the record (promoteLast). A member who posts fast into the chat a
// person has open (the server lets one connection post 60 messages a minute, so two or three connections) thereby made
// the person's own app use the whole frame allowance of 300 a minute: the queue stood still for as long as it lasted, and
// above five frames a second the server refused the person's own frames. Now: two frames a second at most.
//
// markRead, writeSeen, applyExpiry, promoteLast, allPosts, lastRead and the pace (`paced`) run as written in app/ui.js.
// Around them: the clock and the timers are the test's (`now`, `advance`), a message is a made-up post put into
// S.rawPosts and handed over as the posts watch does it (applyExpiry, then markRead: app/ui.js, the watch in openConv),
// the tag and the sealing are stand-ins that keep the time written readable, and S.db records every frame.
//
// WHAT IT DOES NOT SEE: the adapter, the server and its allowance (the proof's flood run on the real server measures
// those), the real sealing, a page that is closed inside the second (the last mark of a burst is then not written).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const UI = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const lift = (from, to, must = true) => { const a = UI.indexOf(from); if (a < 0 && !must) return ''; assert.ok(a >= 0, 'app/ui.js holds ' + from); const b = UI.indexOf(to, a + from.length); assert.ok(b > a, 'app/ui.js holds ' + to); return UI.slice(a, b); };
const CODE = [
  lift('const lastRead=', '\n'), lift('const paceAt=', '\nfunction markRead(', false),   // the pace itself: not there in the page before this change
  lift('function markRead(', '\nconst typeOf='),
  lift('function allPosts(', '\n'), lift('function applyExpiry(', '\nasync function loadOlder('),
  lift('const convById=', '\n'), lift('const lastOf=', '\n'), lift('const lastUpd=', '\n'),
].join('\n');
const STUBS = ['S', 'ls', 'document', 'curConv', 'updateTitle', 'isMember', 'isRequest', 'epochOf', 'memTag', 'sealSide', 'goneForMe', 'isBlocked', 'purgePost', 'Date', 'performance', 'setTimeout', 'clearTimeout'];
const mk = new Function('env', `const {${STUBS.join(',')}}=env;\n${CODE}\nreturn {markRead,applyExpiry};`);

const ME = 'bob', A = 'gAAAAAAAAAAAAAAAAAAAAA', B = 'gBBBBBBBBBBBBBBBBBBBBB', T0 = 1_800_000_000_000;
function page() {
  const frames = [], timers = []; let now = T0, seq = 0, skew = 0;   // skew: how far the device's clock (Date.now) is behind the time that really passes (`now`: the timers, a message's own time)
  const conv = (id) => ({ id, type: 'group', epoch: 1, members: [ME, 'amy'], last: null });
  const S = { me: { handle: ME }, chan: A, convs: [conv(A), conv(B)], previews: new Map(), posts: [], rawPosts: [], older: [], unread: new Map(), readWritten: new Map(), purged: new Set(), promoting: null, db: null };
  S.db = { doc: (path) => ({ set: async (v) => { frames.push({ op: 'set', path, at: now, ts: v.ts }); }, delete: async () => { frames.push({ op: 'delete', path, at: now }); },
    update: async (v) => { frames.push({ op: 'update', path, at: now, ts: v.ts, id: v.last && v.last.id }); } }) };
  const store = new Map();
  const env = { S, ls: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) }, document: { hidden: false },
    curConv: () => S.convs.find((c) => c.id === S.chan), updateTitle: () => {}, isMember: () => true, isRequest: () => false, epochOf: (c) => c.epoch,
    memTag: async (_c, _e, h) => 'tag-of-' + h, sealSide: async (_c, _e, _t, _label, ts) => ({ ts }), goneForMe: () => false, isBlocked: () => false, purgePost: () => {},
    Date: { now: () => now - skew }, performance: { now: () => now - T0 + 5000 }, setTimeout: (fn, ms) => { const id = ++seq; timers.push({ id, at: now + Math.max(0, ms || 0), fn }); return id; }, clearTimeout: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); } };
  const api = mk(env);
  const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };   // writeSeen awaits its tag and its sealing before it writes
  // the clock goes on by `ms`, every timer that falls due runs at its own time, in order
  const advance = async (ms) => { const end = now + ms; for (;;) { timers.sort((a, b) => a.at - b.at); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.fn(); await settle(); } now = end; await settle(); };
  // a message arrives in the chat on screen, as the posts watch hands it over: the page works out what shows, then marks it read
  const arrive = async (n, cid = S.chan) => { if (cid === S.chan) { S.rawPosts.push({ _id: 'p' + n, ts: now, from: 'amy' }); api.applyExpiry(); api.markRead(); } await settle(); };
  const marker = (cid, ts, id) => { S.convs.find((c) => c.id === cid).last = { ts, id }; };   // the chat record names this message as its latest (the sender's own marker came)
  // read: the chat on screen is marked read (as when it is opened); back: the device's clock is set back
  return { S, frames, advance, arrive, marker, clock: () => now, read: async () => { api.markRead(); await settle(); }, back: (ms) => { skew += ms; }, of: (op, cid) => frames.filter((f) => f.op === op && f.path.startsWith('channels/' + cid)) };
}
const perSecond = (frames) => { const m = new Map(); for (const f of frames) { const s = Math.floor((f.at - T0) / 1000); m.set(s, (m.get(s) || 0) + 1); } return Math.max(0, ...m.values()); };

test('one message in the chat on screen: its read mark is written at once, and the chat\'s latest-message marker at once; the old named read mark is no longer deleted (the server has refused that id since release 91: a wasted frame a message)', async () => {
  const W = page();
  await W.arrive(1);
  assert.deepEqual(W.frames.map((f) => f.op + ' ' + f.path), [`update channels/${A}`, `set channels/${A}/reads/1~tag-of-bob`], 'two frames, both in the moment the message came');
  assert.deepEqual([W.frames[0].id, W.frames[1].ts], ['p1', T0], 'the marker names the message, the read mark holds its time');
});

test('messages two seconds apart, an ordinary conversation: every read mark and every marker in the moment its message came, as before', async () => {
  const W = page();
  for (let n = 1; n <= 5; n++) { const at = W.clock(); await W.arrive(n); assert.deepEqual(W.frames.filter((f) => f.at === at).map((f) => f.op).sort(), ['set', 'update'], 'message ' + n + ': both at once'); await W.advance(2000); }
  assert.equal(W.frames.length, 10, 'two frames a message, none late, none more');
});

test('a flood into the chat on screen, three messages a second for 20 s (60 messages): the page writes at most one read mark and one marker a second, 42 frames at most where it wrote three a message; and the last of them are the newest message\'s', async () => {
  const W = page();
  for (let n = 1; n <= 60; n++) { await W.arrive(n); await W.advance(333); }
  const last = T0 + 59 * 333;
  await W.advance(1000);
  const sets = W.of('set', A), ups = W.of('update', A);
  assert.equal(W.of('delete', A).length, 0, 'no delete of the old named mark');
  assert.ok(perSecond(sets) <= 1 && perSecond(ups) <= 1, `one read mark and one marker in any second at most (saw ${perSecond(sets)} and ${perSecond(ups)})`);
  assert.ok(W.frames.length <= 42, `at most two frames a second over the 21 s (saw ${W.frames.length}; before: 180)`);
  assert.ok(sets.length >= 18 && ups.length >= 18, `and not fewer than one a second while the flood lasts: the mark and the marker keep up (saw ${sets.length} and ${ups.length})`);
  assert.deepEqual([sets.at(-1).ts, ups.at(-1).id], [last, 'p60'], 'the last read mark holds the newest message\'s time and the last marker names it');
  assert.ok(sets.at(-1).at - last <= 1000 && ups.at(-1).at - last <= 1000, 'both within a second of the last message');
});

test('a marker that waited its second is asked again with what is true by then: when the sender\'s own marker has come meanwhile, naming a newer message, the page writes none (it would put the older message over the newer)', async () => {
  const W = page();
  await W.arrive(1);                                   // written at once
  await W.advance(300); await W.arrive(2);            // waits for the end of the second
  assert.equal(W.of('update', A).length, 1, 'the second marker waits');
  W.marker(A, W.clock() + 5, 'p3');                    // the record now names a message newer than p2
  await W.advance(1000);
  assert.deepEqual(W.of('update', A).map((f) => f.id), ['p1'], 'no late write of p2 over p3');
});

test('the chat is left inside the second: the read mark that waited is still written for the chat it belongs to; the marker that waited is not written for a chat no longer on screen; and after a change of account neither is', async () => {
  const W = page();
  await W.arrive(1); await W.advance(300); await W.arrive(2);
  const t2 = W.clock();
  await W.advance(100);
  const q = { _id: 'q1', ts: W.clock(), from: 'amy' };
  W.S.chan = B; W.S.rawPosts = [q]; W.S.posts = [q];   // another chat is opened: the page now holds THAT chat's messages
  await W.read();                                      // and it is read there, while chat A's mark still waits its second
  await W.advance(1000);
  assert.deepEqual(W.of('set', A).map((f) => f.ts), [T0, t2], 'chat A\'s read mark was brought up to its newest message: a mark waits under its own chat, chat B\'s mark did not take its place');
  assert.deepEqual(W.of('set', B).map((f) => [f.ts, f.at]), [[q.ts, q.ts]], 'chat B\'s read mark at once');
  assert.deepEqual([W.of('update', A).map((f) => f.id), W.of('update', B).length], [['p1'], 0], 'no late marker for A (chat B\'s newest message is not written as chat A\'s latest), none for B, whose marker nobody asked for');
  const X = page();
  await X.arrive(1); await X.advance(300); await X.arrive(2);
  X.S.me = { handle: 'carol' };                        // signed in as someone else before the second is over
  await X.advance(1000);
  assert.deepEqual(X.of('set', A).map((f) => f.path), [`channels/${A}/reads/1~tag-of-bob`], 'no read mark written under the next account for what the last one read');
});

// (Set back by more than three seconds, the page holds an arriving message back as one from the future, as it did
// before this release: applyExpiry. So the step that matters here is a small one.)
test('the device\'s clock is set back two and a half seconds while messages keep coming, three a second (a phone correcting its clock): the read mark and the marker go on once a second by the time that really passes, not held back for as long as the clock went back', async () => {
  const W = page();
  await W.arrive(1);                                   // both written at once
  W.back(2500);                                        // the clock now says two and a half seconds earlier
  const step = W.clock();
  for (let n = 2; n <= 13; n++) { await W.advance(300); await W.arrive(n); }   // 3.6 s of messages after the step
  await W.advance(1000);
  const sets = W.of('set', A), ups = W.of('update', A);
  const firstAfter = (fr) => fr.find((f) => f.at > step);
  assert.ok(firstAfter(sets) && firstAfter(sets).at - step <= 1000, `a read mark within a second of the step (the first came ${firstAfter(sets) ? firstAfter(sets).at - step : 'never'} ms after it)`);
  assert.ok(firstAfter(ups) && firstAfter(ups).at - step <= 1000, `a marker within a second of the step (the first came ${firstAfter(ups) ? firstAfter(ups).at - step : 'never'} ms after it)`);
  assert.ok(sets.length >= 5 && ups.length >= 5, `and one a second after it: the 4.6 s hold at least four more of each (saw ${sets.length} and ${ups.length})`);
  assert.ok(perSecond(sets) <= 1 && perSecond(ups) <= 1, 'never more than one of each in a second');
  assert.deepEqual([sets.at(-1).ts, ups.at(-1).id], [step + 12 * 300, 'p13'], 'the last ones are the newest message\'s');
});
