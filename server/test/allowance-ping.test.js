// The frame allowance and the keep-alive (release 100). A page with many chats spends its 300 frames at start (about 4 a chat), and
// its keep-alive ping was then refused like any frame: the page took that for a dead socket and reconnected, which started the
// whole load again. Now the one frame that is exactly the adapter's ping, {"i":N,"op":"ping"}, is answered over the frame allowance
// too: still unparsed, with no token given and the socket still not read for a moment, so it is no way around the allowance. Every
// other frame hears ratelimit as before, now with `retry`, the milliseconds before asking again is any use. And the hello reply
// tells the page the allowance, so a page can pace itself by the server's number instead of a copy of it. Raw protocol clients, and
// the page's adapter as written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { startServer, connect, sleep, appSource } from './helpers.js';

const drain = (conn) => { conn.frames.tokens = 0; conn.frames.perSecond = 0; };   // nothing left and nothing coming back, however long the test machine takes
const limited = (i, retry) => ({ i, ok: false, e: 'ratelimit', m: 'slow down', retry });
const BAD = { ok: false, e: 'invalid', m: 'frame needs an integer "i" and a string "op"' };
const withConn = async (limits, fn) => {
  const T = await startServer({ limits }), c = await connect(T.url);
  try { await fn(c, () => [...T.srv.conns][0], T); } finally { await c.close(); await T.stop(); }
};

test('over the frame allowance the exact keep-alive ping is answered as always, with no token given and the wait kept; the frame after it hears ratelimit', async () => {
  await withConn({ framesPerMin: 60 }, async (c, conn) => {
    await c.hello();
    const within = await c.call('ping');
    drain(conn());
    let pauses = 0; const ws = conn().ws, pause = ws.pause.bind(ws); ws.pause = () => { pauses++; pause(); };
    const r = await c.call('ping');
    assert.deepEqual([r.i, r.ok, typeof r.now, Object.keys(r).sort()], [c.i, true, 'number', Object.keys(within).sort()], 'the same reply as within the allowance');
    assert.equal(pauses, 1, 'the socket is still not read for a moment');
    assert.ok(conn().frames.tokens < 1, 'no token was given: ' + conn().frames.tokens);
    assert.equal(conn().badCount, 0);
    assert.deepEqual(await c.call('get', { p: 'directory/alice' }), limited(c.i, 1000), 'anything else is refused, and told when to ask again: one frame\'s refill at 60 a minute');
  });
});

test('only that exact frame: spaces, another order, another field, a longer op, a trailing byte, a line after it, a negative i or an i written with a leading zero hear ratelimit; a binary one or an i too long is a bad frame, as before', async () => {
  await withConn({ framesPerMin: 60 }, async (c, conn) => {
    await c.hello();
    for (const [i, frame] of [[21, '{ "i" : 21 , "op" : "ping" }'], [22, '{"i":22,"op":"ping","x":1}'], [23, '{"op":"ping","i":23}'], [-24, '{"i":-24,"op":"ping"}'], [25, '{"i":25,"op":"pings"}'], [26, '{"i":26,"op":"ping"} '], [27, '{"i":27,"op":"PING"}'], [28, '{"i":28,"op":"ping"}{"i":29,"op":"ping"}'],
      [31, '{"i":31,"op":"ping"}\n'], [32, '{"i":32,"op":"ping"}\n{}'], [33, '{"i":033,"op":"ping"}'], [0, '{"i":00,"op":"ping"}']]) {
      drain(conn()); c.ws.send(frame);
      assert.deepEqual(await c.waitPush((f) => f.i === i), limited(i, 1000), frame);
    }
    for (const frame of ['{"i":1234567890123456,"op":"ping"}', Buffer.from('{"i":30,"op":"ping"}')]) {
      drain(conn()); c.ws.send(frame);
      assert.deepEqual(await c.waitPush((f) => f.e === 'invalid'), BAD, String(frame));
    }
    assert.equal(conn().badCount, 2);
    for (const i of [0, 123456789012345]) {   // and the ping it is, with the smallest and the longest i a page can count to
      drain(conn()); c.ws.send('{"i":' + i + ',"op":"ping"}');
      assert.deepEqual((({ i, ok }) => [i, ok])(await c.waitPush((f) => f.i === i)), [i, true]);
    }
  });
});

test('a ping the byte allowance refuses, and one sent before hello, are refused like any frame', async () => {
  await withConn({ framesPerMin: 60, bytesPerMin: 6000 }, async (c, conn) => {
    drain(conn());
    assert.deepEqual(await c.call('ping'), limited(c.i, 1000), 'before hello nothing is answered over the allowance');
    conn().frames.tokens = 5;   // frames to spare again
    await c.hello();
    conn().bytes.tokens = 0; conn().bytes.perSecond = 0;   // and no bytes
    const frame = JSON.stringify({ i: ++c.i, op: 'ping' });
    c.ws.send(frame);
    assert.deepEqual(await c.waitPush((f) => f.i === c.i), limited(c.i, Math.ceil(frame.length * 60000 / 6000)), 'told when its bytes will be back');
  });
});

test('pings over the allowance are never bad frames: twelve in a row and the connection is still there, each answered in its turn', async () => {
  await withConn({ framesPerMin: 6 }, async (c, conn) => {
    await c.hello(); drain(conn());
    const rs = await Promise.all(Array.from({ length: 12 }, () => c.call('ping')));
    assert.deepEqual(rs.map((r) => r.ok), Array(12).fill(true));
    assert.deepEqual([conn().badCount, conn().closed, c.ws.readyState], [0, false, WebSocket.OPEN]);
    assert.ok(conn().frames.tokens < 1, 'and the allowance is where it was');
  });
});

test('the hello reply tells the page the frame allowance, this server\'s own number', async () => {
  await withConn({}, async (c) => { assert.equal((await c.hello()).limits.framesPerMin, 300); });
  await withConn({ framesPerMin: 77 }, async (c) => { assert.equal((await c.hello()).limits.framesPerMin, 77); });
});

test('at the default allowance a refused frame is told to wait 200 ms, one frame\'s refill; a part of a millisecond is rounded up, never down', async () => {
  await withConn({}, async (c, conn) => {
    await c.hello(); drain(conn());
    assert.deepEqual(await c.call('get', { p: 'directory/alice' }), limited(c.i, 200));
  });
  await withConn({ framesPerMin: 7 }, async (c, conn) => {
    await c.hello(); drain(conn());
    assert.deepEqual(await c.call('get', { p: 'directory/alice' }), limited(c.i, 8572), '60000 / 7 = 8571.4');
  });
});

// The page as it is live today (release 109's adapter, the same as 108's): its keep-alive treats any failed ping as a dead socket.
const B = '/* ===== HUSH ADAPTER BEGIN ===== */', E = '/* ===== HUSH ADAPTER END ===== */';
const all = appSource(), createHushAdapter = new Function(all.slice(all.indexOf(B) + B.length, all.indexOf(E)) + '\nreturn createHushAdapter;')();

test('the page\'s adapter, over its allowance for several keep-alives, keeps its one connection', async () => {
  const T = await startServer({ limits: { framesPerMin: 6 } });
  let made = 0, pings = 0; class WS extends WebSocket { constructor(...a) { super(...a); made++; } send(d) { if (/"op":"ping"/.test(d)) pings++; super.send(d); } }
  const statuses = [], db = createHushAdapter(T.url, { WebSocket: WS, pingMs: 250, onStatus: (on) => statuses.push(on) });
  try {
    await db.ready;
    const [conn] = T.srv.conns; drain(conn);
    await sleep(1400);   // five keep-alives, all over the allowance (6 a minute refills one frame in 10 s)
    assert.ok(pings >= 3 && conn.frames.tokens < 1, pings + ' keep-alives went out, all over the allowance: ' + conn.frames.tokens);
    assert.deepEqual([made, T.srv.conns.has(conn), db.online, statuses.includes(false)], [1, true, true, false]);
  } finally { db.close(); await T.stop(); }
});
