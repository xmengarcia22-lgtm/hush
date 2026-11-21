// A frame's allowances (SPEC.md 9.4) come before it is parsed: one address could otherwise keep the single thread busy parsing large
// junk frames, whatever each op charges. Over the allowance a frame is not parsed at all; its first bytes give the `i` a page relies on
// (the adapter sends it first), and a frame with none there, or a binary one, is a bad frame as it always was. And the socket is not read
// for a moment: reading and checking each frame costs the thread more than parsing it did. Within the allowance nothing changes. Raw
// protocol clients.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, connect, sleep } from './helpers.js';

const KB88 = 88 * 1024, junk = (i) => JSON.stringify({ i, op: 'ping', x: 'a'.repeat(KB88) });
// Every string over 1 KB that JSON.parse is handed while `fn` runs (replies to the test's own clients are short).
async function bigParses(fn) {
  const real = JSON.parse, big = [];
  JSON.parse = function (s, r) { if (typeof s === 'string' && s.length > 1024) big.push(s.length); return real.call(this, s, r); };
  try { await fn(); } finally { JSON.parse = real; }
  return big;
}
const withClient = async (limits, fn) => {
  const T = await startServer({ limits }), c = await connect(T.url);
  try { await fn(c); } finally { await c.close(); await T.stop(); }
};
// `retry` (release 100): the milliseconds before asking again is any use, one frame's refill or the frame's own bytes'
const limited = (retry) => ({ ok: false, e: 'ratelimit', m: 'slow down', retry });

test('a frame over its frame allowance is not parsed: large ones, the review\'s 88 KB junk pings, cost no JSON.parse, and each still hears ratelimit with its own i', async () => {
  await withClient({ framesPerMin: 2 }, async (c) => {
    await c.hello(); await c.ok('ping');
    const rs = [];
    const big = await bigParses(async () => { for (let n = 0; n < 5; n++) { c.ws.send(junk(1000 + n)); rs.push(await c.waitPush((f) => f.i === 1000 + n)); } });
    assert.deepEqual(big, [], 'nothing large was parsed');
    assert.deepEqual(rs, [0, 1, 2, 3, 4].map((n) => ({ i: 1000 + n, ...limited(30000) })));
  });
});

test('a frame over its byte allowance is not parsed either, hears ratelimit with its own i, and costs the bytes nothing: the small frame after it goes through', async () => {
  await withClient({ bytesPerMin: 10_000 }, async (c) => {
    await c.hello();
    let r;
    const big = await bigParses(async () => { c.ws.send(junk(77)); r = await c.waitPush((f) => f.i === 77); });
    assert.deepEqual([big, r], [[], { i: 77, ...limited(Math.ceil(junk(77).length * 60000 / 10_000)) }]);
    assert.equal((await c.ok('ping')).ok, true);
  });
});

test('small rate-limited frames keep their own i, the adapter\'s frame and any frame with its i in its first bytes', async () => {
  await withClient({ framesPerMin: 1 }, async (c) => {
    await c.hello();
    for (const [i, frame] of [[11, { i: 11, op: 'ping', x: 1 }], [12, { i: 12, op: 'get', p: 'directory/alice' }], [13, { op: 'ping', i: 13 }], [-14, { i: -14, op: 'ping' }], [0, { i: 0, op: 'unsub', s: 's1' }]]) {
      c.ws.send(JSON.stringify(frame));
      assert.deepEqual(await c.waitPush((f) => f.i === i), { i, ...limited(60000) });
    }
    c.ws.send('{ "i" : 15 , "op" : "ping" }');
    assert.deepEqual(await c.waitPush((f) => f.i === 15), { i: 15, ...limited(60000) }, 'with spaces too');
    assert.deepEqual(await c.call('get', { p: 'directory/alice' }), { i: c.i, ...limited(60000) }, 'the test client\'s own way, as the adapter sends it (its keep-alive ping apart: allowance-ping.test.js)');
  });
});

test('over the allowance a frame with no i in its first bytes, one whose i is no whole number, or a binary one, is a bad frame, unparsed: answered as a bad frame, counted, and the fifth closes the connection', async () => {
  await withClient({ framesPerMin: 1 }, async (c) => {
    await c.hello();
    const BAD = { ok: false, e: 'invalid', m: 'frame needs an integer "i" and a string "op"' }, frames = [];
    c.ws.on('message', (m) => frames.push(JSON.parse(String(m))));
    const big = await bigParses(async () => {
      c.ws.send('x'.repeat(KB88)); c.ws.send(JSON.stringify({ op: 'ping', x: 'a'.repeat(KB88), i: 5 })); c.ws.send('{"i":1.5,"op":"ping"}'); c.ws.send(Buffer.from('{"i":3,"op":"ping"}'));
      for (let t = 0; t < 100 && frames.length < 4; t++) await sleep(50);
      assert.deepEqual(frames, [BAD, BAD, BAD, BAD]);
      c.ws.send('not json');
      assert.equal((await c.closed).reason, 'too many bad frames');
    });
    assert.deepEqual(big, [], 'none parsed');
  });
});

test('within the allowance nothing changes: a large frame is parsed and answered, each kind of bad frame hears what it always heard, and the fifth closes the connection', async () => {
  await withClient({}, async (c) => {
    await c.hello();
    assert.equal((await c.call('ping', { x: 'a'.repeat(KB88) })).ok, true);
    const frames = [];
    c.ws.on('message', (m) => frames.push(JSON.parse(String(m))));
    c.ws.send('not json'); c.ws.send('[1]'); c.ws.send('{"op":"ping"}'); c.ws.send(Buffer.from('{"i":3,"op":"ping"}'));
    await sleep(100);
    assert.deepEqual(frames, [{ ok: false, e: 'invalid', m: 'frame is not JSON' }, { ok: false, e: 'invalid', m: 'frame must be a JSON object' }, { ok: false, e: 'invalid', m: 'frame needs an integer "i" and a string "op"' }, { ok: false, e: 'invalid', m: 'frame must be a JSON object' }]);
    assert.equal((await c.ok('ping')).ok, true, 'a good frame in between is fine');
    c.ws.send('5');
    assert.equal((await c.closed).reason, 'too many bad frames');
  });
});

test('a bad frame costs its allowance like any other, since the allowance comes first', async () => {
  await withClient({ framesPerMin: 3 }, async (c) => {
    await c.hello();
    c.ws.send('not json');
    await c.waitPush((f) => f.m === 'frame is not JSON');
    assert.equal((await c.call('ping')).ok, true, 'the third');
    assert.deepEqual(await c.call('get', { p: 'directory/alice' }), { i: c.i, ...limited(20000) }, 'the fourth');
  });
});

test('over its allowance a socket is not read for a moment, so a flood of large frames waits on its own socket instead of the server\'s one thread: their refusals come about 200 ms apart, each with its own i, and the frames not yet read wait, unrefused', async () => {
  await withClient({ framesPerMin: 1 }, async (c) => {
    await c.hello();
    const heard = [];
    c.ws.on('message', (m) => { const f = JSON.parse(String(m)); if (f.i >= 2000) heard.push([f.i, Date.now()]); });
    for (let n = 0; n < 5; n++) c.ws.send(junk(2000 + n));
    for (let t = 0; t < 200 && heard.length < 5; t++) await sleep(20);
    assert.deepEqual(heard.map((h) => h[0]), [2000, 2001, 2002, 2003, 2004], 'in order, none lost');
    assert.ok(heard[4][1] - heard[0][1] >= 600, 'five large frames took ' + (heard[4][1] - heard[0][1]) + ' ms');
  });
});

test('a socket waiting to be read still gets what is pushed to it, reads again after the wait, and is cleaned up if the other end goes away meanwhile', async () => {
  const T = await startServer({ limits: { framesPerMin: 60 } }), c = await connect(T.url);
  try {
    await c.hello();
    const [conn] = T.srv.conns;
    while (conn.frames.take());   // nothing left in the bucket
    c.ws.send(junk(3000));
    assert.deepEqual(await c.waitPush((f) => f.i === 3000), { i: 3000, ...limited(1000) });
    assert.equal(conn.waiting, true, 'waiting');
    conn.send({ s: 'x', t: 'marker' });
    await c.waitPush((f) => f.t === 'marker');
    await sleep(1100);   // one frame's refill at 60 a minute, and the 200 ms
    assert.equal(conn.waiting, false);
    assert.equal((await c.call('ping')).ok, true, 'it reads and answers again');
    while (conn.frames.take());
    c.ws.send(junk(3001)); await c.waitPush((f) => f.i === 3001);
    await sleep(300);   // the wait over; many small frames at once make one wait, not one each
    let pauses = 0; const pause = conn.ws.pause.bind(conn.ws); conn.ws.pause = () => { pauses++; pause(); };
    while (conn.frames.take());
    for (let n = 0; n < 40; n++) c.ws.send(JSON.stringify({ i: 4000 + n, op: 'ping' }));
    await c.waitPush((f) => f.i === 4039);
    assert.ok(pauses < 40, pauses + ' waits for 40 frames');
    while (conn.frames.take());
    c.ws.send(junk(3002)); await c.waitPush((f) => f.i === 3002);
    await c.close();
    for (let t = 0; t < 100 && T.srv.conns.has(conn); t++) await sleep(20);
    assert.ok(!T.srv.conns.has(conn), 'gone from the server');
  } finally { await T.stop(); }
});
