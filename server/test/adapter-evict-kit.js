// What the eviction tests share (release 111): a stand-in server that keeps levels as the real one does, and the page's side.
// Not a test file: adapter-evict*.test.js import it.
import assert from 'node:assert/strict';

import { TokenBucket } from '../src/limits.js';
import { world, page, tick, range, cidOf, what, back, fast } from './adapter-pace-kit.js';

export const until = async (fn, ms = 8000) => { for (const t0 = Date.now(); Date.now() - t0 < ms && !fn();) await tick(20); return fn(); };
export const num = (cid) => Number(cid.slice(1));
export const chatOfSub = (f) => f.p === 'channels' && f.ids ? f.ids[0] : (/^channels\/([^/]+)\//.exec(f.p || '') || [])[1];
export const GONE = 'You are no longer in this chat';

// The stand-in with levels, as server/src keeps them: chat.open gives the connection the chat's level (protocol.js); a watch on
// a chat's record or on anything under the chat needs it, else `denied` "open this chat with its key first" (authz.js needLevel,
// lines 45, 84 and 122); evict() takes the level and that chat's watches from a connection that holds it and then says
// { t: 'evict', cid } on the same socket, in order (protocol.js Conn.evict, 478-482); a watch id already held is `conflict`
// (subs.js add, the kit's own). A frame refused for the allowance gives no level.
//   k      the clock runs k times as fast; 0 is the real clock
//   wide   the connections (by number) with an allowance nobody reaches: a page that is whole at once
//   open   the test's own answer to a chat.open: a refusal, 'drop' for no answer, or nothing (the level is given)
//   any    the test's own answer to any other frame
//   extra  options for the page's adapter
// It keeps: ended (the watches the adapter gave up, with the error's code and words), live (the chats whose record watch has
// answered in full), hooks (each time the adapter called the page's hook for an eviction: the chat and the time), offs (how to
// end a chat's watches as the page does).
export function server({ k = 0, rtt = 5, wide = [], open = null, any = null, extra = {} } = {}) {
  const T = k ? fast(k) : null, S = { T, ended: [], live: new Set(), hooks: [], offs: new Map(), onOpen: null };
  const W = S.W = world({ fpm: 300, qpm: 120, now: T ? T.now : null, rtt, on: (f, s, rec) => {
    s.lv = s.lv || new Set();
    if (f.op === 'hello') return wide.includes(s.n) ? (s.bucket = new TokenBucket(1e6, 1e6), s.queries = null, { ok: true, nonce: 'n' + s.n, now: Date.now(), limits: { framesPerMin: 600000 } }) : undefined;
    if (f.op === 'chat.open') { const r = open ? open(f, s, rec) : undefined; if (r) return r; rec.grant = true; return undefined; }
    const r = any ? any(f, s, rec) : undefined; if (r) return r;
    if (f.op === 'sub') { const cid = chatOfSub(f); if (cid && !s.lv.has(cid)) return { ok: false, e: 'denied', m: 'open this chat with its key first' }; }
    return undefined; } });
  const send = W.WS.prototype.send;
  W.WS.prototype.send = function (str) { send.call(this, str); const rec = W.sent[W.sent.length - 1]; if (rec.grant && !W.over.includes(rec)) { this.lv.add(rec.cid); if (S.onOpen) S.onOpen(rec, this); } };
  const last = () => W.socks.length - 1;
  S.evict = (cid, n = last()) => { const s = W.socks[n]; if (!s || s.readyState !== 1 || !s.lv || !s.lv.delete(cid)) return false;
    for (const [id, f] of [...s.held]) if (chatOfSub(f) === cid) s.held.delete(id);
    setTimeout(() => W.push(n, { t: 'evict', cid }), rtt); return true; };
  S.forget = (cid, n = last()) => W.socks[n].lv.delete(cid);   // the level gone and nothing said: a change the page has not heard of
  const db = S.db = page(W, { caps: async (cid) => 'cap-' + cid, onEvict: async (cid) => { S.hooks.push([cid, Date.now()]); await db.preview(cid); }, rank: num, ...extra });   // the page's onChatEvicted: one read of the record
  const end = (cid, kind) => (e) => S.ended.push(cid + ' ' + kind + ' ' + (e && e.code) + ' "' + (e && e.message) + '"');
  S.watch = (j, { call = false, posts = false } = {}) => { const cid = cidOf(j), offs = S.offs.get(cid) || []; S.offs.set(cid, offs);
    offs.push(db.doc('channels/' + cid).onSnapshot((s) => { if (s.exists && s.data().full) S.live.add(cid); }, end(cid, 'record')));
    if (call) offs.push(db.collection('channels/' + cid + '/call').orderBy('ts', 'desc').limit(50).onSnapshot(() => {}, end(cid, 'call')));
    if (posts) offs.push(db.collection('channels/' + cid + '/posts').orderBy('ts', 'desc').limit(300).onSnapshot(() => {}, end(cid, 'posts'))); };
  // a page of n chats, whole: `more` says which rows have a call watch or are on screen
  S.whole = async (n, more = {}) => { await db.ready; for (const j of range(0, n)) S.watch(j, more[j]);
    const subs = n + Object.values(more).reduce((a, m) => a + (m.call ? 1 : 0) + (m.posts ? 1 : 0), 0);
    assert.ok(await until(() => W.socks[last()].held.size === subs && S.live.size === n, 15000), 'the page is whole: ' + W.socks[last()].held.size + ' watches of ' + subs); await tick(60); };
  S.heldOf = (cid, n = last()) => [...W.socks[n].held.values()].filter((f) => chatOfSub(f) === cid).map((f) => f.p === 'channels' ? 'record' : f.p.split('/').pop()).sort().join(',');
  S.about = (cid, from = 0, n = null) => W.sent.slice(from).filter((f) => (n == null || f.sock === n) && (f.cid === cid || chatOfSub(f) === cid || f.p === 'channels/' + cid));   // every frame about a chat: the record read, chat.open, its watches
  S.sentOf = (cid, n = last()) => W.sent.filter((f) => f.sock === n && (f.cid === cid || chatOfSub(f) === cid)).map(what);
  S.next = () => back(W, db, last());   // the connection lost, and made again at once
  S.end = () => { db.close(); if (T) T.off(); };
  return S;
}
