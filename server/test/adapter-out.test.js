// "The right key, this account removed" (release 111; api.chatOut). The page forgets a chat on a watch ended `denied` only
// after it has looked again with a fresh record, because `denied` from chat.open also means "an old key". That lost one thing
// the live page did: a member BLOCKED WITH NO KEY CHANGE (a group that has used its 31 key numbers; an admin's page that closed
// between chat.ban and chat.rotate) was no longer forgotten at once. The page cannot tell the two apart, but the server says
// which it is: chat.open with the right member key of a blocked username answers `denied` "you were removed from this chat"
// (server/src/protocol.js), a key that is not the chat's answers `denied` "that key does not open this chat" (store.js). The
// adapter keeps that one fact for a chat, and the page asks with chatOut(cid): inside a watch's error callback, and when the
// copy anyone signed in may read is handed to a record watch. Every attempt at a chat writes it: in only when every key was
// refused and that sentence was heard, out at any other end (an open, a server error or any other answer, no key to try).
// The one exception is an attempt that ends too busy or without a connection: it hands the page nothing (no copy, no ended
// watch), so it leaves the fact as it was. (The first rule left it at every end but an open and every key refused; then a
// member let in again whose first open met a server error was handed the copy with an old "removed".)
// The adapter runs as written, against the stand-in server of the eviction tests (adapter-evict-kit.js); the last test runs it
// against the real server code, so a change of the server's sentence fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { tick, who, lose, createHushAdapter } from './adapter-pace-kit.js';
import { server, until } from './adapter-evict-kit.js';
import { startServer, signup, makeIdentity, createChat, groupDoc, cap, signText } from './helpers.js';

const V = 'c003', OUT = 'you were removed from this chat', WRONG = 'that key does not open this chat';
const no = (m) => ({ ok: false, e: 'denied', m });
// a record watch and a call watch of the chat, as the page has them; each notes what chatOut says INSIDE its own error callback
const watch = (S, seen) => { const end = (kind) => (e) => seen.push(kind + ' ' + e.code + ' ' + S.db.chatOut(V));
  S.db.doc('channels/' + V).onSnapshot(() => {}, end('record'));
  S.db.collection('channels/' + V + '/call').orderBy('ts', 'desc').limit(50).onSnapshot(() => {}, end('call')); };

for (const [m, want] of [[OUT, true], [WRONG, false]]) test('an eviction whose re-open the server refuses "' + m + '": both watches end denied, and inside each watch\'s own error callback chatOut is already ' + want, async () => {
  let say = null; const seen = [];
  const S = server({ open: (f) => f.cid === V && say ? no(say) : undefined });
  try {
    await S.db.ready; watch(S, seen);
    assert.ok(await until(() => S.heldOf(V) === 'call,record', 3000), 'the chat is open and watched');
    assert.equal(S.db.chatOut(V), false, 'not out while it is open');
    say = m; assert.ok(S.evict(V), 'evicted');
    assert.ok(await until(() => seen.length === 2, 2500), 'both watches ended: ' + seen.join(', '));
    assert.deepEqual(seen.sort(), ['call denied ' + want, 'record denied ' + want]);
    assert.equal(S.db.chatOut(V), want, 'and it stays so');
  } finally { S.end(); }
});

for (const gone of ['k1', 'k3']) test('three keys offered at the re-open, the ' + (gone === 'k1' ? 'first' : 'last') + ' refused "' + OUT + '" and the other two "' + WRONG + '": every key is tried, and chatOut is true inside the callbacks', async () => {
  let on = false; const seen = [], asked = [];
  const S = server({ open: (f) => { if (f.cid !== V || !on) return undefined; asked.push(f.cap); return no(f.cap === gone ? OUT : WRONG); }, extra: { caps: async (cid) => cid === V ? ['k1', 'k2', 'k3'] : 'cap-' + cid } });
  try {
    await S.db.ready; watch(S, seen);
    assert.ok(await until(() => S.heldOf(V) === 'call,record', 3000), 'the chat is open and watched');
    on = true; assert.ok(S.evict(V), 'evicted');
    assert.ok(await until(() => seen.length === 2, 2500), 'both watches ended: ' + seen.join(', '));
    assert.deepEqual([asked, seen.sort()], [['k1', 'k2', 'k3'], ['call denied true', 'record denied true']]);
  } finally { S.end(); }
});

for (const [m, want] of [[OUT, true], [WRONG, false]]) test('at a start, with no eviction: a record watch whose chat the server refuses "' + m + '" is put aside with the copy anyone signed in may read, and chatOut is ' + want + ' when that copy is handed over', async () => {
  const seen = [];
  const S = server({ open: (f) => f.cid === V ? no(m) : undefined });
  try {
    await S.db.ready;
    S.db.doc('channels/' + V).onSnapshot((s) => seen.push((s.exists ? (s.data().full ? 'whole' : 'trimmed') : 'none') + ' ' + S.db.chatOut(V)), (e) => S.ended.push(V + ' record ' + e.code));
    assert.ok(await until(() => seen.length === 1, 2000), 'a first snapshot comes');
    await tick(200);
    assert.deepEqual([seen, S.ended, S.heldOf(V)], [['trimmed ' + want], [], ''], 'the trimmed copy, nothing ended, no watch held');
  } finally { S.end(); }
});

test('what changes it afterwards: every attempt at the chat writes it, in when every key was refused and the server\'s sentence was heard, out at any other end (an answered open, every key refused "' + WRONG + '", a server error or any other answer, no key to try, the page\'s own key work failing some other way), except an attempt that ends too busy or without a connection (the server\'s `ratelimit`, no answer in time, the page\'s key work ending `ratelimit`, `timeout` or `offline`): those hand the page nothing and leave it as it was', async () => {
  let ans = no(OUT), keys = () => 'cap-' + V;
  const S = server({ open: (f) => f.cid === V ? ans : undefined, extra: { callTimeoutMs: 400, caps: async (cid) => cid === V ? keys() : 'cap-' + cid } });
  const step = async (name, want, ok = false) => { assert.equal(await S.db.refreshChat(V), ok, name + ': the open ' + (ok ? 'is answered' : 'fails')); assert.equal(S.db.chatOut(V), want, name); };
  const heard = async () => { keys = () => 'cap-' + V; ans = no(OUT); await step('refused with the removal sentence', true); };
  const fails = (code) => () => { throw Object.assign(new Error('the page\'s key work failed'), code ? { code } : {}); };
  try {
    await S.db.ready;
    assert.equal(S.db.chatOut(V), false, 'before anything');
    await heard();
    // the ends that hand the page nothing (no copy, no ended watch): left as it was
    ans = { ok: false, e: 'ratelimit', m: 'slow down' }; await step('then too busy', true);
    ans = 'drop'; await step('then no answer in time', true);
    keys = fails('offline'); await step('then the page\'s key work failing as with no connection', true);
    keys = fails('ratelimit'); await step('then the page\'s key work failing as too busy', true);
    keys = fails('timeout'); await step('then the page\'s key work late', true);
    // every other end writes it: out
    keys = () => 'cap-' + V; ans = { ok: false, e: 'internal', m: 'something went wrong' }; await step('then a server error', false);
    await heard(); ans = { ok: false, e: 'notfound', m: 'no such chat' }; await step('then an answer that is none of these (notfound)', false);
    await heard(); keys = () => null; await step('then no key to try', false);
    await heard(); keys = fails('internal'); await step('then the page\'s key work failing with a server error', false);
    await heard(); keys = fails(''); await step('then the page\'s key work failing with no code at all', false);
    await heard(); ans = no(WRONG); await step('then every key refused with the wrong-key sentence', false);
    await heard(); ans = undefined; await step('then an open that is answered', false, true);
  } finally { S.end(); }
});

test('the order that showed the first rule wrong: blocked with the app open (the sentence heard, the watches ended with chatOut true), then on the same connection a new watch of the chat whose open the server answers with an error: the copy anyone signed in may read is handed over, and chatOut is false at the hand-over (an earlier attempt\'s answer is not read as this one\'s)', async () => {
  let ans; const ended = [], seen = [];
  const S = server({ open: (f) => f.cid === V ? ans : undefined });
  try {
    await S.db.ready; watch(S, ended);
    assert.ok(await until(() => S.heldOf(V) === 'call,record', 3000), 'the chat is open and watched');
    ans = no(OUT); assert.ok(S.evict(V), 'evicted');
    assert.ok(await until(() => ended.length === 2, 2500), 'both watches ended: ' + ended.join(', '));
    assert.deepEqual(ended.sort(), ['call denied true', 'record denied true'], 'the page heard "removed"');
    ans = { ok: false, e: 'internal', m: 'something went wrong' };   // let in again since; the server fails once, at the first open of the new watch
    S.db.doc('channels/' + V).onSnapshot((s) => seen.push((s.exists ? (s.data().full ? 'whole' : 'trimmed') : 'none') + ' ' + S.db.chatOut(V)), (e) => S.ended.push(V + ' record ' + e.code));
    assert.ok(await until(() => seen.length === 1, 2000), 'a first snapshot comes');
    await tick(200);
    assert.deepEqual([seen, S.ended, S.heldOf(V)], [['trimmed false'], [], ''], 'the trimmed copy with chatOut false, nothing ended, no watch held');
  } finally { S.end(); }
});

test('the connection lost: chatOut is false at once, and an attempt the next connection is too busy for does not bring it back', async () => {
  let ans = no(OUT);
  const S = server({ open: (f) => f.cid === V ? ans : undefined });
  try {
    await S.db.ready;
    assert.equal(await S.db.refreshChat(V), false); assert.equal(S.db.chatOut(V), true, 'true on the first connection');
    ans = { ok: false, e: 'ratelimit', m: 'slow down' };
    lose(S.W, 0);
    assert.equal(S.db.chatOut(V), false, 'emptied when the connection ends');
    S.db.probe(50); assert.ok(await until(() => S.db.online && S.W.socks.length > 1, 3000), 'the next connection is up');
    assert.equal(await S.db.refreshChat(V), false); assert.equal(S.db.chatOut(V), false, 'still false after an attempt that was too busy');
  } finally { S.end(); }
});

test('the account changed: nothing of it is left for the next account', async () => {
  const S = server({ open: (f) => f.cid === V ? no(OUT) : undefined });
  try {
    await S.db.ready; await S.db.prove(who('alice'));
    assert.equal(await S.db.refreshChat(V), false); assert.equal(S.db.chatOut(V), true, 'true for the first account');
    await S.db.prove(who('bob'));
    assert.equal(S.db.chatOut(V), false, 'false for the next');
  } finally { S.end(); }
});

test('on the real server code: a member blocked with no key change is evicted, the re-open with the right key hears chat.open\'s own sentence for it, and chatOut is true inside the watch\'s error callback; a key that is not the chat\'s is refused in other words, and chatOut is false', async () => {
  const T = await startServer({ authz: 'standard' });
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob'), G = 'gOut000000001', G2 = 'gOut000000002';
  const A = await signup(T.url, alice); let db = null;
  try {
    await (await signup(T.url, bob)).close();
    const { caps } = await createChat(A, G, groupDoc()); await createChat(A, G2, groupDoc());
    const seen = [], heard = [];
    class WS extends WebSocket { set onmessage(fn) { super.onmessage = (ev) => { const f = JSON.parse(String(ev.data)); if (f.ok === false) heard.push(f.e + ': ' + f.m); fn(ev); }; } get onmessage() { return super.onmessage; } }
    db = createHushAdapter(T.url, { WebSocket: WS, caps: async (cid) => cid === G ? caps.m : cap() });   // the member key of the one; a key that is not the other's
    await db.ready; await db.prove({ h: 'bob', pub: bob.sig, dev: '', signDev: null, signAcct: (m) => signText(bob.sigKey, m) });
    db.doc('channels/' + G).onSnapshot(() => {}, (e) => seen.push(e.code + ' ' + db.chatOut(G)));
    assert.ok(await until(() => db.chatLevel(G) === 'member', 3000), 'bob is in with the member key');
    assert.equal(db.chatOut(G), false, 'not out while he is in');
    await A.ok('chat.ban', { cid: G, h: 'bob', on: true });   // blocked; the key is not changed
    assert.ok(await until(() => seen.length > 0, 4000), 'his watch ends; the server said: ' + heard.join('; '));
    assert.deepEqual(seen, ['denied true'], 'ended denied, with chatOut true inside the callback; the server said: ' + heard.join('; '));
    assert.equal(await db.refreshChat(G2), false, 'a key that is not the chat\'s does not open it');
    assert.equal(db.chatOut(G2), false, 'and that is not "removed"; the server said: ' + heard.join('; '));
  } finally { if (db) db.close(); await A.close(); await T.stop(); }
});
