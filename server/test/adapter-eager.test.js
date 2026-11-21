// The reconnect after a lost connection waits a random 0.5 to 4.5 s, so that after a server restart every page is not back at the
// same moment. That wait was also what a person coming back to the app, or tapping a chat, sat through in front of an empty chat.
// Now the page tells the adapter that the user is here (present()), and the next reconnect goes at once: the one already waiting,
// or the one a close heard in the next few seconds starts. Once per call: if that attempt fails, the usual wait is back. A page
// left alone, and the keep-alive's own probe, keep the wait. The adapter runs as written, against a fake WebSocket.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appSource } from './helpers.js';

const B = '/* ===== HUSH ADAPTER BEGIN ===== */', E = '/* ===== HUSH ADAPTER END ===== */';
const all = appSource(), createHushAdapter = new Function(all.slice(all.indexOf(B) + B.length, all.indexOf(E)) + '\nreturn createHushAdapter;')();
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, m) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout: ' + m); await tick(5); } };
const AT_ONCE = 150, WAIT = 430;   // "at once" is well under the shortest wait (500 ms); nothing may come within WAIT without present()
function world() {
  const W = { socks: [], dead: false };   // dead: the server is gone, a new connection closes before it opens
  W.WS = class {
    constructor() { this.n = W.socks.push(this) - 1; this.sent = []; this.readyState = 0;
      setTimeout(() => { if (this.readyState === 3) return; if (W.dead) { this.readyState = 3; this.onclose({ code: 1006 }); return; } this.readyState = 1; this.onopen(); }); }
    send(s) { const f = JSON.parse(s); this.sent.push(f.op); const r = f.op === 'hello' ? { ok: true, nonce: 'n', now: Date.now() } : { ok: true };
      setTimeout(() => { if (this.readyState === 1) this.onmessage({ data: JSON.stringify({ i: f.i, ...r }) }); }); }
    close() { this.readyState = 3; }
  };
  W.lose = (n) => { W.socks[n].readyState = 3; W.socks[n].onclose({ code: 1006 }); };   // the connection is lost and the page hears it
  return W;
}
const page = (W) => createHushAdapter('ws://x/ws', { WebSocket: W.WS, pingMs: 60000 });
const comes = (W, n, m) => until(() => W.socks.length === n, AT_ONCE, m);
const none = async (W, n, m) => { await tick(WAIT); assert.equal(W.socks.length, n, m); };

test('the user is here, then the close is heard: the reconnect does not wait', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; assert.equal(typeof db.present, 'function', 'the page can say the user is here');
    db.present(); await tick(40); W.lose(0);   // back in view; iOS reports the dead socket a moment later
    await comes(W, 2, 'no new connection at once'); await until(() => db.online, 500, 'back online');
  } finally { db.close(); }
});

test('the close is heard, then the user is here: the reconnect that was waiting goes now', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; W.lose(0); await tick(60); assert.equal(W.socks.length, 1, 'still waiting');
    db.present(); await comes(W, 2, 'no new connection at once'); await until(() => db.online, 500, 'back online');
    db.present(); db.present(); await none(W, 2, 'saying it again on a good connection brings no other');
    assert.deepEqual(W.socks[1].sent, ['hello'], 'and sends nothing');
  } finally { db.close(); }
});

test('a page left alone keeps the wait, and so does one whose keep-alive probe was answered', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; W.lose(0); await none(W, 1, 'an automatic reconnect came inside the shortest wait');
    await until(() => db.online, 6000, 'it does reconnect by itself');
    db.probe(50); await tick(100); W.lose(1); await none(W, 2, 'a probe is not the user: the wait stays');
  } finally { db.close(); }
});

test('once: after the reconnect at once, the next lost connection waits again', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; db.present(); W.lose(0); await comes(W, 2, 'the first goes at once'); await until(() => db.online, 500, 'back online');
    W.lose(1); await none(W, 2, 'the second lost connection was reconnected at once too');
  } finally { db.close(); }
});

test('the server is gone: one attempt at once per time the user comes, then the usual wait, and no second connection beside one being made', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; W.dead = true; W.lose(0); await tick(30);
    db.present(); assert.equal(W.socks.length, 2, 'one attempt at once');
    await none(W, 2, 'the attempt failed and another came at once: the page would spin against a server that is down');
    db.present(); assert.equal(W.socks.length, 3, 'the user comes again: one more attempt at once');
    db.present(); db.present(); assert.equal(W.socks.length, 3, 'said again while that attempt is being made: no second connection beside it');
    await none(W, 4, 'said during an attempt buys one retry at once when the attempt fails, and then the wait');
  } finally { db.close(); }
});

test('said a while ago is not here: a close heard more than five seconds later waits as usual', async () => {
  const W = world(), db = page(W), real = Date.now;
  try {
    await db.ready; db.present(); Date.now = () => real() + 5100; W.lose(0);
    await none(W, 1, 'a reconnect at once on the strength of an old tap');
  } finally { Date.now = real; db.close(); }
});

// The review of 2026-11-10 (small point 3): every attempt doubled the next automatic wait, also the ones the user asked for, so
// a few taps on a server that was down pushed the automatic retry towards 30 s and a page then left alone came back late.
test('attempts the user asked for do not lengthen the automatic wait; the automatic ones still double it', async () => {
  const W = world(), db = page(W), rnd = Math.random;
  try {
    await db.ready; Math.random = () => 0;   // the wait is then exactly its base: 500 ms, then 1 s, 2 s
    W.dead = true; W.lose(0);
    for (let k = 0; k < 3; k++) { db.present(); db.present(); await tick(40); }   // three taps on a dead server: each hurries the waiting reconnect and buys one retry at once
    assert.equal(W.socks.length, 7, 'six attempts at once, all failed');
    const t0 = Date.now(); await until(() => W.socks.length === 8, 800, 'the automatic attempt did not come after the first wait (500 ms): the taps lengthened it');
    assert.ok(Date.now() - t0 >= 380, 'and it did wait: ' + (Date.now() - t0) + ' ms');
    const t1 = Date.now(); await until(() => W.socks.length === 9, 1500, 'the next automatic attempt');
    assert.ok(Date.now() - t1 >= 900, 'an automatic attempt that failed doubles the wait as before: ' + (Date.now() - t1) + ' ms');
  } finally { Math.random = rnd; db.close(); }
});

test('a closed adapter stays closed', async () => {
  const W = world(), db = page(W);
  await db.ready; W.lose(0); db.close(); db.present(); await tick(AT_ONCE); assert.equal(W.socks.length, 1);
});
