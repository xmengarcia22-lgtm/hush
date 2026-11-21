// A switch of account while the connection is down. The adapter dropped the account before's watches only when that account was
// signed in at that moment; a lost connection clears the sign-in, so after a switch made while disconnected the old account's
// watches, the reads it had waiting for a connection and the chats it was opening went out on the new account's connection,
// and the server could tie the two accounts together. Now every change of account drops them, connected or not.
// The adapter runs as written, against a stand-in server.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appSource } from './helpers.js';

const B = '/* ===== HUSH ADAPTER BEGIN ===== */', E = '/* ===== HUSH ADAPTER END ===== */';
const all = appSource(), createHushAdapter = new Function(all.slice(all.indexOf(B) + B.length, all.indexOf(E)) + '\nreturn createHushAdapter;')();
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, m) => { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timeout: ' + m); await tick(5); } };
const who = (h) => ({ h, pub: { x: 'x', y: 'y' }, signAcct: async () => 'sig' });
// A frame by what it is for: 'get c1' (the record read for a chat's keys), 'open c1', 'watch c1' (the record watch), 'query c1/posts'
const what = (f) => f.op === 'get' ? 'get ' + f.p.slice(9) : f.op === 'chat.open' ? 'open ' + f.cid : f.op === 'sub' ? (f.p === 'channels' ? 'watch ' + f.ids[0] : 'sub ' + f.p + (f.ids ? '/' + f.ids[0] : '')) : f.op === 'query' ? 'query ' + f.p.slice(9) : f.op;
function world() {
  const W = { socks: [], sent: [], hold: new Set(), deny: new Set() };   // hold: connections whose sign-in gets no answer; deny: accounts the server refuses
  W.WS = class {
    constructor() { this.n = W.socks.push(this) - 1; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen(); }); }
    send(s) {
      const f = JSON.parse(s); let r, init = false; W.sent.push({ ...f, sock: this.n });
      if (f.op === 'hello') r = { ok: true, nonce: 'n' + this.n, now: Date.now() };
      else if (f.op === 'prove') { if (W.hold.has(this.n)) return; r = W.deny.has(f.h) ? { ok: false, e: 'denied', m: 'no' } : { ok: true }; }
      else if (f.op === 'get') r = { ok: true, id: f.p.split('/').pop(), d: { type: 'dm' } };
      else if (f.op === 'chat.open') r = { ok: true, level: 'member', epoch: 0 };
      else if (f.op === 'query') r = { ok: true, docs: [] };
      else { r = { ok: true }; init = f.op === 'sub'; }
      setTimeout(() => { if (this.readyState !== 1) return; this.onmessage({ data: JSON.stringify({ i: f.i, ...r }) }); if (init) this.onmessage({ data: JSON.stringify({ s: f.s, t: 'init', docs: [] }) }); }, 5);
    }
    close() { this.readyState = 3; }
  };
  W.lose = (n) => { W.socks[n].readyState = 3; W.socks[n].onclose({ code: 1006 }); };   // the connection is lost and the page hears it
  W.on = (n) => W.sent.filter((f) => f.sock === n).map(what);
  return W;
}
// The page's side, as app/ui.js does it: a chat's keys come from its record, read first (capsFor).
const page = (W, extra = {}) => { const db = createHushAdapter('ws://x/ws', { WebSocket: W.WS, caps: async (cid) => { await db.preview(cid); return 'cap-' + cid; }, ...extra }); return db; };
const count = (db, cid) => db.collection('channels/' + cid + '/posts').where('ts', '>', 0).limit(100).get();
const back = async (W, db, n) => { db.probe(50); await until(() => W.socks.length === n + 1 && db.online, 2000, 'connection ' + n + ' did not sign on'); await tick(150); };   // the reconnect that was waiting goes now

test('a switch of account while the connection is down: nothing of the account before goes out on the new account\'s connection', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; await db.prove(who('alice'));
    let live = 0; db.doc('channels/c1').onSnapshot(() => { live++; }, () => {}); await until(() => live, 1000, 'her watch is live');
    W.lose(0);
    const heard = []; for (const c of ['c1', 'c2', 'c3']) count(db, c).then(() => heard.push('answered'), (e) => heard.push(e.code));   // her reads wait for the next connection
    await tick(20); db.prove(who('bob')).catch(() => {});   // the page switches to the other account (start → bindDevice): no sign-out in between
    await back(W, db, 1);
    assert.deepEqual(W.on(1), ['hello', 'prove'], 'the new connection: bob signs in, and neither her watch nor her reads follow');
    assert.equal(W.sent.find((f) => f.sock === 1 && f.op === 'prove').h, 'bob');
    assert.equal(db.proven, 'bob');
  } finally { db.close(); }
});

test('a chat whose keys were still being worked out when the account changed, connected or not, is not opened on the new account\'s connection, nor is the read that waited for it sent there', async () => {
  for (const down of [false, true]) {
    let open; const gate = new Promise((r) => { open = r; });
    const W = world(), db = page(W, { caps: (cid) => gate.then(() => 'cap-' + cid) });
    try {
      await db.ready; await db.prove(who('alice'));
      db.doc('channels/c1').onSnapshot(() => {}, () => {}); count(db, 'c1').catch(() => {});   // both wait for her keys
      await tick(30); if (down) W.lose(0);
      const p = db.prove(who('bob')); p.catch(() => {}); if (down) await back(W, db, 1); else await p;
      open(); await tick(200);
      assert.deepEqual(W.on(1), ['hello', 'prove'], down ? 'switched while disconnected' : 'switched while connected');
    } finally { db.close(); }
  }
});

test('the new account\'s own watches and reads, begun after the switch, go out on its connection', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; await db.prove(who('alice'));
    db.doc('channels/c1').onSnapshot(() => {}, () => {}); await tick(60);
    W.lose(0); db.prove(who('bob')).catch(() => {});
    let live = 0; db.doc('channels/c7').onSnapshot(() => { live++; }, () => {}); const n = count(db, 'c7').then(() => 'answered', (e) => e.code);   // bob's start, before the connection is back
    await back(W, db, 1);
    assert.deepEqual(W.on(1).sort(), ['get c7', 'hello', 'open c7', 'prove', 'query c7/posts', 'watch c7'], 'his chat and nothing of hers');
    assert.deepEqual([live > 0, await n], [true, 'answered']);
  } finally { db.close(); }
});

test('the same account signing in again while the connection is down keeps its watches and its waiting reads', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; await db.prove(who('alice'));
    let live = 0; db.doc('channels/c1').onSnapshot(() => { live++; }, () => {}); await until(() => live, 1000, 'her watch is live');
    W.lose(0); const n = count(db, 'c2').then(() => 'answered', (e) => e.code);
    await tick(20); db.prove(who('alice')).catch(() => {});   // the page starts the same account again
    await back(W, db, 1);
    assert.deepEqual(W.on(1).sort(), ['get c1', 'get c2', 'hello', 'open c1', 'open c2', 'prove', 'query c2/posts', 'watch c1'], 'her watch is sent again and her read goes out');
    assert.equal(await n, 'answered');
  } finally { db.close(); }
});

test('a first sign-in drops nothing: a watch begun before any account was signed in stays', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready;
    let live = 0; db.doc('links/x1').onSnapshot(() => { live++; }, () => {}); await until(() => live, 1000, 'the watch before sign-in is live');   // a new device waiting to be linked
    W.lose(0); db.prove(who('alice')).catch(() => {});
    await back(W, db, 1);
    assert.deepEqual(W.on(1), ['hello', 'prove', 'sub links/x1'], 'the watch is sent again after the sign-in');
  } finally { db.close(); }
});

test('a read that was waiting for the old account\'s sign-in to finish when the account changed is not sent on the new account\'s connection', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; await db.prove(who('alice'));
    W.hold.add(1); W.lose(0); db.probe(50); await until(() => W.on(1).includes('prove'), 2000, 'her sign-in on the second connection is under way');
    const n = count(db, 'c1').then(() => 'answered', (e) => e.code);   // waits for that sign-in
    await tick(20); db.prove(who('bob')).catch(() => {});
    await until(() => W.socks.length === 3 && db.online, 2000, 'bob\'s connection'); await tick(150);
    assert.deepEqual(W.on(2), ['hello', 'prove'], 'bob\'s connection carries his sign-in only');
    assert.deepEqual(W.on(1), ['hello', 'prove'], 'and nothing of hers went out unsigned either');
    assert.equal(await n, 'offline', 'her read is told there is no connection');
  } finally { db.close(); }
});

test('an account the server refused to sign in, then another account: a new connection, not the one that carries the first one\'s name', async () => {
  const W = world(), db = page(W);
  try {
    await db.ready; W.deny.add('alice');
    assert.equal(await db.prove(who('alice')).then(() => 'in', (e) => e.code), 'denied');
    db.doc('channels/c1').onSnapshot(() => {}, () => {}); await tick(60);
    await db.prove(who('bob'));
    assert.equal(W.sent.find((f) => f.op === 'prove' && f.h === 'bob').sock, 1, 'bob signs in on a connection of his own');
    await tick(150); assert.deepEqual(W.on(1), ['hello', 'prove']);
  } finally { db.close(); }
});

test('the new account opens a chat for itself: it does not wait on an open of the same chat that the account before had begun', async () => {
  let open; const gate = new Promise((r) => { open = r; });
  const W = world(), db = page(W, { caps: (cid) => gate.then(() => 'cap-' + cid) });
  try {
    await db.ready; await db.prove(who('alice'));
    count(db, 'c1').catch(() => {}); await tick(30);   // her open of c1 is under way
    await db.prove(who('bob'));
    const n = count(db, 'c1').then(() => 'answered', (e) => e.code);   // his read of the same chat
    await tick(30); open(); await tick(200);
    assert.deepEqual(W.on(1), ['hello', 'prove', 'open c1', 'query c1/posts'], 'opened once, by him, then his read');
    assert.equal(await n, 'answered');
  } finally { db.close(); }
});
