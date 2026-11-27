// The harness of the release 111 page-level pace tests (pace-page-queue.test.js, pace-unread-starve.test.js): the page's two
// halves together, as written. The whole of app/adapter.js runs (the adapter block, and connectServer with the options the
// page really hands the adapter), with these units of app/ui.js beside it in one scope, as the page's script files share
// one: computeUnread, listRank with the listSeq statement, drawRow. Around them:
//  - a clock that only moves when the test moves it. setTimeout, setInterval, performance.now and Date.now inside the lifted
//    code are the clock's, so 130 seconds of a start take a moment and a loaded PC changes no number;
//  - a stand-in server inside the test process, no port and no network: the per-connection allowances as server/src/limits.js
//    keeps them (300 frames, then 5 a second; 120 queries, then 2 a second), refusals worded as server/src/protocol.js words
//    them, every frame logged with the clock's time (and what the frame allowance held after it, `left`). A reply takes `rt` ms;
//  - stand-ins for the rest of the page: capsFor reads the chat's record once and keeps it (as the page's does through
//    S.chatDocs), a post opens as itself, the screen is a counter.
// WHAT IT DOES NOT SEE: the real server and its per-address budgets (the release's proof runs those), the sign-in, the real
// sealing, watchInbox (pace-page-inbox.test.js), a browser's timers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ADAPTER = readFileSync(new URL('../../app/adapter.js', import.meta.url), 'utf8');
const UI = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const lift = (from, to) => { const a = UI.indexOf(from); assert.ok(a >= 0, 'app/ui.js holds ' + from); const b = UI.indexOf(to, a + from.length); assert.ok(b > a, 'app/ui.js holds ' + to); return UI.slice(a, b); };
const flush = () => new Promise((r) => setImmediate(r));   // every promise step that is ready runs before this returns

// A clock the test moves. run(ms) runs every timer that falls due in the next ms, in order, letting the promises settle in between.
// stepDate(ms) moves the wall clock (Date.now) and nothing else, as a phone whose clock is set does.
export function clock() {
  let now = 0, seq = 0, q = [], dateOff = 0;
  const add = (fn, ms, every) => { const t = { at: now + Math.max(0, Number(ms) || 0), seq: seq++, fn, every }; q.push(t); return t; };
  const clear = (t) => { if (t && typeof t === 'object') t.off = true; };
  async function run(ms) { const until = now + ms;
    for (;;) { await flush(); q = q.filter((t) => !t.off); let k = -1;
      for (let i = 0; i < q.length; i++) if (k < 0 || q[i].at < q[k].at || (q[i].at === q[k].at && q[i].seq < q[k].seq)) k = i;
      if (k < 0 || q[k].at > until) { now = until; return; }
      const t = q[k]; now = Math.max(now, t.at);
      if (t.every) { t.at = now + t.every; t.seq = seq++; } else q.splice(k, 1);
      t.fn(); } }
  return { run, now: () => now, setTimeout: (fn, ms, ...a) => add(() => fn(...a), ms), clearTimeout: clear, setInterval: (fn, ms) => add(fn, ms, Math.max(1, ms)), clearInterval: clear,
    performance: { now: () => now }, Date: { now: () => 1.8e12 + now + dateOff }, stepDate: (ms) => { dateOff += ms; } };
}

// The stand-in server. `record(cid)`: what channels/<cid> holds (null: no such chat). Every count query is answered with two
// posts from someone else, so a right badge is 2 and a made-up one is 1; `posts(cid)`, when given, is how many a chat's count
// is answered with at that moment. `on(f, x)`, when given, may answer a frame that passed the frame allowance itself (x.reply, x.push,
// x.row; return true), as mailbox-kit.js answers the mailbox and the vault; anything it leaves goes on as here. `doc(path)`, when given, is
// what an mget answers for a path (else nothing there).
export function server(clk, { rt = 2, record = () => ({ type: 'group', name: 'g' }), posts = () => 2, on = null, doc = null } = {}) {
  class Bucket { constructor(cap, perSec) { this.cap = cap; this.ps = perSec; this.t = cap; this.at = clk.now(); }
    take() { const n = clk.now(); this.t = Math.min(this.cap, this.t + (n - this.at) / 1000 * this.ps); this.at = n; if (this.t >= 1) { this.t--; return true; } return false; } }
  const srv = { log: [], frames: 0, frameRefused: 0, queries: 0, queryRefused: 0, sockets: 0 };
  srv.of = (op, pick = (f) => f.cid) => srv.log.filter((f) => f.op === op).map(pick);   // the frames of one kind, in the order the server got them
  srv.WS = class {
    constructor() { srv.sockets++; this.readyState = 0; this.fr = new Bucket(300, 5); this.qr = new Bucket(120, 2); clk.setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 5); }
    send(data) { const f = JSON.parse(data), p = f.p || ''; srv.frames++;
      const push = (o) => clk.setTimeout(() => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: JSON.stringify(o) }); }, rt), reply = (o) => push(Object.assign({ i: f.i }, o));
      const cid = f.cid || (/^channels\/([^/]+)/.exec(p) || [])[1] || (p === 'channels' && f.ids && f.ids.length === 1 ? f.ids[0] : null);
      const row = { at: clk.now(), op: f.op, p, cid, s: f.s, ok: true }; srv.log.push(row);
      if (!this.fr.take()) { srv.frameRefused++; row.ok = false; return reply({ ok: false, e: 'ratelimit', m: 'slow down', retry: 200 }); }
      row.left = this.fr.t;   // what the frame allowance held after it
      if (f.op === 'hello') return reply({ ok: true, nonce: 'n', now: clk.Date.now(), v: 1, limits: { framesPerMin: 300 } });
      if (on && on(f, { reply, push, row, sock: this })) return;
      if (f.op === 'query' || f.op === 'mget') { if (!this.qr.take()) { srv.queryRefused++; row.ok = false; return reply({ ok: false, e: 'ratelimit', m: 'too many queries, slow down' }); } srv.queries++;
        return reply({ ok: true, docs: f.op === 'mget' ? (f.ps || []).map((x) => ({ id: x.split('/').pop(), d: doc ? doc(x) : null })) : Array.from({ length: posts(cid) }, (_, i) => ({ id: 'p' + (i + 1), d: { ts: 5 + i, from: 'peer' } })) }); }
      if (f.op === 'get') { const d = /^channels\/[^/]+$/.test(p) ? record(cid) : null; return reply(d ? { ok: true, id: cid, d } : { ok: true, id: p.split('/').pop(), d: null }); }
      if (f.op === 'chat.open') return reply({ ok: true, level: 'member', epoch: 0 });
      if (f.op === 'sub') { reply({ ok: true }); return push({ s: f.s, t: 'init', docs: p === 'channels' && record(cid) ? [{ id: cid, d: record(cid) }] : [] }); }
      return reply({ ok: true }); }
    close() { this.readyState = 3; }
  };
  return srv;
}

// The page: connectServer as written in app/adapter.js makes the adapter, with the page's own options. `kept`: the rows of the
// chat list as last drawn (hush:list:<me>, in the sealed store). The clock must be run for the connection to come up: start().
export function page(clk, srv, { me = 'alice', kept = null } = {}) {
  const store = {}; if (kept) store['hush:list:' + me] = JSON.stringify(kept);
  const S = { me: { handle: me }, convs: [], convsLoaded: false, chan: null, wantOpen: null, pushCall: null, unread: new Map(), mentions: new Map(), unreadKey: new Map(), badges: {}, db: null };
  const ls = { get: (k, d) => (k in store ? JSON.parse(store[k]) : d), set: (k, v) => { store[k] = JSON.stringify(v); } };
  const seen = new Set(), stats = { drawn: 0, opened: [] }, noop = () => {};
  const capsFor = async (cid) => { if (!seen.has(cid)) { const s = await S.db.preview(cid); if (!s.exists) return null; seen.add(cid); } return 'cap-' + cid; };   // one read of the record, then kept
  class E { constructor(tag, cls, text) { this.tag = tag; this.className = cls || ''; this.text = text == null ? '' : String(text); this.kids = []; } append(...k) { this.kids.push(...k); } insertAdjacentHTML() {} }
  const env = { WebSocket: srv.WS, fetch: async () => { throw new Error('no network in this test'); }, setTimeout: clk.setTimeout, clearTimeout: clk.clearTimeout, setInterval: clk.setInterval, clearInterval: clk.clearInterval,
    performance: clk.performance, Date: clk.Date, navigator: { onLine: true }, location: { protocol: 'http:', hostname: 'localhost', host: 'localhost' }, HUSH_CONFIG: { server: 'ws://stub' }, addEventListener: noop,
    S, ls, capsFor, renderConv: noop, renderBanner: noop, pushMark: noop, checkForUpdate: noop, askPower: noop, onChatEvicted: noop, keysMovedOn: noop, accountGone: noop, setTab: noop,
    renderList: () => { stats.drawn++; }, updateTitle: noop, lastRead: () => 0, unsealAll: async (_c, ds) => ds, openPost: async () => ({}), noteCalls: noop, isBlocked: () => false, typeOf: (c) => c.type,
    isRequest: (c) => !!(c && c.req), hiddenConv: (c) => !!(c && c.hidden),   // stand-ins: a test marks a chat a message request (req) or hidden, a blocked person's (hidden); pins and archived chats are S.prefs's, as the page keeps them
    el: (t, c, x) => new E(t, c, x), html: (t, c) => new E(t, c), I: {}, withBadge: (n) => n, fmtListTime: (ts) => 't' + ts, draftKey: (cid) => 'draft:' + cid, plainText: (t) => t,
    convAvatar: () => new E('div', 'avatar'), avatar: () => new E('div', 'avatar'), isOnline: () => false, openConv: (cid) => stats.opened.push(cid), addLongPress: noop, chatMenu: noop };
  const made = 'const db=createHushAdapter(url,{';
  assert.equal(ADAPTER.split(made).length, 2, 'connectServer makes the adapter in one place');
  const code = [ADAPTER.replace(made, 'const db=createHushAdapter(url,__opts={'), /^const mentionsMe=.*;$/m.exec(UI)[0], lift('async function computeUnread(){', 'async function notifyNew('),
    lift('function drawRow(m,c){', '\nlet listSeq=0'), /^let listSeq=0,.*;$/m.exec(UI)[0], UI.includes('function listRank(cid){') ? lift('function listRank(cid){', '\n') : ''].join('\n');
  const api = new Function('env', `const {${Object.keys(env).join(',')}}=env;let __opts=null;\n${code}\nreturn {connectServer,computeUnread,drawRow,listRank:typeof listRank==='function'?listRank:null,opts:()=>__opts};`)(env);
  const P = { S, store, stats, computeUnread: api.computeUnread, drawRow: api.drawRow, listRank: api.listRank, opts: api.opts };
  // the connection comes up as the page brings it up: connectServer, then S.db
  P.start = async () => { let db = null; api.connectServer().then((d) => { db = d; }); for (let k = 0; k < 100 && !db; k++) await clk.run(10); assert.ok(db && db.online, 'the page is connected to the stand-in server'); S.db = db; return db; };
  // a chat's record watched as the chat watch (watchInbox's start) watches it; resolves to the time its first copy came
  P.watch = (cid) => { const w = { cid, at: null, err: null }; w.stop = S.db.doc('channels/' + cid).onSnapshot((s) => { if (w.at == null && s.exists) w.at = clk.now(); }, (e) => { w.err = e; }); return w; };
  return P;
}
export const ids = (n, letter = 'c') => Array.from({ length: n }, (_, i) => letter + String(i).padStart(3, '0') + 'XXXXXXXXX');
