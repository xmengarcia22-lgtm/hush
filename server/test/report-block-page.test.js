// Report and Block from the message menu (the page side, lifted out of app/ui.js and app/adapter.js).
// Report: only a public channel's messages, since only those can be checked by the server; the report carries the chat,
// the message id and a reason, never the text or the author. Block: a blocked person's messages are hidden everywhere
// (the chat, unread and @mention counts, search, the pin bar) and their DMs and requests are dropped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appSource } from './helpers.js';

const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const line = (re) => { const m = src.match(re); assert.ok(m, String(re)); return m[0]; };
const between = (from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a > 0 && b > a, from); return src.slice(a, b); };

// ---- Report ----
const mayReport = new Function(line(/^const typeOf=.*;$/m) + '\n' + line(/^const mayReport=.*;$/m) + '\nreturn mayReport;')();
const post = (o = {}) => ({ _id: 'p1', from: 'owner', ts: 1, ...o });

test('Report shows only on someone else\'s message in a public channel', () => {
  const pubCh = { id: 'c1', type: 'channel', visibility: 'public' };
  assert.equal(mayReport(pubCh, post(), false), true, 'public channel');
  assert.equal(mayReport({ id: 'c1', visibility: 'public' }, post(), false), true, 'a chat with no type is a channel');
  assert.equal(mayReport({ id: 'c2', type: 'channel', visibility: 'private' }, post(), false), false, 'private channel');
  assert.equal(mayReport({ id: 'c3', type: 'group', visibility: 'private' }, post(), false), false, 'private group');
  assert.equal(mayReport({ id: 'c3', type: 'group', visibility: 'public' }, post(), false), true, 'public group');
  assert.equal(mayReport({ id: 'd2', type: 'dm', visibility: 'public' }, post(), false), false, 'a DM is never reportable, even one marked public');
  assert.equal(mayReport({ id: 'd1', type: 'dm' }, post(), false), false, 'DM');
  assert.equal(mayReport(pubCh, post(), true), false, 'my own message');
  assert.equal(mayReport(pubCh, post({ sv: 1 }), false), false, 'service note');
  assert.equal(mayReport(pubCh, post({ svc: 'join' }), false), false, 'service message');
  assert.equal(mayReport(pubCh, post({ del: true }), false), false, 'deleted');
  assert.equal(mayReport(pubCh, post({ _id: undefined }), false), false, 'not saved yet');
});

test('the message menu decides with it, without asking for membership, and sends only chat, message id and reason', () => {
  const menu = between('function msgMenu(', '/* ---------- owner tools');
  assert.match(menu, /if\(mayReport\(c,p,mine\)\)items\.push\(\[I\.flag,'Report',\(\)=>reportMenu\(anchor,c,p\)\]\)/);
  const rm = between('function reportMenu(', '// Deleting a whole chat.');
  assert.match(rm, /await S\.db\.report\(c\.id,p\._id,r\)/);
  assert.equal((rm.match(/S\.db\.report\(/g) || []).length, 1);
  for (const r of ['spam', 'abuse', 'illegal', 'other']) assert.ok(rm.includes(`['${r}',`), r);
  assert.match(rm, /k==='denied'\|\|k==='notfound'\?'This can\\u2019t be reported any more\.'/);
  assert.match(rm, /k==='ratelimit'\?'Too many reports\. Try again later\.'/);
});

test('the message menu offers Block (or Unblock) for someone else\'s message', () => {
  const menu = between('function msgMenu(', '/* ---------- owner tools');
  assert.match(menu, /if\(!mine&&validHandle\(p\.from\)&&!isSelf\(c\)&&p\.sv!==1&&!p\.svc\)items\.push\(isBlocked\(p\.from\)\?\[I\.x,'Unblock '\+displayName\(p\.from\),\(\)=>\{unblockPeer\(p\.from\);[^\]]*\]:\[I\.x,'Block '\+displayName\(p\.from\),\(\)=>confirmBlockPerson\(p\.from\),'danger'\]\)/);
});

// ---- Block hides them ----
test('a blocked author\'s posts are hidden from the open chat', () => {
  const applyExpiry = new Function('S', 'allPosts', 'curConv', 'goneForMe', 'isBlocked', 'isMember', 'purgePost', 'promoteLast',
    between('function applyExpiry(){', 'function promoteLast(') + '\nreturn applyExpiry;');
  const now = Date.now(), S = { me: { handle: 'alice' }, purged: new Set() };
  const posts = [{ _id: 'a', from: 'bob', ts: now - 3 }, { _id: 'b', from: 'carol', ts: now - 2 }, { _id: 'c', from: 'alice', ts: now - 1 }];
  const run = (blocked) => {
    applyExpiry(S, () => posts, () => ({ id: 'g1', type: 'group' }), () => false, (h) => blocked.includes(h), () => false, () => {}, () => {})();
    return S.posts.map((p) => p._id);
  };
  assert.deepEqual(run([]), ['a', 'b', 'c']);
  assert.deepEqual(run(['bob']), ['b', 'c']);
  assert.deepEqual(run(['alice']), ['a', 'b', 'c'], 'my own posts are never hidden');
});

test('a blocked author\'s messages count toward neither unread nor @mentions', async () => {
  const body = line(/^const mentionsMe=.*;$/m) + '\n' + between('async function computeUnread(){', 'async function notifyNew(');
  const make = new Function('S', 'lastRead', 'unsealAll', 'typeOf', 'openPost', 'renderList', 'updateTitle', 'isBlocked', body + '\nreturn computeUnread;');
  const now = Date.now();
  const rows = [{ from: 'bob', text: 'hi @alice', ts: now - 3 }, { from: 'carol', text: 'hey @alice', ts: now - 2 }, { from: 'carol', text: 'x', ts: now - 1 }];
  const run = async (blocked) => {
    const S = { me: { handle: 'alice' }, chan: null, unread: new Map(), mentions: new Map(), unreadKey: new Map(),
      convs: [{ id: 'g1', type: 'group', last: { from: 'carol', ts: now - 1 } }],
      db: { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: rows.map((d, i) => ({ id: 'p' + i, data: () => d })) }) }) }) }) } };
    await make(S, () => 0, async (c, ds) => ds, (c) => c.type, async (c, d) => ({ text: d.text }), () => {}, () => {}, (h) => blocked.includes(h))();
    return [S.unread.get('g1'), S.mentions.get('g1')];
  };
  assert.deepEqual(await run([]), [3, 2]);
  assert.deepEqual(await run(['bob']), [2, 1]);
});

test('search and the pin bar skip a blocked author, and a block change recounts unread', () => {
  assert.match(between('function searchExtras(', 'const shown='), /!\(m\.from&&m\.from!==S\.me\.handle&&isBlocked\(m\.from\)\)/);
  assert.match(between('async function drawPinBar(){', 'const o=p?'), /if\(p&&p\.from&&p\.from!==S\.me\.handle&&isBlocked\(p\.from\)\)p=null;/);
  assert.match(line(/^function afterBlockChange\(\)\{.*$/m), /S\.unreadKey\.clear\(\);computeUnread\(\);/);
});

// ---- Blocked people can't reach me ----
test('a DM or request from a blocked person is dropped; from anyone else it is accepted', async () => {
  const make = new Function('S', 'isBlocked', 'heldKey', 'senderKeys', 'dmIdFor', 'dmInfo', 'ksMap', 'sideOk',
    line(/^const validHandle=.*;$/m) + '\n' + between('async function noteOk(p){', '/* Blocking, kept') + '\nreturn noteOk;');
  const noteOk = make({ me: { handle: 'alice' }, dmPeers: {} }, (h) => h === 'bob', () => false, async () => ({}),
    async (h) => 'd' + h.toUpperCase(), () => null, () => ({}), async () => true);
  for (const t of ['dm', 'request']) {
    assert.equal(await noteOk({ from: 'bob', to: 'alice', t, cid: 'dBOB' }), false, 'blocked ' + t);
    assert.equal(await noteOk({ from: 'carol', to: 'alice', t, cid: 'dCAROL' }), true, 'unblocked ' + t);
  }
  assert.equal(await noteOk({ from: 'bob', to: 'alice', type: 'dm', cid: 'dBOB' }), false, 'the older note shape too');
});

// ---- the adapter ----
test('api.report sends exactly {cid, pid, reason} on report.send, and passes the server\'s error code on', async () => {
  const BEGIN = '/* ===== HUSH ADAPTER BEGIN ===== */', END = '/* ===== HUSH ADAPTER END ===== */';
  const all = appSource(), a = all.indexOf(BEGIN), b = all.indexOf(END);
  const createHushAdapter = new Function(all.slice(a + BEGIN.length, b) + '\nreturn createHushAdapter;')();
  const sent = [];
  let answer = () => ({ ok: true });
  class FakeWS {
    constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen(); }); }
    send(s) { const f = JSON.parse(s); sent.push(f);
      const r = f.op === 'hello' ? { ok: true, nonce: 'n', now: Date.now() } : answer(f);
      setTimeout(() => this.onmessage({ data: JSON.stringify({ i: f.i, ...r }) })); }
    close() { this.readyState = 3; }
  }
  const db = createHushAdapter('ws://x/ws', { WebSocket: FakeWS, caps: true });
  try {
    await db.ready;
    assert.deepEqual(await db.report('c1', 'p1', 'spam'), { i: sent.at(-1).i, ok: true });
    const f = sent.at(-1);
    assert.equal(f.op, 'report.send');
    assert.deepEqual(Object.keys(f).sort(), ['cid', 'i', 'op', 'pid', 'reason'], 'nothing but the chat, the message and the reason');
    assert.deepEqual({ cid: f.cid, pid: f.pid, reason: f.reason }, { cid: 'c1', pid: 'p1', reason: 'spam' });
    assert.deepEqual(sent.map((x) => x.op), ['hello', 'report.send'], 'no chat.open first');
    answer = () => ({ ok: false, e: 'ratelimit', m: 'slow down' });
    await assert.rejects(db.report('c1', 'p1', 'abuse'), (e) => e.code === 'ratelimit');
  } finally { db.close(); }
});
