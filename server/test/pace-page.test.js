// Release 111 (page): the page's side of the pace in app/ui.js, lifted from the page's source and run with stand-ins. This is
// release 101's pace-page.test.js (0d3bd18) carried over by hand onto today's page. Its four tests of the unread count are in
// pace-unread.test.js; its text match of the connection's options is a run now, in pace-page-queue.test.js (it needs the
// built app/adapter.js).
//  - The order of a cold start. The start's queue sends the chats in the list's order, and at a cold start the live list is
//    empty. listRank gives a chat's place in the list as last drawn (hush:list:<handle>, the top 90 rows kept in the sealed
//    store) until the live list is whole; a tap on a kept row tells the connection to send that chat's frames now.
//  - chat.base, which gives an old one-on-one chat its base key, was sent for every one-on-one chat at every start. Now a
//    chat that was done is remembered on the device (hush:base:<handle>, in the sealed store, removed with the account).
// WHAT IT DOES NOT SEE: the connection and its queue, the screen (a stand-in DOM for the row), the sealed store itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appSource } from './helpers.js';

const src = appSource();
const between = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, 'found: ' + a); return src.slice(i, j); };

// ---- the first review's point 1 (2026-11-10): at a cold start the live list is empty, so the queue had no order to follow, and a tap on a kept row hurried nothing ----
// listRank with the statement that writes the kept list (renderList's own, taken out of it as written): `store` is the sealed store.
function rankPage(store) {
  const write = /const j=JSON\.stringify\(rows\.slice\(0,90\)\);if\(lastList\.h!==S\.me\.handle\|\|lastList\.j!==j\)\{[^\n]*?JSON\.parse\(j\)\)\}/.exec(between('async function renderList(){', '\n/* ---------- one search box'));
  assert.ok(write, 'renderList writes the kept list');
  const body = /^let listSeq=0,.*;$/m.exec(src)[0] + '\n' + between('function listRank(cid){', '\n') + '\nfunction keep(rows){' + write[0] + '}';
  let reads = 0; const S = { me: { handle: 'alice' }, convsLoaded: false, convs: [] };
  const ls = { get: (k, d) => { reads++; return k in store ? JSON.parse(store[k]) : d; }, set: (k, v) => { store[k] = JSON.stringify(v); } };
  const [listRank, keep] = new Function('S', 'ls', body + '\nreturn [listRank,keep];')(S, ls);
  return { S, listRank, keep, reads: () => reads };
}
const kept = (...ids) => JSON.stringify(ids.map((id) => (id ? { id } : null)));

test('before the live list is whole, a chat\'s place in the queue is its place in the list kept from last time; the kept list is read once, not at every question', () => {
  const P = rankPage({ 'hush:list:alice': kept('c7', 'c2', null, 'c9') });
  assert.deepEqual(['c7', 'c2', 'c9', 'c1'].map(P.listRank), [0, 1, 3, -1], 'the kept list\'s order; a chat it does not hold has none');
  for (let k = 0; k < 50; k++) P.listRank('c2');
  assert.equal(P.reads(), 1, 'the store is read once');
  P.S.convsLoaded = true; assert.equal(P.listRank('c7'), -1, 'once the live list is whole, the live order alone counts');
  P.S.convsLoaded = false; P.S.me = null; assert.equal(P.listRank('c7'), -1, 'nobody signed in: no order');
});

test('no kept list, or one that is not a list: no order, and nothing breaks', () => {
  for (const v of [undefined, 'null', '"x"', '{}', '[]', '[null,7,"c1"]']) assert.equal(rankPage(v === undefined ? {} : { 'hush:list:alice': v }).listRank('c1'), -1, String(v));
});

test('the kept list of another account on the device is not used: each account has its own, read when it is the one signed in', () => {
  const P = rankPage({ 'hush:list:alice': kept('c7', 'c2'), 'hush:list:bob': kept('c2', 'c5') });
  assert.deepEqual(['c7', 'c2', 'c5'].map(P.listRank), [0, 1, -1]);
  P.S.me = { handle: 'bob' };   // the other account signs in on this page
  assert.deepEqual(['c7', 'c2', 'c5'].map(P.listRank), [-1, 0, 1], 'bob\'s list, none of alice\'s places');
  P.S.me = { handle: 'carol' };
  assert.deepEqual(['c7', 'c2', 'c5'].map(P.listRank), [-1, -1, -1], 'an account with no kept list has no order');
});

test('when the page writes the kept list again, the order is read again: a later start of the same account follows the list as last drawn, not the one this page began with', () => {
  const P = rankPage({ 'hush:list:alice': kept('c7', 'c2') });
  assert.deepEqual(['c7', 'c2', 'c3'].map(P.listRank), [0, 1, -1]);
  P.S.convsLoaded = true; P.keep([{ id: 'c3' }, { id: 'c2' }, { id: 'c7' }]);   // the live list is whole and is drawn: the kept list is rewritten
  P.S.convsLoaded = false;   // the account is started again on this page (start() sets this)
  assert.deepEqual(['c7', 'c2', 'c3'].map(P.listRank), [2, 1, 0], 'the list as last drawn');
  const reads = P.reads(); P.S.convsLoaded = true; P.keep([{ id: 'c3' }, { id: 'c2' }, { id: 'c7' }]); P.S.convsLoaded = false; P.listRank('c3');
  assert.equal(P.reads(), reads, 'a list drawn again with nothing changed writes nothing and reads nothing');
});

// drawRow against a stand-in DOM, as chat-list.test.js runs it: a row drawn from the kept list (no record yet) and a live row.
function rowPage(db) {
  class E { constructor(tag, cls, text) { this.tag = tag; this.className = cls || ''; this.text = text == null ? '' : String(text); this.kids = []; } append(...k) { this.kids.push(...k); } insertAdjacentHTML() {} }
  const S = { me: { handle: 'alice' }, chan: null, db }, calls = [];
  const drawRow = new Function('S', 'el', 'html', 'I', 'withBadge', 'fmtListTime', 'ls', 'draftKey', 'plainText', 'convAvatar', 'avatar', 'isOnline', 'openConv', 'addLongPress', 'chatMenu',
    between('function drawRow(m,c){', '\nlet listSeq=0') + '\nreturn drawRow;')(S, (t, c, x) => new E(t, c, x), (t, c) => new E(t, c), {}, (n) => n, (ts) => 't' + ts, { get: (_k, d) => d }, (cid) => 'draft:' + cid, (t) => t,
    () => new E('div', 'avatar'), () => new E('div', 'avatar'), () => false, (cid) => calls.push('open:' + cid), () => {}, () => {});
  return { S, drawRow, calls };
}
const ROW = { id: 'c9', k: 'dm', n: 'Bob', h: 'bob', ts: 1000, s: 'hi', u: 0, m: false, p: false, at: false, b: null, x: 0 };

test('a tap on a kept row, before its record came, marks the chat as the one to open and tells the connection to send its frames now', () => {
  const hurried = [], P = rowPage({ hurry: (cid) => hurried.push(cid) });
  P.drawRow(ROW).onclick();
  assert.deepEqual([P.S.wantOpen, hurried, P.calls], ['c9', ['c9'], []], 'asked for, hurried; nothing is opened before the record is in');
  const Q = rowPage(null); Q.drawRow(ROW).onclick();
  assert.equal(Q.S.wantOpen, 'c9', 'no connection object yet: the tap is still remembered, and nothing throws');
  const O = rowPage({}); O.drawRow(ROW).onclick();
  assert.equal(O.S.wantOpen, 'c9', 'a connection object that cannot hurry: the same');
});

test('a live row\'s tap opens the chat as before and the list\'s own rows (Message requests, Archived chats) hurry nothing', () => {
  const hurried = [], P = rowPage({ hurry: (cid) => hurried.push(cid) });
  P.drawRow(ROW, { id: 'c9', type: 'dm' }).onclick();
  assert.deepEqual([P.calls, hurried, P.S.wantOpen], [['open:c9'], [], undefined], 'opening it is what hurries a chat on screen (the connection does that itself)');
  for (const k of ['req', 'arch']) assert.equal(P.drawRow({ k, n: 'x', s: '', u: 0 }).onclick, undefined, k + ': no tap of the row\'s own');
});

// ---- chat.base once per one-on-one chat per device ----
// recordBase as a page load sees it: a fresh page (nothing in memory) over the same device store. `caps`: false, this device
// cannot work out the chat's key. `self`: chats that are Saved Messages.
function basePage(store, me, setBase, { caps = true, self = [] } = {}) {
  const body = between('const dmRenoted=new Set(),baseDone=new Set();', 'async function ensureInbox(');
  const S = { me: me ? { handle: me } : null, db: setBase ? { setBase } : {} };
  const ls = { get: (k, d) => k in store ? JSON.parse(store[k]) : d, set: (k, v) => { store[k] = JSON.stringify(v); } };
  const recordBase = new Function('S', 'ls', 'typeOf', 'isSelf', 'memberCap', body + '\nreturn recordBase;')(S, ls, (c) => c.type, (c) => self.includes(c.id), async (c) => (caps ? 'cap-' + c.id : null));
  return Object.assign(recordBase, { S });
}
const coded = (code) => Object.assign(new Error(code), { code });

test('chat.base is sent once for a one-on-one chat on this device, not at every start', async () => {
  const store = {}, sent = [], setBase = async (cid, cap) => { sent.push(cid + ' ' + cap); };
  const d1 = { id: 'd1', type: 'dm' }, d2 = { id: 'd2', type: 'dm' };
  let recordBase = basePage(store, 'alice', setBase);
  await recordBase(d1); await recordBase(d1); await recordBase({ id: 'g1', type: 'group' });
  assert.deepEqual([sent, JSON.parse(store['hush:base:alice'])], [['d1 cap-d1'], ['d1']], 'sent, and remembered under the account');
  recordBase = basePage(store, 'alice', setBase);   // the next start
  await recordBase(d1); await recordBase(d2);
  assert.deepEqual([sent, JSON.parse(store['hush:base:alice'])], [['d1 cap-d1', 'd2 cap-d2'], ['d1', 'd2']], 'only the chat that was not done yet');
  recordBase = basePage(store, 'alice', setBase);   // and the one after: nothing at all
  await recordBase(d1); await recordBase(d2);
  assert.equal(sent.length, 2, 'a second start with nothing new sends no chat.base');
  recordBase = basePage(store, 'bob', setBase);   // another account on the device has its own list
  await recordBase(d1);
  assert.deepEqual([sent, JSON.parse(store['hush:base:bob']), JSON.parse(store['hush:base:alice'])], [['d1 cap-d1', 'd2 cap-d2', 'd1 cap-d1'], ['d1'], ['d1', 'd2']], 'alice\'s list says nothing about bob\'s chats');
});

test('a chat.base the server did not take is not remembered: it is sent again at the next start, and again in this one when asked', async () => {
  const store = {}; let calls = 0;
  const setBase = async () => { calls++; if (calls < 3) throw coded('ratelimit'); };
  let recordBase = basePage(store, 'alice', setBase);
  await recordBase({ id: 'd1', type: 'dm' }); await recordBase({ id: 'd1', type: 'dm' });
  assert.deepEqual([calls, store['hush:base:alice']], [2, undefined]);
  recordBase = basePage(store, 'alice', setBase);
  await recordBase({ id: 'd1', type: 'dm' });
  assert.deepEqual([calls, JSON.parse(store['hush:base:alice'])], [3, ['d1']]);
});

test('only a one-on-one chat with someone else gets one, only with an account and a connection that can, and a chat this device cannot open is not remembered', async () => {
  const store = {}, sent = [], setBase = async (cid) => { sent.push(cid); };
  const recordBase = basePage(store, 'alice', setBase, { self: ['dS'] });
  for (const c of [null, { id: 'dS', type: 'dm' }, { id: 'g1', type: 'group' }, { id: 'c1', type: 'channel' }]) await recordBase(c);
  await basePage(store, null, setBase)({ id: 'd1', type: 'dm' });      // nobody signed in
  await basePage(store, 'alice', null)({ id: 'd1', type: 'dm' });      // a connection that has no chat.base
  assert.deepEqual([sent, Object.keys(store)], [[], []], 'nothing sent and nothing kept');
  let noKey = basePage(store, 'alice', setBase, { caps: false });
  await noKey({ id: 'd1', type: 'dm' });
  assert.deepEqual([sent, Object.keys(store)], [[], []], 'no key on this device: nothing to send, and the chat is not marked as done');
  await basePage(store, 'alice', setBase)({ id: 'd1', type: 'dm' });   // a later start, the key held by then
  assert.deepEqual([sent, JSON.parse(store['hush:base:alice'])], [['d1'], ['d1']]);
});

test('several chats done at the same moment are all remembered: each is added to the list as it stands when its answer comes', async () => {
  const store = {}, gates = [], setBase = (cid) => new Promise((ok) => gates.push([cid, ok]));
  const recordBase = basePage(store, 'alice', setBase);
  const runs = ['d1', 'd2', 'd3'].map((id) => recordBase({ id, type: 'dm' }));
  await new Promise((r) => setImmediate(r));
  for (const [, ok] of gates.reverse()) ok();   // answered in another order than asked
  await Promise.all(runs);
  assert.deepEqual(JSON.parse(store['hush:base:alice']).sort(), ['d1', 'd2', 'd3']);
});

test('the list of done chats is kept in the sealed store and goes with the account: forgetting an account takes its own list and no other', () => {
  const ownedBy = new Function(/^const ownedBy=.*$/m.exec(src)[0] + '\nreturn ownedBy;')();
  const lsSecret = new Function(/^const PLAIN_KEYS=.*$/m.exec(src)[0] + '\n' + /^const lsSecret=.*$/m.exec(src)[0] + '\nreturn lsSecret;')();
  assert.ok(lsSecret('hush:base:alice'), 'sealed, as every other record of the account on this device');
  assert.deepEqual([ownedBy('hush:base:alice', 'alice'), ownedBy('hush:base:alice', 'bob'), ownedBy('hush:base:alice2', 'alice'), ownedBy('hush:base:malice', 'alice')], [true, false, false, false]);
  assert.match(src, /async function forgetAccountData\(h\)\{[^\n]*\n\s*forgetEntries\(\(k,v\)=>ownedBy\(k,h\)\|\|/, 'log-out and account deletion forget every entry the account owns');
});
