// The adapter's probe (release 64): a socket that looks open but carries nothing (what WebKit leaves behind when the
// app slept through a call) is found by one ping and replaced at once; the periodic ping does the same instead of
// swallowing its failure; a socket that answers is left alone; and a socket already being replaced is never replaced
// twice, however many probes or late failures land on it. The adapter runs as written, against a fake WebSocket.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appSource } from './helpers.js';

const B = '/* ===== HUSH ADAPTER BEGIN ===== */', E = '/* ===== HUSH ADAPTER END ===== */';
const all = appSource(), a = all.indexOf(B), b = all.indexOf(E);
const createHushAdapter = new Function(all.slice(a + B.length, b) + '\nreturn createHushAdapter;')();
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, what) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout: ' + what); await tick(10); } };

test('probe() and the periodic ping replace a socket that stops answering, once, and leave one that answers alone', async () => {
  const socks = []; let mute = false; // mute: the socket stays open, but a ping gets no reply (everything else is answered, so a new socket signs on)
  class FakeWS {
    constructor() { socks.push(this); this.sent = []; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen(); }); }
    send(s) { const f = JSON.parse(s); this.sent.push(f.op); if (mute && f.op === 'ping') return;
      const r = f.op === 'hello' ? { ok: true, nonce: 'n', now: Date.now() } : { ok: true }; setTimeout(() => this.onmessage({ data: JSON.stringify({ i: f.i, ...r }) })); }
    close() { this.readyState = 3; this.closed = true; }
  }
  const db = createHushAdapter('ws://x/ws', { WebSocket: FakeWS, pingMs: 300, callTimeoutMs: 100 });
  try {
    await db.ready; assert.equal(socks.length, 1); assert.equal(typeof db.probe, 'function', 'the page can ask for a probe');
    // healthy: the periodic pings and a probe are answered, nothing changes
    await tick(700); assert.ok(socks[0].sent.filter((op) => op === 'ping').length >= 2, 'the periodic ping runs');
    db.probe(50); await tick(120);
    assert.equal(socks.length, 1, 'an answered ping or probe changes nothing');
    assert.deepEqual([...new Set(socks[0].sent)].sort(), ['hello', 'ping'], 'the probe sends nothing but a ping');
    // dead: the probe's ping is not answered within its time -> exactly one new connection, the dead one closed
    mute = true; db.probe(50); await tick(150);
    assert.equal(socks.length, 2, 'the unanswered probe brought one new connection'); assert.ok(socks[0].closed, 'the dead socket was closed');
    mute = false; await tick(500);
    assert.equal(socks.length, 2, 'the ping rejected by the reconnect, and its own late timeout, did not reconnect again'); assert.equal(db.online, true);
    // the periodic ping on a socket that dies later: it reconnects instead of shrugging
    mute = true; await until(() => socks.length === 3, 1500, 'the failing periodic ping did not reconnect'); mute = false;
    assert.ok(socks[1].closed); await tick(600); assert.equal(socks.length, 3, 'answered again: stable'); assert.equal(db.online, true);
    // two probes on the same dead socket: one reconnect
    mute = true; db.probe(50); db.probe(50); await tick(150); mute = false;
    assert.equal(socks.length, 4, 'two probes at once replaced the socket once');
    await tick(500); assert.equal(socks.length, 4);
    // between connections: a socket not yet closed is left to its own close; a reconnect waiting out its backoff goes now
    socks[3].readyState = 3; db.probe(50); await tick(120); assert.equal(socks.length, 4, 'a socket that is not open and has no reconnect waiting is left to its own close');
    socks[3].onclose({ code: 1006 }); assert.equal(socks.length, 4, 'closed: the reconnect waits out its backoff (0.5 s and more)');
    db.probe(50); assert.equal(socks.length, 5, 'a probe while it waits connects at once (a push reaching a page that slept through its backoff)');
    await until(() => db.online, 1000, 'the brought-forward connection did not sign on'); await tick(600); assert.equal(socks.length, 5, 'and the backoff timer it replaced did not connect again');
  } finally { db.close(); }
});
