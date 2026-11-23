// Reactions and votes in a channel, the server's own rules (SPEC.md 5.4). In every channel, public or private, nobody can see who
// reacted or voted, or what anyone picked: the owner and the admins get what a subscriber gets. A row comes only through chat.act,
// one per account, post and kind, under a slot only the server can work out; it carries the post, the kind, the epoch, the sealed
// choice of one size, and the mark `an`. Only a connection of that account learns which row is its own (chat.mine). A row from
// before this change sits under a tag anyone holding the chat key works out from a username: it stays stored, reads as none at
// every level, is never answered with `denied` (a page takes that on a watch as an eviction) and goes when its post goes, unheard.
// A group's and a one-on-one chat's rows do not change. Raw protocol clients, standard authorization.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

import { startServer, signup, connect, connectAs, makeIdentity, createChat, cap, label, wrap, sealed, channelDoc, groupDoc, dmDoc } from './helpers.js';
import { SYSTEM } from '../src/store.js';
import { keyedId } from '../src/paths.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const chid = (s) => ('c' + s + '0'.repeat(12)).slice(0, 13);
const gid = (s) => ('g' + s + '0'.repeat(12)).slice(0, 13);
const PID = 'pOsT12345678', PID2 = 'pOsT87654321';
const TAG = (c) => c.repeat(22);   // a tag as a page from before this change worked one out from a username
const post = (over = {}) => ({ sl: 1, ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: sha('t0'), on: 0, ...over });
const choice = () => ({ iv: randomBytes(12).toString('base64'), ct: randomBytes(80).toString('base64') });
const SUE = 'sue_subscriber', SAM = 'sam_subscriber';
const pubDoc = (over = {}) => channelDoc({ visibility: 'public', name: 'News', desc: '', photo: null, owner: 'olga', admins: [], meta: undefined, openKeys: { 0: 'k'.repeat(44) }, ...over });

let S, st, ids, olga, adam, sam, sue, sue2, nora;
before(async () => {
  S = await startServer({ authz: 'standard', limits: { queriesPerMin: 100000, postsPerMin: 100000, sideWritesPerMin: 100000 } }); st = S.srv.store;
  ids = {}; for (const h of ['olga', 'adam', SAM, SUE, 'nora']) ids[h] = await makeIdentity(h);
  [olga, adam, sam, sue, nora] = await Promise.all(Object.values(ids).map((id) => signup(S.url, id)));
  sue2 = await connectAs(S.url, ids[SUE]);   // her second device
});
after(async () => { for (const X of [olga, adam, sam, sue, sue2, nora]) await X.close(); await S.stop(); });

// A channel with an admin, two subscribers (one on two devices) and the owner's post; `v` as subscribers open it, as anyone holding the published key does.
async function chan(name, doc = channelDoc()) {
  const cid = chid(name), { caps } = await createChat(olga, cid, doc);
  await adam.ok('chat.open', { cid, cap: caps.a });
  for (const x of [sam, sue, sue2]) await x.ok('chat.open', { cid, cap: caps.m });
  await olga.ok('set', { p: `channels/${cid}/posts/${PID}`, d: post() });
  return { cid, caps, col: `channels/${cid}/acts`, row: (t, k = 'r', p = PID) => `channels/${cid}/acts/${p}~${t}~${k}` };
}
const act = (x, cid, kind = 'r', over = {}) => x.call('chat.act', { cid, post: PID, kind, e: 0, ...choice(), ...over });
const actOk = async (...a) => { const r = await act(...a); assert.ok(r.ok, `chat.act failed: ${r.e} (${r.m})`); };
const slot = (cid, p, k, h) => keyedId(st.addrKey, 'act', `${cid}|${p}|${k}|${h}`).slice(0, 22);
const stored = (col) => st.db.prepare('SELECT id, d, ts, exp FROM docs WHERE parent = ? ORDER BY id').all(col);
// A row from before this change, as it stands in the docs table: no change is announced for it.
const oldDoc = (p = PID, k = 'r', e = 0) => ({ post: p, kind: k, e, iv: 'aXY=', ct: 'c2ln', ts: 1700000000000 });
const putOld = (col, t, p = PID, k = 'r') => st.q.put.run(`${col}/${p}~${t}~${k}`, col, `${p}~${t}~${k}`, JSON.stringify(oldDoc(p, k)), 1700000000000, 0);
const said = (r) => (r.ok ? 'ok' : `${r.e} (${r.m})`);
// A whole row, an update with a patch that never validates, one that does, and a delete.
const writes = async (x, p) => [said(await x.call('set', { p, d: oldDoc() })), said(await x.call('update', { p, d: { zzz: 1 } })), said(await x.call('update', { p, d: { ct: 'bmV3' } })), said(await x.call('delete', { p }))];
const CLOSED = Array(4).fill('denied (reactions and votes in a channel are written with chat.act)'), NOKEY = Array(4).fill('denied (open this chat with its key first)'), UNAUTH = Array(4).fill('unauth (sign in first)');
// Every row read that `fn` makes under this collection, by the store's one document read.
async function readsDuring(col, fn) {
  const real = st.q.get, seen = [];
  st.q.get = { get: (p) => { if (p.startsWith(col + '/')) seen.push(p); return real.get(p); } };
  try { await fn(); } finally { st.q.get = real; }
  return seen;
}
const docsOf = (r) => r.docs.map((x) => ({ id: x.id, d: x.d })).sort((a, b) => (a.id < b.id ? -1 : 1));
// What `x` gets for these rows by each way of reading: get, mget, query, a sub's first answer and a watch's by ids.
async function everyRead(x, col, ids_) {
  const s = 'rd' + randomBytes(6).toString('hex'), w = s + 'w';
  await x.ok('sub', { s, p: col, l: 100 }); const init = await x.waitPush((f) => f.s === s && f.t === 'init');
  await x.ok('sub', { s: w, p: col, ids: ids_ }); const byIds = await x.waitPush((f) => f.s === w && f.t === 'init');
  await x.ok('unsub', { s }); await x.ok('unsub', { s: w });
  const keep = (l) => l.filter((r) => r.d !== null);
  return {
    get: keep(await Promise.all(ids_.map(async (id) => { const r = await x.ok('get', { p: `${col}/${id}` }); return { id: r.id, d: r.d }; }))),
    mget: keep((await x.ok('mget', { ps: ids_.map((id) => `${col}/${id}`) })).docs.map((r) => ({ id: r.id, d: r.d }))),
    query: docsOf(await x.ok('query', { p: col, l: 100 })),
    sub: docsOf(init),
    watch: docsOf(byIds),
  };
}

test('chat.act files a channel\'s reaction or vote under a slot only the server works out (keyedId over the chat, the post, the kind and the username, cut to 22 characters), in the id shape post~slot~kind, and the row carries the post, the kind, the epoch, the sealed choice and the mark `an`: nothing the frame adds, no name, tag, signature or time, in the row or the docs table', async () => {
  const { cid, col } = await chan('Shape'), c = choice();
  await sue.ok('chat.act', { cid, post: PID, kind: 'r', e: 0, ...c, ts: 5, sg: 'c2ln', by: SUE, tag: TAG('s'), an: 7, exp: 9 });
  const id = `${PID}~${slot(cid, PID, 'r', SUE)}~r`, row = { post: PID, kind: 'r', e: 0, iv: c.iv, ct: c.ct, an: 1 };
  assert.deepEqual(docsOf(await sam.ok('query', { p: col, l: 10 })), [{ id, d: row }], 'in the id shape, with those fields and no others');
  const [r] = stored(col);
  assert.deepEqual([r.id, JSON.parse(r.d), r.ts, r.exp], [id, row, null, 0], 'and so in the docs table: no time in its ts column, no expiry');
  assert.doesNotMatch(JSON.stringify(r), new RegExp(SUE), 'no username anywhere');
});

test('chat.act is for a signed-in account that exists, holding a level on the channel, not blocked, as chat.card: it is refused to a connection that never signs in, a sign-up proof with no account, no level, a blocked admin, and in a group or a one-on-one chat; a key that opened the channel below is all a subscriber needs, the owner and an admin use it too', async () => {
  const { cid, col, caps } = await chan('Who'), anon = await connect(S.url); await anon.hello();
  const fresh = await connectAs(S.url, await makeIdentity('no_account_yet'), { pub: true });
  const g = gid('Who'), dm = 'd' + 'WhoDm'.padEnd(22, 'x'); await createChat(olga, g, groupDoc()); await createChat(olga, dm, dmDoc(), { m: cap() });
  await olga.ok('set', { p: `channels/${g}/posts/${PID}`, d: post() }); await olga.ok('set', { p: `channels/${dm}/posts/${PID}`, d: post() });
  try {
    await fresh.ok('chat.open', { cid, cap: caps.m });
    assert.equal(said(await act(anon, cid)), 'unauth (sign in first)');
    assert.equal(said(await act(fresh, cid)), 'unauth (create your account first)', 'a sign-up proof is free: every unused name would be a row');
    assert.equal(said(await act(nora, cid)), 'denied (open this chat with its key first)');
    assert.equal(said(await act(olga, g)), 'denied (reactions and votes are written with chat.act in channels only)', 'a group keeps its own rows');
    assert.equal(said(await act(olga, dm)), 'denied (reactions and votes are written with chat.act in channels only)', 'so does a one-on-one chat');
    assert.equal(said(await act(sam, 'cNoSuchChat00')), 'notfound (no such chat)');
    await olga.ok('chat.ban', { cid, h: 'adam', on: true });
    assert.equal(said(await act(adam, cid)), 'denied (you were removed from this chat)', 'a blocked admin still holds the admin key, and it writes no row');
    await olga.ok('chat.ban', { cid, h: 'adam', on: false });
    await olga.ok('chat.ban', { cid, h: SAM, on: true });
    assert.equal(said(await act(sam, cid)), 'denied (open this chat with its key first)', 'a blocked subscriber lost his level');
    assert.deepEqual(stored(col), [], 'none of those wrote a row');
    await actOk(olga, cid); await actOk(adam, cid); await actOk(sue, cid);
    assert.equal(stored(col).length, 3, 'the owner, an admin and a subscriber each file one');
  } finally { await anon.close(); await fresh.close(); }
});

test('chat.act costs what a reaction costs today, the marks\' budget (sideWritesPerMin), shared with read marks; its refusal comes before anything else', async () => {
  const T = await startServer({ authz: 'standard', limits: { sideWritesPerMin: 3 } }), x = await signup(T.url, await makeIdentity('xena'));
  try {
    const cid = chid('Budget'); await createChat(x, cid, channelDoc());
    await x.ok('set', { p: `channels/${cid}/posts/${PID}`, d: post() });
    await actOk(x, cid); await actOk(x, cid, 'v');
    await x.ok('set', { p: `channels/${cid}/reads/0~${TAG('x')}`, d: { ts: 1, iv: 'aXY=', ct: 'c2ln' } });
    assert.equal(said(await act(x, cid)), 'ratelimit (too many marks; slow down)', 'the fourth mark in a minute of three');
    assert.equal(said(await x.call('chat.act', {})), 'ratelimit (too many marks; slow down)', 'even a frame that would not validate');
  } finally { await x.close(); await T.stop(); }
});

test('chat.act takes only a well-formed row: a post id of the act id\'s shape as a string, kind r or v, a whole epoch, a 12-byte iv and a choice of exactly one size in plain base64; a post that is not there is refused, so no row outlives its post; nothing is written', async () => {
  const { cid, col } = await chan('Shape2');
  const bad = [{ cid: 5 }, { cid: 'nope' }, { post: 5 }, { post: [PID] }, { post: undefined }, { post: 'short' }, { post: 'pOsT12345678~x' }, { post: '../pOsT123456' }, { kind: 'react' }, { kind: 'x' }, { kind: 1 }, { kind: ['r'] }, { kind: undefined },
    { e: undefined }, { e: '0' }, { e: 0.5 }, { e: -1 }, { e: 2 ** 31 }, { iv: undefined }, { iv: 5 }, { iv: ['aXZhaXZhaXZhaXZh'] }, { iv: 'aXY=' }, { iv: randomBytes(16).toString('base64') }, { iv: '*'.repeat(16) }, { iv: 'aXZh' }, { iv: 'aXZhaXZhaXZhaXZ' }, { iv: 'aXZhaXZhaXZhaXZha' }, { iv: 'aXZhaXZhaXZhaXZh'.repeat(4) },   // of the alphabet with no padding: only the length is wrong
    { ct: undefined }, { ct: 5 }, { ct: randomBytes(79).toString('base64') }, { ct: randomBytes(81).toString('base64') }, { ct: randomBytes(64 * 1024).toString('base64') }, { ct: '!'.repeat(108) }, { ct: randomBytes(80).toString('base64').slice(0, 100) + ' '.repeat(8) }, { ct: [randomBytes(80).toString('base64')] }, { ct: '!.,!' + randomBytes(80).toString('base64') }];
  for (const o of bad) assert.equal((await act(sue, cid, 'r', o)).e, 'invalid', JSON.stringify(o).slice(0, 60));
  assert.equal(said(await act(sue, cid, 'r', { post: PID2 })), 'notfound (no such message)', 'no such post');
  assert.deepEqual(stored(col), []);
});

test('an account has one row per post and kind: a rewrite and its second device write over it, a reaction and a vote are two rows, and it does not move with the key; slots of one account on different posts, and of two accounts on one post, look unrelated', async () => {
  const { cid, col } = await chan('One');
  await olga.ok('set', { p: `channels/${cid}/posts/${PID2}`, d: post() });
  await actOk(sue, cid); const first = stored(col);
  await actOk(sue, cid); const second = stored(col);
  await actOk(sue2, cid); const third = stored(col);
  assert.deepEqual([first.length, second.length, third.length], [1, 1, 1], 'one row through two rewrites, the last from her other device');
  assert.deepEqual([second[0].id, third[0].id], [first[0].id, first[0].id], 'the same slot');
  assert.notEqual(JSON.parse(third[0].d).ct, JSON.parse(first[0].d).ct, 'each written over the last');
  await actOk(sue, cid, 'v'); await actOk(sue2, cid, 'v'); await actOk(sue, cid, 'r', { post: PID2 }); await actOk(sam, cid);
  const all = stored(col).map((r) => r.id), part = (i) => i.split('~')[1];
  assert.equal(all.length, 4, 'a vote is a row of its own, so is another post and another account');
  const sr = slot(cid, PID, 'r', SUE), sv = slot(cid, PID, 'v', SUE), sp = slot(cid, PID2, 'r', SUE), om = slot(cid, PID, 'r', SAM);
  assert.deepEqual(new Set(all.map(part)), new Set([sr, sv, sp, om]));
  assert.equal(new Set([sr, sv, sp, om]).size, 4, 'no slot repeats');
  assert.ok([sr, sv, sp, om].every((x) => x.length === 22), 'each 22 characters');
  for (const [a, b] of [[sr, sv], [sr, sp], [sr, om]]) assert.notEqual(a.slice(0, 6), b.slice(0, 6), 'nothing shared at their start');
  assert.deepEqual([st.get(`${col}/${PID}~${sr}~r`, SYSTEM).d.post, st.get(`${col}/${PID2}~${sp}~r`, SYSTEM).d.post], [PID, PID2], 'ids that still parse (ACT_ID)');
});

test('a row sealed under an older key is refused (`conflict`, as today), once the channel has a newer one; rows already there stay; written again, an account\'s row keeps its slot and moves to the new epoch', async () => {
  const { cid, col } = await chan('Epoch');
  await actOk(sue, cid); await actOk(sam, cid); const id = `${PID}~${slot(cid, PID, 'r', SUE)}~r`;
  const k1 = cap(); await olga.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: k1, meta: sealed(1) });
  for (const x of [sam, sue]) await x.ok('chat.open', { cid, cap: k1 });
  assert.equal(said(await act(sue, cid, 'r', { e: 0 })), 'conflict (reaction: sealed under an older key; the channel has a newer one)');
  assert.equal(said(await act(sue, cid, 'r', { e: 2 })), 'conflict (reaction: sealed under an older key; the channel has a newer one)', 'nor one it has not reached');
  assert.deepEqual(stored(col).map((r) => JSON.parse(r.d).e), [0, 0], 'both rows of the older key are still there');
  await actOk(sue, cid, 'r', { e: 1 });
  assert.equal((await sam.ok('get', { p: `${col}/${id}` })).d.e, 1, 'same id, new epoch');
  assert.equal(stored(col).length, 2);
});

test('everyone who can read the channel gets the same rows, byte for byte, by get, mget, query, a sub\'s first answer, a watch by ids and each live change: the owner, an admin, two subscribers and the writer itself; no level differs', async () => {
  const { cid, col } = await chan('Same');
  await actOk(sue, cid); await actOk(sam, cid, 'v');
  const list = stored(col).map((r) => r.id), want = stored(col).map((r) => ({ id: r.id, d: JSON.parse(r.d) }));
  for (const x of [olga, adam, sam, sue, sue2]) {
    const seen = await everyRead(x, col, list);
    for (const way of ['get', 'mget', 'query', 'sub', 'watch']) assert.deepEqual(docsOf({ docs: seen[way] }), want, way);
  }
  const watchers = [olga, adam, sam, sue, sue2];
  for (const x of watchers) { await x.ok('sub', { s: 'live', p: col, l: 100 }); await x.waitPush((f) => f.s === 'live' && f.t === 'init'); }
  await actOk(sue, cid);
  const heard = await Promise.all(watchers.map((x) => x.waitPush((f) => f.s === 'live' && f.t === 'set')));
  for (const f of heard) assert.deepEqual(f, heard[0], 'the same frame to each, the writer\'s own connections too');
  assert.deepEqual(Object.keys(heard[0]).sort(), ['d', 'id', 's', 't']);
  for (const x of watchers) await x.ok('unsub', { s: 'live' });
});

test('a wire tap: no frame to any other connection ever tells whose a row is. Rows reach every connection alike, with no mark on them; the answer to chat.mine reaches only the connection that asked', async () => {
  const { cid, col } = await chan('Tap'), watchers = [olga, adam, sam, sue, sue2], taps = new Map();
  for (const x of watchers) { const t = []; taps.set(x, t); x.ws.on('message', (m) => t.push(String(m))); await x.ok('sub', { s: 'tap', p: col, l: 100 }); await x.waitPush((f) => f.s === 'tap' && f.t === 'init'); }
  await actOk(sue, cid); await actOk(sue2, cid); await actOk(sam, cid, 'v');
  await Promise.all(watchers.map(async (x) => { for (let i = 0; i < 3; i++) await x.waitPush((f) => f.s === 'tap' && f.t === 'set'); }));
  const mineSue = (await sue.ok('chat.mine', { cid, posts: [PID] })).ids, mineSam = (await sam.ok('chat.mine', { cid, posts: [PID] })).ids;
  await olga.ok('unsub', { s: 'tap' }); for (const x of [adam, sam, sue, sue2]) await x.ok('unsub', { s: 'tap' });
  const frames = (x) => taps.get(x).map((s) => JSON.parse(s)), sets = (x) => frames(x).filter((f) => f.t === 'set');
  for (const x of watchers) {
    for (const f of frames(x).filter((y) => y.s === 'tap')) if (f.t !== 'init') { assert.deepEqual(Object.keys(f).sort(), ['d', 'id', 's', 't']); assert.deepEqual(Object.keys(f.d).sort(), ['an', 'ct', 'e', 'iv', 'kind', 'post']); assert.equal(f.d.an, 1); }
    assert.deepEqual(sets(x), sets(olga), 'the same frames, in the same order, to every connection, its own writes included');
    for (const s of taps.get(x)) assert.doesNotMatch(s, new RegExp(`${SUE}|${SAM}`), 'no username on the wire');
  }
  const answers = (x) => frames(x).filter((f) => Array.isArray(f.ids));
  assert.deepEqual([answers(olga), answers(adam), answers(sue2)], [[], [], []], 'no answer to chat.mine reached the owner, the admin or her other connection');
  assert.deepEqual(answers(sue).map((f) => f.ids), [mineSue]); assert.deepEqual(answers(sam).map((f) => f.ids), [mineSam]);
  assert.notDeepEqual(mineSue, mineSam, 'each has its own');
  assert.ok(mineSue.includes(`${PID}~${slot(cid, PID, 'r', SUE)}~r`) && mineSam.includes(`${PID}~${slot(cid, PID, 'v', SAM)}~v`));
  assert.ok(!mineSue.includes(`${PID}~${slot(cid, PID, 'r', SAM)}~r`), 'she is not told his');
});

test('chat.mine answers an account with the row ids its own reaction and vote sit under on the posts it names, for that account alone: both devices get the same, reading nothing stored, whether or not a row is there; never for a name it asks about; it costs a query token; it is refused to a sign-up proof with no account (a slot learned for a name nobody has yet would name whoever takes it), no level, a blocked admin, a group and a one-on-one chat, and on a bad list', async () => {
  const { cid, col, caps } = await chan('Mine'), own = (h, p = PID) => [`${p}~${slot(cid, p, 'r', h)}~r`, `${p}~${slot(cid, p, 'v', h)}~v`];
  await actOk(sue, cid);
  const reads = await readsDuring(col, async () => {
    assert.deepEqual((await sue.ok('chat.mine', { cid, posts: [PID, PID2] })).ids, [...own(SUE), ...own(SUE, PID2)], 'in the order asked, a row or none');
    assert.deepEqual((await sue2.ok('chat.mine', { cid, posts: [PID] })).ids, own(SUE), 'her other device: the same');
    assert.deepEqual((await sam.ok('chat.mine', { cid, posts: [PID], h: SUE })).ids, own(SAM), 'his own, whatever he names: nothing in the frame picks the account');
  });
  assert.deepEqual(reads, [], 'nothing stored was read');
  assert.deepEqual((await olga.ok('chat.mine', { cid, posts: [] })).ids, []);
  const anon = await connect(S.url); await anon.hello();
  const fresh = await connectAs(S.url, await makeIdentity('unused_name'), { pub: true });
  const g = gid('Mine'); await createChat(olga, g, groupDoc());
  const dm = 'd' + 'MineDm'.padEnd(22, 'x'); await createChat(olga, dm, dmDoc(), { m: cap() });
  try {
    await fresh.ok('chat.open', { cid, cap: caps.m });
    const ask = (x, c = cid, posts = [PID]) => x.call('chat.mine', { cid: c, posts });
    assert.equal(said(await ask(anon)), 'unauth (sign in first)');
    assert.equal(said(await ask(fresh)), 'unauth (create your account first)');
    assert.equal(said(await ask(nora)), 'denied (open this chat with its key first)');
    assert.equal(said(await ask(olga, g)), 'denied (reactions and votes are written with chat.act in channels only)');
    assert.equal(said(await ask(olga, dm)), 'denied (reactions and votes are written with chat.act in channels only)');
    await olga.ok('chat.ban', { cid, h: 'adam', on: true });
    assert.equal(said(await ask(adam)), 'denied (you were removed from this chat)');
    for (const posts of [undefined, 'x', [5], [['pOsT12345678']], ['short'], Array(301).fill(PID)]) assert.equal((await sue.call('chat.mine', { cid, posts })).e, 'invalid', String(JSON.stringify(posts)).slice(0, 40));
    assert.equal((await ask(sue, 5)).e, 'invalid');
  } finally { await anon.close(); await fresh.close(); }
  const T = await startServer({ authz: 'standard', limits: { queriesPerMin: 2 } }), x = await signup(T.url, await makeIdentity('xena'));
  try {
    const c2 = chid('MineQ'); await createChat(x, c2, channelDoc());
    await x.ok('chat.mine', { cid: c2, posts: [PID] }); await x.ok('query', { p: `channels/${c2}/acts`, l: 1 });
    assert.equal(said(await x.call('chat.mine', { cid: c2, posts: [PID] })), 'ratelimit (too many queries, slow down)', 'one budget with query and mget');
  } finally { await x.close(); await T.stop(); }
});

test('in a channel set, update and delete of a reaction or vote are refused at every level, the owner\'s included, with one answer whether or not a row is there, before anything stored is read; a row, its slot known or not, stays as it was', async () => {
  for (const [name, doc] of [['Closed', channelDoc()], ['ClosedPub', pubDoc()]]) {
    const { cid, col, row } = await chan(name, doc);
    await actOk(sue, cid); putOld(col, TAG('s'));
    const was = stored(col), mine = slot(cid, PID, 'r', SUE), anon = await connect(S.url); await anon.hello();
    try {
      const reads = await readsDuring(col, async () => {
        for (const x of [olga, adam, sam, sue, sue2]) {
          assert.deepEqual([await writes(x, row(TAG('s'))), await writes(x, row(mine)), await writes(x, row(TAG('z')))], [CLOSED, CLOSED, CLOSED], 'an old row, a new row, none: one answer');
        }
        assert.deepEqual([await writes(nora, row(TAG('s'))), await writes(nora, row(mine)), await writes(nora, row(TAG('z')))], [NOKEY, NOKEY, NOKEY], 'no level: one answer');
        assert.deepEqual([await writes(anon, row(TAG('s'))), await writes(anon, row(mine)), await writes(anon, row(TAG('z')))], [UNAUTH, UNAUTH, UNAUTH], 'not signed in: one answer');
      });
      assert.deepEqual(reads, [], 'nothing stored was read to answer');
      assert.deepEqual(stored(col), was, 'nothing changed');
    } finally { await anon.close(); }
  }
});

test('a row from before this change stays stored and reads as none at every level by get, mget, query, a sub and a watch, in a private and a public channel, and is never answered with `denied`, so a page\'s watch is not refused and nothing is evicted; rows filed by chat.act read as usual beside it; a query\'s limit is not used up by it', async () => {
  for (const [name, doc] of [['OldRows', channelDoc()], ['OldRowsPub', pubDoc()]]) {
    const { cid, col } = await chan(name, doc);
    const oldIds = ['A', 'B', 'C'].map((c) => { putOld(col, TAG(c)); return `${PID}~${TAG(c)}~r`; });
    await actOk(sue, cid); const fresh = stored(col).find((r) => JSON.parse(r.d).an === 1), want = [{ id: fresh.id, d: JSON.parse(fresh.d) }];
    for (const x of [olga, adam, sam, sue]) {
      const seen = await everyRead(x, col, [...oldIds, fresh.id]);
      for (const way of ['get', 'mget', 'query', 'sub', 'watch']) assert.deepEqual(seen[way], want, way + ': only the new row');
      assert.deepEqual((await x.ok('query', { p: col, l: 1 })).docs.map((r) => r.id), [fresh.id], 'limit 1 finds it, past the three old rows that sort first');
      assert.equal((await x.call('query', { p: col, w: [['ct', '==', 'c2ln']], l: 10 })).e, 'invalid', 'nor does a filter on an old row\'s field find one: it is refused before anything is read (release 112)');
      assert.deepEqual((await x.ok('query', { p: col, w: [['ts', '>', 0]], o: ['ts', 'desc'], l: 10 })).docs, [], 'nor one on its time');
    }
    sam.pushes.length = 0;
    const heldOn = await sam.ok('sub', { s: 'ev', p: col, ids: oldIds }); assert.ok(heldOn.ok, 'a watch of old rows is not refused');
    assert.deepEqual((await sam.waitPush((f) => f.s === 'ev' && f.t === 'init')).docs, []);
    assert.ok(await sam.noPush((f) => f.t === 'evict', 100), 'nothing evicted');
    await sam.ok('unsub', { s: 'ev' });
    assert.equal(stored(col).length, 4, 'all still stored');
    assert.deepEqual(st.get(`${col}/${oldIds[0]}`, SYSTEM).d, oldDoc(), 'as they were');
  }
});

test('a guessed tag gets one answer on every op: at any level get, mget, query, a sub and a watch tell an old row from none in nothing, and set, update and delete answer alike; below a level the refusal is the same either way', async () => {
  const { cid, col, row } = await chan('Probe');
  putOld(col, TAG('s'));
  const probe = async (x) => {
    const one = async (t) => {
      const s = 'pr' + randomBytes(6).toString('hex'), r = [];
      r.push(said(await x.call('get', { p: row(t) })), JSON.stringify((await x.call('get', { p: row(t) })).d));
      const m = await x.call('mget', { ps: [row(t)] }); r.push(said(m), JSON.stringify((m.docs || []).map((d) => d.d)));
      const q = await x.call('query', { p: col, w: [['ts', '>', 0]], l: 10 }); r.push(said(q), JSON.stringify(q.docs));
      const w = await x.call('sub', { s, p: col, ids: [`${PID}~${t}~r`] }); r.push(said(w));
      if (w.ok) { r.push(JSON.stringify((await x.waitPush((f) => f.s === s && f.t === 'init')).docs)); await x.ok('unsub', { s }); }
      r.push(...await writes(x, row(t)));
      return r;
    };
    return [await one(TAG('s')), await one(TAG('z'))];
  };
  const anon = await connect(S.url); await anon.hello();
  try {
    for (const x of [olga, adam, sam, sue, nora, anon]) { const [a, b] = await probe(x); assert.deepEqual(a, b); }
    const [a] = await probe(sam);
    assert.deepEqual(a.slice(0, 2), ['ok', 'null'], 'a subscriber: none');
  } finally { await anon.close(); }
  assert.deepEqual(st.get(`${col}/${PID}~${TAG('s')}~r`, SYSTEM).d, oldDoc(), 'and it stays');
});

test('when a post goes, by deletion or by the timer sweep, its rows go with it, new and old: the new ones heard as usual by every watcher; an old row\'s tag never reaches a wire, since anyone holding the key can test it against a username; deleting the chat takes the rest', async () => {
  const { cid, col, row } = await chan('Gone'), exp = Date.now() + 60_000;
  await olga.ok('set', { p: `channels/${cid}/posts/${PID2}`, d: post({ exp }) });
  const POST3 = 'pOsT33333333'; await olga.ok('set', { p: `channels/${cid}/posts/${POST3}`, d: post() });
  for (const p of [PID, PID2, POST3]) { await actOk(sue, cid, 'r', { post: p }); await actOk(sam, cid, 'v', { post: p }); putOld(col, TAG('s'), p); }
  const frames = [], tap = (m) => frames.push(String(m)), COMMENT = 'cOmMeNt00001';
  await olga.ok('set', { p: `channels/${cid}/comments/${COMMENT}`, d: post({ post: PID }) });
  await sam.ok('sub', { s: 'gc', p: `channels/${cid}/comments`, l: 10 }); await sam.waitPush((f) => f.s === 'gc' && f.t === 'init');
  await sam.ok('sub', { s: 'g', p: col, l: 100 }); await sam.waitPush((f) => f.s === 'g' && f.t === 'init');
  sam.ws.on('message', tap);
  await olga.ok('delete', { p: `channels/${cid}/posts/${PID}` });
  await sam.waitPush((f) => f.s === 'gc' && f.t === 'del' && f.id === COMMENT);   // a comment goes with its post, heard as ever
  const gone = [slot(cid, PID, 'r', SUE), slot(cid, PID, 'v', SAM)];
  await sam.waitPush((f) => f.s === 'g' && f.t === 'del' && f.id === `${PID}~${gone[0]}~r`); await sam.waitPush((f) => f.s === 'g' && f.t === 'del' && f.id === `${PID}~${gone[1]}~v`);
  assert.equal(stored(col).filter((r) => r.id.startsWith(PID + '~')).length, 0, 'deleting the post: its three rows are gone, the old one too');
  assert.equal(S.srv.sweep(exp + 1), 1, 'the timer: one expired post');
  await sam.waitPush((f) => f.s === 'g' && f.t === 'del' && f.id === `${PID2}~${slot(cid, PID2, 'r', SUE)}~r`); await sam.waitPush((f) => f.s === 'g' && f.t === 'del' && f.id === `${PID2}~${slot(cid, PID2, 'v', SAM)}~v`);
  assert.equal(stored(col).filter((r) => r.id.startsWith(PID2 + '~')).length, 0, 'the timer took its three');
  assert.ok(await sam.noPush((f) => f.s === 'g' && f.t === 'del' && f.id.includes(TAG('s')), 100));
  sam.ws.off('message', tap); await sam.ok('unsub', { s: 'g' }); await sam.ok('unsub', { s: 'gc' });
  assert.ok(frames.length >= 4 && !frames.some((s) => s.includes(TAG('s'))), 'no frame carried an old row\'s tag');
  assert.equal(stored(col).length, 3, 'the third post keeps its three');
  await writes(olga, row(TAG('s')));   // refused: changes nothing
  await olga.ok('delete', { p: 'channels/' + cid });
  assert.equal(stored(col).length, 0, 'deleting the chat takes the rest');
});

test('a public channel: anyone holding the published key reacts and votes once per account and gets the same rows as the owner; Make public leaves rows filed under a private channel as they are (they name nobody), and old rows stay hidden through it', async () => {
  const { cid, col, caps } = await chan('Pub', pubDoc());
  await nora.ok('chat.open', { cid, cap: caps.m });
  await actOk(nora, cid); await actOk(nora, cid); await actOk(sam, cid, 'v');
  assert.equal(stored(col).length, 2);
  assert.deepEqual(docsOf(await nora.ok('query', { p: col, l: 10 })), docsOf(await olga.ok('query', { p: col, l: 10 })));
  const p = await chan('Pub2'); putOld(p.col, TAG('s')); await actOk(sue, p.cid);
  await olga.ok('update', { p: 'channels/' + p.cid, d: { visibility: 'public', openKeys: { 0: 'k'.repeat(44) }, name: 'N', desc: '', photo: null, owner: 'olga', admins: [], meta: null, invites: {} } });
  const rows = docsOf(await sue.ok('query', { p: p.col, l: 10 }));
  assert.deepEqual([rows.length, rows[0].d.an, stored(p.col).length], [1, 1, 2], 'the new row reads on; the old one stays hidden');
});

test('an admin whose account is not secured holds the channel at member level, and gets what everyone gets: the same rows, one row of his own, his direct writes refused', async () => {
  const T = await startServer({ authz: 'standard', limits: { powerNeedsSecure: true } });
  const o = await signup(T.url, await makeIdentity('owner_ok')), h = await signup(T.url, await makeIdentity('held_admin')), m = await signup(T.url, await makeIdentity('member_m'));
  try {
    await o.ok('set', { p: 'secure/owner_ok', d: { ts: 1 } });
    const cid = chid('Held'), { caps } = await createChat(o, cid, channelDoc()), col = `channels/${cid}/acts`;
    assert.equal((await h.ok('chat.open', { cid, cap: caps.a })).held, 'admin');
    await m.ok('chat.open', { cid, cap: caps.m });
    await o.ok('set', { p: `channels/${cid}/posts/${PID}`, d: post() });
    await actOk(h, cid); await actOk(h, cid); await actOk(m, cid);
    const rows = docsOf(await o.ok('query', { p: col, l: 10 }));
    assert.equal(rows.length, 2);
    assert.deepEqual([docsOf(await h.ok('query', { p: col, l: 10 })), docsOf(await m.ok('query', { p: col, l: 10 }))], [rows, rows]);
    assert.deepEqual(await writes(h, `${col}/${rows[0].id}`), CLOSED);
  } finally { for (const x of [o, h, m]) await x.close(); await T.stop(); }
});

test('a group and a one-on-one chat do not change: rows are written whole under the page\'s tag, read, updated and deleted as before, heard when their post goes, and may not carry the mark', async () => {
  const g = gid('Same'), gc = await createChat(olga, g, groupDoc()), dm = 'd' + 'SameDm'.padEnd(22, 'x'), dk = cap();
  await createChat(olga, dm, dmDoc(), { m: dk });
  await sam.ok('chat.open', { cid: g, cap: gc.caps.m }); await sue.ok('chat.open', { cid: g, cap: gc.caps.m }); await sam.ok('chat.open', { cid: dm, cap: dk });
  for (const [cid, x, y] of [[g, sue, sam], [dm, olga, sam]]) {
    const col = `channels/${cid}/acts`, P = (t) => `${col}/${PID}~${TAG(t)}~r`, d = { ...oldDoc(), ts: 5 };
    await x.ok('set', { p: P('s'), d });
    assert.equal((await x.call('set', { p: P('m'), d: { ...d, an: 1 } })).e, 'invalid', 'the mark is not for them');
    assert.deepEqual((await y.ok('get', { p: P('s') })).d, d, 'read by a member, its fields as written, ts and all');
    assert.deepEqual((await y.ok('query', { p: col, l: 10 })).docs, [{ id: `${PID}~${TAG('s')}~r`, d }]);
    await y.ok('update', { p: P('s'), d: { ct: 'bmV3' } });
    assert.equal((await y.ok('get', { p: P('s') })).d.ct, 'bmV3', 'and updated');
    assert.equal(said(await y.call('update', { p: P('z'), d: { ct: 'bmV3' } })), 'notfound (no document to update)');
    await y.ok('sub', { s: 'gg', p: col, l: 10 }); await y.waitPush((f) => f.s === 'gg' && f.t === 'init');
    await x.ok('set', { p: `channels/${cid}/posts/${PID}`, d: post() });
    await x.ok('delete', { p: `channels/${cid}/posts/${PID}`, ot: 't0' });
    await y.waitPush((f) => f.s === 'gg' && f.t === 'del' && f.id === `${PID}~${TAG('s')}~r`);
    await y.ok('unsub', { s: 'gg' });
    await x.ok('set', { p: P('s'), d });
    await x.ok('delete', { p: P('s') });
    assert.equal((await y.ok('get', { p: P('s') })).d, null, 'and deleted');
  }
});
