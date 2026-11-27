// What the paced-start tests share (release 111): the page's adapter as written, lifted out of app/adapter.js, and a stand-in
// server that counts every frame with the real server's own bucket (src/limits.js) and words its answers as the server does.
// Not a test file: adapter-pace*.test.js import it.
import { appSource } from './helpers.js';
import { TokenBucket } from '../src/limits.js';

const B = '/* ===== HUSH ADAPTER BEGIN ===== */', E = '/* ===== HUSH ADAPTER END ===== */';
export const adapterOf = (src) => new Function(src.slice(src.indexOf(B) + B.length, src.indexOf(E)) + '\nreturn createHushAdapter;')();
export const createHushAdapter = adapterOf(appSource());
export const tick = (ms) => new Promise((r) => setTimeout(r, ms));
export const range = (a, b) => Array.from({ length: b - a }, (_, k) => a + k);
export const cidOf = (k) => 'c' + String(k).padStart(3, '0');
export const who = (h) => ({ h, pub: { x: 'x', y: 'y' }, signAcct: async () => 'sig' });
// A frame by what it is for: 'get c003' (the record read), 'open c003', 'watch c003' (the record watch), 'sub c003/call',
// 'query c003/posts', 'base c003'
export const what = (f) => f.op === 'get' ? 'get ' + f.p.slice(9) : f.op === 'chat.open' ? 'open ' + f.cid : f.op === 'chat.base' ? 'base ' + f.cid
  : f.op === 'sub' ? (f.p === 'channels' ? 'watch ' + f.ids[0] : 'sub ' + f.p.replace(/^channels\//, '')) : f.op === 'query' ? 'query ' + f.p.slice(9) : f.op;
const QUERY = /^(query|mget|chat\.(invite|mine|slots))$/;   // what the server counts as a query (protocol.js)

// A clock that runs k times as fast, for the page's own count (performance.now) and for the stand-in's buckets alike, so a
// minute of allowance passes in 60 / k seconds. Round trips and the adapter's timers stay real. off() puts the clock back.
export function fast(k) {
  const real = performance.now, t0 = real.call(performance), now = () => t0 + (real.call(performance) - t0) * k;
  performance.now = now;
  return { now, off() { performance.now = real; } };
}

// The stand-in server. Every frame is counted against a TokenBucket as the server counts it and answered after `rtt` ms
// (a number, or rtt(frame, socket) for answers that come back apart).
//   fpm    the frames a minute it really allows; `told` is what its hello says (its own, unless a test says otherwise)
//   old    a server from before release 100: no allowance at hello, no `retry` in a refusal, a keep-alive refused like any frame
//   qpm    its query allowance (120 at once, then 2 a second, on the real server); 0 leaves queries uncounted
//   now    the clock its buckets run on (fast().now), else the real one
//   on     a test's own answer: on(frame, socket) returns a reply object, 'drop' for no answer at all, or nothing
// It keeps: sent (every frame, with its socket and time), over (refused for the frame allowance), qover (refused for the query
// allowance), conflicts (a watch id it already held, refused as server/src/subs.js does), and on each socket the watch ids held.
export function world({ fpm = 60, told = fpm, old = false, rtt = 5, qpm = 0, now = null, on = null } = {}) {
  const clock = now || (() => Date.now());
  const W = { socks: [], sent: [], over: [], qover: [], conflicts: [], on };
  W.push = (n, o) => { const s = W.socks[n]; if (s && s.readyState === 1) s.onmessage({ data: JSON.stringify(o) }); };
  W.WS = class {
    constructor() {
      this.n = W.socks.push(this) - 1; this.readyState = 0; this.held = new Map();
      this.bucket = new TokenBucket(fpm, fpm / 60); this.queries = qpm ? new TokenBucket(qpm, qpm / 60) : null;
      setTimeout(() => { this.readyState = 1; this.onopen(); });
    }
    send(s) {
      const f = JSON.parse(s), rec = { ...f, sock: this.n, at: Date.now() }; let r, init = null;
      W.sent.push(rec);
      const mine = W.on ? W.on(f, this, rec) : undefined;
      if (mine === 'drop') return;
      if (!this.bucket.take(1, clock())) { W.over.push(rec); r = !old && f.op === 'ping' ? { ok: true, now: Date.now() } : { ok: false, e: 'ratelimit', m: 'slow down', ...(old ? {} : { retry: Math.ceil(60000 / fpm) }) }; }
      else if (mine) r = mine;
      else if (f.op === 'hello') r = { ok: true, nonce: 'n' + this.n, now: Date.now(), limits: old ? {} : { framesPerMin: told } };
      else if (this.queries && QUERY.test(f.op) && !this.queries.take(1, clock())) { W.qover.push(rec); r = { ok: false, e: 'ratelimit', m: 'too many queries, slow down' }; }
      else if (f.op === 'get') r = { ok: true, id: f.p.split('/').pop(), d: { type: 'dm' } };
      else if (f.op === 'chat.open') r = { ok: true, level: 'member', epoch: 0 };
      else if (f.op === 'query') r = { ok: true, docs: [] };
      else if (f.op === 'mget') r = { ok: true, docs: f.ps.map((p) => ({ id: p.split('/').pop(), d: null })) };
      else if (f.op === 'chat.mine') r = { ok: true, ids: [] };
      else if (f.op === 'chat.slots') r = { ok: true, tags: [] };
      else if (f.op === 'unsub') { this.held.delete(f.s); r = { ok: true }; }
      else if (f.op === 'sub') {
        if (this.held.has(f.s)) { W.conflicts.push(rec); r = { ok: false, e: 'conflict', m: 'subscription id already in use' }; }
        else { this.held.set(f.s, f); r = { ok: true }; init = { s: f.s, t: 'init', docs: f.p === 'channels' && f.ids ? f.ids.map((id) => ({ id, d: { type: 'dm', full: 1 } })) : [] }; }
      }
      else r = { ok: true };
      setTimeout(() => { if (this.readyState !== 1) return; this.onmessage({ data: JSON.stringify({ i: f.i, ...r }) }); if (init) this.onmessage({ data: JSON.stringify(init) }); }, typeof rtt === 'function' ? rtt(f, this) : rtt);
    }
    close() { this.readyState = 3; }
  };
  return W;
}
// The page's side, as app/ui.js does it. Its keys for a chat come from the chat's record, read first (capsFor).
export function page(W, extra = {}) {
  const db = createHushAdapter('ws://x/ws', { WebSocket: W.WS, caps: async (cid) => { await db.preview(cid); return 'cap-' + cid; }, ...extra });
  return db;
}
// The same, with the record kept once it was read (capsFor keeps it in S.chatDocs), so a chat's next open costs one frame.
export function pageKept(W, extra = {}) {
  const read = new Set(), db = page(W, { caps: async (cid) => { if (!read.has(cid)) { read.add(cid); await db.preview(cid); } return 'cap-' + cid; }, ...extra });
  return db;
}
// A start with `n` chats, the one-on-one chats among them given by number: a watch on every chat's record, then an unread
// count for every chat, then a call watch and chat.base for each one-on-one chat, as the page asks for them. `live` fills as
// the record watches go live; `ended` holds the watches the adapter gave up, `trimmed` the chats shown from the copy anyone
// signed in may read (what the adapter shows of a chat it holds no key for).
export function start(db, n, dms = [], { counts = true } = {}) {
  const live = new Set(), ended = [], trimmed = [];
  for (const k of range(0, n)) db.doc('channels/' + cidOf(k)).onSnapshot((s) => { if (s.exists && s.data().full) live.add(cidOf(k)); else if (s.exists) trimmed.push(cidOf(k)); }, (e) => ended.push(cidOf(k) + ' ' + (e && e.code)));
  if (counts) for (const k of range(0, n)) count(db, cidOf(k)).catch(() => {});
  for (const k of dms) { callWatch(db, cidOf(k)); db.setBase(cidOf(k), 'base').catch(() => {}); }
  return { live, ended, trimmed };
}
export const count = (db, cid) => db.collection('channels/' + cid + '/posts').where('ts', '>', 0).limit(100).get();   // computeUnread's query: no order
export const callWatch = (db, cid) => db.collection('channels/' + cid + '/call').orderBy('ts', 'desc').limit(50).onSnapshot(() => {}, () => {});   // syncCallWatch's
export const openChat = (db, cid, cb = () => {}) => db.collection('channels/' + cid + '/posts').orderBy('ts', 'desc').limit(300).onSnapshot(cb, () => {});   // openConv's
export const refused = (W) => W.over.length + ' refused: ' + W.over.slice(0, 6).map(what).join(', ');
export const lose = (W, n) => { W.socks[n].readyState = 3; W.socks[n].onclose({ code: 1006 }); };
export const back = async (W, db, n) => { lose(W, n); db.probe(50); for (let k = 0; k < 400 && !(db.online && W.socks.length > n + 1); k++) await tick(5); };   // the connection lost, and made again at once
export const at = (W, name, from = 0) => { const k = W.sent.findIndex((f, j) => j >= from && what(f) === name); return k; };
