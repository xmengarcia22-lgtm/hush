// The queue under frames that do not wait (release 111; the owner's word on D14, 2026-11-24, which takes the queue's own turn
// out again). Frames that do not wait in the queue keep the page's count at the reserve when they come at the allowance's refill
// rate or faster. For a while (review fix 4) the queue then still sent one frame a second of its own; that frame was above the
// allowance by construction, so the server refused a frame for it, and the page cannot choose which: the user's own sends
// failed where they did not on the live page. The rule now: the queue never sends at or under the reserve. What does not wait,
// sent at the refill rate or faster, holds the queue for as long as it lasts, and nothing of the queue's is then above the
// allowance: no frame of the user's is refused for the queue's sake. (The page's side of it, at most one read mark and one
// record update a second for the chat on screen however fast messages arrive, is app/ui.js's and is tested there.)
// The adapter runs as written, against a stand-in server with the real server's frame and query buckets.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TokenBucket } from '../src/limits.js';
import { world, pageKept, callWatch, openChat, tick, range, cidOf, what, refused, back, fast } from './adapter-pace-kit.js';

const until = async (fn, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms && !fn();) await tick(20); return fn(); };
const num = (cid) => Number(cid.slice(1));
const chatIn = (f) => f.cid || (f.ids && f.ids[0]) || (/^channels\/([^/]+)/.exec(f.p || '') || [])[1];   // the chat a frame is for
const isStream = (f) => /^channels\/c000\/reads\//.test(f.p || '');

// 150 chats in the list's order. The first is on screen; rows 1 to 90 have a call watch, asked for when the chat's record comes,
// as the page does. `per` frames a second of allowance are written for the chat on screen, from the hello of the connection
// that is looked at. The clock runs `k` times as fast; every frame is stamped with the page's clock (vt, in ms of allowance).
//   re   a whole page whose connection is lost: the connection looked at is the next one. Else a first start.
//   own  every `own` ms of allowance the user sends a message in another chat: two frames that do not wait. S.sends keeps how each ended.
function flooded({ per, k = 4, re = false, own = 0 }) {
  const K = k, n = 150, T = fast(K), S = { T, live: new Set(), stop: false, writes: 0, sends: [] }, sock = re ? 1 : 0, rung = new Set();
  const W = S.W = world({ fpm: 300, qpm: 120, now: T.now, rtt: 5, on: (f, s, rec) => { rec.vt = T.now();
    if (s.n !== sock && f.op === 'hello') { s.bucket = new TokenBucket(1e6, 1e6); s.queries = null; return { ok: true, nonce: 'n0', now: Date.now(), limits: { framesPerMin: 600000 } }; }
    return undefined; } });
  const db = S.db = pageKept(W, { rank: num });
  const every = async (gap, fn) => { let next = Date.now(); while (!S.stop) { next += gap; fn(); await tick(Math.max(0, next - Date.now())); } };
  const stream = () => { const w = db.doc('channels/c000/reads/m' + (S.writes % 2)); S.writes++; (S.writes % 2 ? w.set({ ts: 1 }) : w.delete()).catch(() => {}); };
  const send = () => { const j = S.sends.length; S.sends.push('sent');
    Promise.all([db.doc('channels/c005/posts/p' + j).set({ ts: 1 }), db.doc('channels/c005/reads/me').set({ ts: 1 })]).then(() => { S.sends[j] = 'ok'; }, (e) => { S.sends[j] = (e && e.code) || 'failed'; }); };
  S.begin = async () => {
    await db.ready; openChat(db, 'c000');
    for (const j of range(0, n)) db.doc('channels/' + cidOf(j)).onSnapshot((s) => { if (s.exists && s.data().full) { S.live.add(cidOf(j)); if (j >= 1 && j <= 90 && !rung.has(j)) { rung.add(j); callWatch(db, cidOf(j)); } } }, () => {});
    if (re) { assert.ok(await until(() => W.socks[0].held.size === n + 91 && S.live.size === n, 15000), 'the page is whole: ' + W.socks[0].held.size + ' watches'); await tick(60); await back(W, db, 0); }
    S.t0 = W.sent.find((f) => f.sock === sock).vt;
    if (per) every(1000 / per / K, stream);
    if (own) every(own / K, send);
  };
  S.at = (ms) => until(() => T.now() >= S.t0 + ms, ms / K + 4000);   // until `ms` of allowance after the hello
  S.frames = () => W.sent.filter((f) => f.sock === sock && f.op !== 'hello');
  S.queued = (a, b) => S.frames().filter((f) => f.vt > S.t0 + a && f.vt <= S.t0 + b && !isStream(f) && chatIn(f) && chatIn(f) !== 'c000' && chatIn(f) !== 'c005');   // what left the queue: the frames of the chats nobody is in
  S.over = () => W.over.filter((f) => f.sock === sock);
  S.held = () => W.socks[sock].held.size;
  S.end = () => { S.stop = true; db.close(); T.off(); };
  return S;
}

test('under a stream above the refill rate (six writes a second for the chat on screen) the queue sends nothing while the count is at or under the reserve, for as long as it lasts, and the only frames the server refuses are the stream\'s own excess: a start of 150 chats, 115 s of allowance', async (t) => {
  const S = flooded({ per: 6, k: 10 });
  try {
    await S.begin(); await S.at(115000);
    const q = S.queued(8000, 115000), over = S.over(), stream = S.frames().filter(isStream).length;   // after the first burst (8 s at this clock): at or under the reserve the whole time
    t.diagnostic(q.length + ' frames left the queue between 8 s and 115 s; ' + stream + ' writes of the stream, ' + over.length + ' frames refused, ' + over.filter(isStream).length + ' of them the stream\'s; ' + S.live.size + ' chats live');
    assert.deepEqual(q.map(what), [], 'nothing leaves the queue at or under the reserve');
    assert.ok(stream >= 650, 'the stream ran all the while: ' + stream + ' writes');
    assert.ok(over.every(isStream), 'every refused frame is the stream\'s own: ' + refused(S.W));
    assert.ok(over.length <= stream - 5 * 115, 'and no more of them than the stream is above the refill rate (' + (stream - 5 * 115) + '): ' + over.length);
  } finally { S.end(); }
});

test('at exactly the refill rate (five writes a second) nothing at all is refused in 120 s of allowance, and a message the user sends in another chat every 5 s (two frames) always goes', async (t) => {
  const S = flooded({ per: 5, k: 10, own: 5000 });
  try {
    await S.begin(); await S.at(120000); S.stop = true; await tick(100);
    const over = S.over();
    t.diagnostic(S.sends.length + ' messages sent, ' + S.sends.filter((x) => x !== 'ok').length + ' not answered ok; ' + over.length + ' frames refused; ' + S.frames().filter(isStream).length + ' writes of the stream; ' + S.queued(8000, 120000).length + ' frames left the queue after the first 8 s');
    assert.ok(S.sends.length >= 22, 'the user sent all the while: ' + S.sends.length);
    assert.deepEqual(S.sends.filter((x) => x !== 'ok'), [], 'every message of the user\'s went');
    assert.equal(over.length, 0, 'nothing refused: ' + refused(S.W));
  } finally { S.end(); }
});

test('under two writes a second for the chat on screen (what the page\'s paced read marks come to) the queue keeps at least 2.5 frames a second, and a start of 150 chats with 90 call watches is whole within 130 s of allowance (its frames cost about 115 s at the three a second that are left)', async (t) => {
  const S = flooded({ per: 2, k: 10 });
  try {
    await S.begin(); await S.at(48000);
    const q = S.queued(8000, 48000).length;
    const ok = await until(() => S.live.size === 150 && S.held() === 241, 8200), secs = (S.T.now() - S.t0) / 1000;
    t.diagnostic(q + ' frames left the queue between 8 s and 48 s (' + (q / 40).toFixed(1) + ' a second); the list whole after ' + secs.toFixed(0) + ' s of allowance; ' + S.over().length + ' refused');
    assert.ok(q >= 100, 'at least 2.5 frames a second left the queue: ' + q + ' in 40 s');
    assert.ok(ok && secs <= 130, 'every chat live and every watch held within 130 s of allowance: ' + S.live.size + ' chats, ' + S.held() + ' watches of 241 after ' + secs.toFixed(0) + ' s');
    assert.equal(S.over().length, 0, 'nothing refused: ' + refused(S.W));
  } finally { S.end(); }
});

test('with nothing else sent the queue goes at the allowance\'s rate: a start of 150 chats sends its first burst down to the reserve, less the room the list\'s first rows still hold for their next frames, which is spent within seconds, and then five frames a second, not six', async (t) => {
  const S = flooded({ per: 0 });
  try {
    await S.begin(); await S.at(22000);
    const burst = S.frames().filter((f) => f.vt <= S.t0 + 1000).length, by12 = S.frames().filter((f) => f.vt <= S.t0 + 12000).length, then = S.queued(12000, 22000).length;
    t.diagnostic(burst + ' frames in the first second, ' + by12 + ' in the first 12 s, ' + then + ' left the queue between 12 s and 22 s');
    assert.ok(burst >= 209 - 5 * 19 && burst <= 216, 'the first burst is the full count down to the reserve (209) and a second of refill, less the room of the 19 first rows that wait (five frames a row at most): ' + burst);
    assert.ok(by12 >= 209 + 5 * 11 && by12 <= 209 + 5 * 12 + 2, 'in the first 12 s the burst and 12 s of refill: the room is spent, not lost, and nothing above the allowance: ' + by12);
    assert.ok(then >= 46 && then <= 53, 'then five a second: ' + then + ' in 10 s');
    assert.equal(S.over().length, 0, 'nothing refused: ' + refused(S.W));
  } finally { S.end(); }
});
