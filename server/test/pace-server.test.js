// The page's paced start against the REAL server code (release 111). The stand-in server of adapter-pace-kit.js words its
// answers as this one does; these tests are the check that it does, at the places the release leans on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { startServer, connect, sleep, appSource, makeIdentity, signText, sessionMsg, directoryDoc, solveSignup, groupDoc, CAPS } from './helpers.js';
import { DEFAULT_LIMITS } from '../src/limits.js';

const B = '/* ===== HUSH ADAPTER BEGIN ===== */', E = '/* ===== HUSH ADAPTER END ===== */';
const all = appSource(), createHushAdapter = new Function(all.slice(all.indexOf(B) + B.length, all.indexOf(E)) + '\nreturn createHushAdapter;')();
const until = async (fn, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms && !fn();) await sleep(25); return fn(); };
const profile = (h) => ({ handle: h, ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' } });

// ---- part C: a watch id ended and used again ----

test('the server answers ok to an unsub of a watch id it never got, takes sub, unsub, sub of one id, and refuses sub, sub as before', async () => {
  const T = await startServer(), c = await connect(T.url);
  try {
    await c.hello(); await c.ok('set', { p: 'directory/alice', d: profile('alice') });
    assert.deepEqual(await c.call('unsub', { s: 77 }), { i: c.i, ok: true }, 'an id the server never got');
    const sub = () => c.call('sub', { s: 5, p: 'directory', ids: ['alice'] });
    assert.equal((await sub()).ok, true);
    assert.equal((await sub()).e, 'conflict', 'the same id again');
    assert.deepEqual(await c.call('unsub', { s: 5 }), { i: c.i, ok: true });
    assert.equal((await sub()).ok, true, 'and after its unsub');
    assert.equal(T.srv.subs.count([...T.srv.conns][0]), 1);
  } finally { await c.close(); await T.stop(); }
});

test('the page\'s adapter, when the reply to a watch does not come in time though the server took the watch: it comes back live under the same id, and the page is not told the watch ended', async () => {
  const T = await startServer();
  // The browser's socket, with the reply to the first watch lost on the way (what a server too slow by half a minute looks like to the page)
  let lost = null, dropped = 0;
  class WS extends WebSocket { send(d) { const f = JSON.parse(d); if (f.op === 'sub' && lost == null) lost = f.i; super.send(d); }
    set onmessage(fn) { super.onmessage = (ev) => { const f = JSON.parse(String(ev.data)); if (f.i === lost && !dropped) { dropped++; return; } fn(ev); }; } get onmessage() { return super.onmessage; } }
  const db = createHushAdapter(T.url, { WebSocket: WS, callTimeoutMs: 300 }), seen = [], ended = [];
  try {
    await db.ready; await db.doc('directory/alice').set(profile('alice'));
    db.doc('directory/alice').onSnapshot((s) => seen.push(s.exists ? s.data().bio || '' : null), (e) => ended.push(e.code));
    const conn = [...T.srv.conns][0];
    assert.ok(await until(() => dropped === 1 && T.srv.subs.count(conn) === 1), 'the server took the watch, the page did not hear so');
    await sleep(2600);   // the reply is late (300 ms here), and the watch is sent again 1 to 2 s after
    assert.deepEqual(ended, [], 'the watch was not ended');
    assert.equal(T.srv.subs.count(conn), 1, 'the server holds it once');
    const n = seen.length; await db.doc('directory/alice').update({ bio: 'still here' });
    assert.ok(await until(() => seen.length > n && seen[seen.length - 1] === 'still here', 3000), 'and it is live: a change arrives');
  } finally { db.close(); await T.stop(); }
});

// ---- part E: a batch of profile reads is 90 at most ----

test('97 profiles of the largest size, asked for in one moment, are all answered: the adapter asks for 90 at most in one request, which the server\'s 24 MB an answer always holds', async () => {
  const T = await startServer(), db = createHushAdapter(T.url, { WebSocket });
  try {
    // a profile as large as the server takes one: a photo of 200 KB and 32 devices, each field at its longest
    const dev = () => ({ x: 'x'.repeat(256), y: 'y'.repeat(256), sx: 'x'.repeat(256), sy: 'y'.repeat(256), s: 's'.repeat(256), nm: 'n'.repeat(400) });
    const big = (h) => ({ ...profile(h), photo: 'A'.repeat(200 * 1024), devs: Object.fromEntries(Array.from({ length: 32 }, (_, k) => ['dev' + String(k).padStart(5, '0'), dev()])) });
    const size = Buffer.byteLength(JSON.stringify(big('u00'))), MB = 1 << 20;
    assert.ok(size <= 256 * 1024 && 97 * size > 24 * MB && 90 * 256 * 1024 <= 24 * MB, 'a profile of ' + size + ' bytes: 97 of them are more than one answer, 90 of any size are not');
    await db.ready; await db.doc('directory/u00').set(big('u00'));   // through the server's own check: it takes a profile this large
    const put = T.srv.store.db.prepare('INSERT INTO docs(path, parent, id, d, ts) VALUES (?, ?, ?, ?, ?)');
    for (let k = 1; k < 97; k++) { const h = 'u' + String(k).padStart(2, '0'); put.run('directory/' + h, 'directory', h, JSON.stringify(big(h)), Date.now()); }
    const hs = Array.from({ length: 97 }, (_, k) => 'u' + String(k).padStart(2, '0'));
    const got = await Promise.allSettled(hs.map((h) => db.doc('directory/' + h).get()));
    const bad = got.filter((r) => r.status !== 'fulfilled').map((r) => r.reason && r.reason.code);
    assert.deepEqual([bad.length, bad[0]], [0, undefined], bad.length + ' of 97 reads refused: ' + bad[0]);
    assert.deepEqual(got.map((r) => r.value.exists && r.value.data().handle), hs, 'each profile answered');
  } finally { db.close(); await T.stop(); }
});

// ---- the whole of it: a start of 150 chats under the real limits ----
// helpers.js lifts three limits for tests that put every client on one address: sign-ups a day, the secured-account rule for
// owning a group, and the server time an address's frames may take a minute. The first two have nothing to do with the pace;
// the third is set back to the server's own here, and the page gets an address of its own, as a device has.
// The time is the allowance's own: 78 s for these frames. The runner's limit of 120 s a test is the file's too (package.json), so
// the test gives up at 104 s, with its own words, and the other tests of this file are a few seconds.

test('a start of 150 chats on the real server under its real limits (about 80 s: 600 frames at 5 a second past the first 209): no frame is refused for any reason, every chat is opened once, every watch is live and every count answered', { timeout: 112000 }, async () => {
  const T = await startServer({ limits: { frameMsPerMinPerAddr: DEFAULT_LIMITS.frameMsPerMinPerAddr } });
  const from = (addr) => ({ headers: { 'x-forwarded-for': addr } });
  const alice = await makeIdentity('alice'), caps = new Map(), cids = Array.from({ length: 150 }, (_, k) => 'g' + String(k).padStart(3, '0') + 'AbCdEfGhI');
  // Alice signs up and makes her 150 groups from another device of hers
  const maker = await connect(T.url, from('10.9.0.1')), h = await maker.hello();
  await maker.ok('prove', { h: 'alice', sig: await signText(alice.sigKey, sessionMsg(h.nonce, 'alice')), pub: alice.sig });
  const pow = await maker.ok('signup.pow'); await maker.ok('set', { p: 'directory/alice', d: directoryDoc(alice), pow: solveSignup(pow.salt, pow.bits) });
  for (const cid of cids) { const c = CAPS(); caps.set(cid, c); await maker.ok('chat.create', { cid, d: groupDoc(), caps: c }); }
  await maker.close();
  // The page, on its own address; every reply it gets is looked at
  const refused = [], sent = { all: 0, open: new Map() };
  class WS extends WebSocket { constructor(url) { super(url, from('10.9.0.2')); }
    send(d) { const f = JSON.parse(d); sent.all++; if (f.op === 'chat.open') sent.open.set(f.cid, (sent.open.get(f.cid) || 0) + 1); super.send(d); }
    set onmessage(fn) { super.onmessage = (ev) => { const f = JSON.parse(String(ev.data)); if (f.ok === false) refused.push(f.e + ': ' + f.m); fn(ev); }; } get onmessage() { return super.onmessage; } }
  const db = createHushAdapter(T.url, { WebSocket: WS, rank: (cid) => cids.indexOf(cid), caps: async (cid) => { await db.preview(cid); return caps.get(cid).o; } });   // the keys from the chat's record, read first (capsFor)
  try {
    await db.ready; await db.prove({ h: 'alice', pub: alice.sig, dev: '', signDev: null, signAcct: (m) => signText(alice.sigKey, m) });
    const t0 = Date.now(), live = new Set(), ended = [], counted = new Set();
    for (const cid of cids) db.doc('channels/' + cid).onSnapshot((s) => { if (s.exists && s.data().keys) live.add(cid); }, (e) => ended.push(e.code));   // as watchInbox starts them
    for (const cid of cids) db.collection('channels/' + cid + '/posts').where('ts', '>', 0).limit(100).get().then(() => counted.add(cid), () => {});   // and computeUnread counts them
    await until(() => (live.size === 150 && counted.size === 150) || refused.length > 0, 104000);
    const took = (Date.now() - t0) / 1000, conn = [...T.srv.conns][0];
    assert.deepEqual(refused, [], 'the server refused nothing');
    assert.deepEqual([live.size, counted.size, ended.length], [150, 150, 0], 'every record watch is live with the whole record, every count answered, no watch ended');
    assert.equal(T.srv.subs.count(conn), 150, 'the server holds a watch for each chat');
    assert.deepEqual([sent.open.size, Math.max(...sent.open.values())], [150, 1], 'each chat opened once');
    assert.ok(took <= 1.2 * (600 - 209) / 5 + 10, 'within the bound of the allowance itself (600 frames, 209 at once, 5 a second, and a fifth): ' + took.toFixed(1) + ' s, ' + sent.all + ' frames');
  } finally { db.close(); await T.stop(); }
});
