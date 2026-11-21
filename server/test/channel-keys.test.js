// Release 91, channel keys (SPEC.md 5.4, 5.6, 5.7): a channel's epochs go past 31 (a group's and a DM's stop there); a channel's
// leave rotations come at most once every 15 minutes and 8 times a day; new posts, comments, reactions and votes are sealed under
// the current epoch; the key chain (`back` on chat.rotate, chat.chain); links carried over a key change; prune; the wrap cap.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startServer, signup, connectAs, makeIdentity, createChat, channelDoc, groupDoc, dmDoc, cap, label, wrap, sealed, CAPS, throwsCode } from './helpers.js';
import { Store } from '../src/store.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const chid = (s) => ('c' + s + '0'.repeat(12)).slice(0, 13);
const gid = (s) => ('g' + s + '0'.repeat(12)).slice(0, 13);
const post = (e, over = {}) => ({ sl: 1, ts: T, e, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: sha('t0'), on: 0, ...over });
const svc = (e) => ({ sv: 1, ts: T, e, n: 'n', d: 'd' });
const act = (cid, pid, e) => ({ cid, post: pid, kind: 'r', ...(e === undefined ? {} : { e }), iv: 'aXZhaXZhaXZhaXZh', ct: Buffer.alloc(80, 1).toString('base64') });
const row = (e) => (e === 0 ? { c: 'Yw==' } : { b: 'Yg==', c: 'Yw==' });
const labels = (n) => Object.fromEntries(Array.from({ length: n }, () => [label(), wrap()]));
const devs = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => ['dev' + String(i).padStart(4, '0'), { x: 'x', y: 'y', sx: 'sx', sy: 'sy', s: 's' }]));
const MIN = 60_000;

let T = Date.now(), S, A, B, C, D, E, F, ids;
before(async () => {
  S = await startServer({ authz: 'standard', now: () => T, limits: { postsPerMin: 1000 } });
  ids = await Promise.all(['alice', 'bob', 'carol', 'dave', 'erin', 'frank'].map(makeIdentity));
  [A, B, C, D, E, F] = await Promise.all(ids.map((id) => signup(S.url, id)));
});
after(async () => { for (const X of [A, B, C, D, E, F]) await X.close(); await S.stop(); });

// A rotation by X to `epoch`; `k` is its new member key. Every other connection then opens the chat again.
async function rot(X, cid, epoch, extra = {}) {
  const k = cap();
  return { ...(await X.call('chat.rotate', { cid, epoch, keys: { [label()]: wrap() }, cap: k, meta: sealed(epoch), ...extra })), k };
}
async function rotOk(X, cid, epoch, extra) { const r = await rot(X, cid, epoch, extra); assert.ok(r.ok, `${epoch}: ${r.e} ${r.m}`); return r.k; }
const rec = async (cid) => (await A.ok('get', { p: 'channels/' + cid })).d;
const wrapRows = (cid) => Number(S.srv.store.db.prepare('SELECT COUNT(*) AS n FROM wraps WHERE cid = ?').get(cid).n);

test('a channel goes past epoch 31; a group and a DM stop there, and are not created past it', async () => {
  const cid = chid('Past31'), { caps } = await createChat(A, cid, channelDoc());
  let k;
  for (let e = 1; e <= 33; e++) k = await rotOk(A, cid, e);
  assert.equal((await rec(cid)).epoch, 33);
  await A.ok('update', { p: 'channels/' + cid, d: { meta: sealed(33) } });
  assert.equal((await A.call('update', { p: 'channels/' + cid, d: { openKeys: { 33: 'k'.repeat(43) } } })).e, 'invalid', 'a private channel takes no published key (release 107)');
  await A.ok('set', { p: `channels/${cid}/posts/pPast3300001`, d: post(33) });
  await C.ok('chat.open', { cid, cap: k });
  await C.ok('chat.act', act(cid, 'pPast3300001', 33));
  await C.ok('set', { p: `channels/${cid}/reads/33~${'r'.repeat(22)}`, d: { ts: T, iv: 'aXY=', ct: 'Y3Q=' } });
  await B.ok('chat.open', { cid, cap: caps.a });   // the admin key still opens it
  await A.ok('update', { p: 'channels/' + cid, d: { visibility: 'public', meta: null, openKeys: { 33: 'k'.repeat(43) } } });   // made public, and only then (release 107): a key number above 31 is published like any other
  assert.deepEqual((await rec(cid)).openKeys, { 33: 'k'.repeat(43) });

  const g = gid('Stop31');
  await createChat(A, g, groupDoc());
  for (let e = 1; e <= 31; e++) await rotOk(A, g, e);
  assert.equal((await rot(A, g, 32)).e, 'conflict');
  const dm = 'd' + 'Stop31Dm'.padEnd(22, 'x');
  await createChat(A, dm, dmDoc(), { m: cap() });
  for (let e = 1; e <= 31; e++) await rotOk(A, dm, e, { meta: undefined });
  assert.equal((await rot(A, dm, 32, { meta: undefined })).e, 'conflict');

  const M = 2 ** 31 - 1, top = chid('Top');
  await createChat(A, top, channelDoc({ epoch: M, keys: { [M]: labels(1) }, meta: sealed(M) }));
  assert.equal((await rot(A, top, M + 1)).e, 'invalid', 'and a channel stops at 2^31-1');
  assert.equal((await A.call('set', { p: `channels/${top}/posts/pTop00000001`, d: post(M + 1) })).e, 'invalid');
  assert.equal((await A.call('chat.create', { cid: chid('Over'), d: channelDoc({ epoch: M + 1, meta: sealed(M + 1) }), caps: CAPS() })).e, 'invalid');
  assert.equal((await A.call('chat.create', { cid: gid('Over'), d: groupDoc({ epoch: 32, meta: sealed(32) }), caps: CAPS() })).e, 'invalid', 'a group made at 32 could never rotate');
  assert.equal((await A.call('chat.create', { cid: 'd' + 'Over32Dm'.padEnd(22, 'x'), d: dmDoc({ epoch: 32 }), caps: { m: cap() } })).e, 'invalid');
  await A.ok('chat.create', { cid: gid('At31'), d: groupDoc({ epoch: 31, meta: sealed(31) }), caps: CAPS() });
});

test('a channel takes a leave rotation at most once every 15 minutes and 8 times a day; removals are not counted', async () => {
  const cid = chid('Leave'), t0 = T;
  await createChat(A, cid, channelDoc());
  let k = await rotOk(A, cid, 1, { why: 'leave' });
  T = t0 + MIN;
  const r = await rot(A, cid, 2, { why: 'leave' });
  assert.equal(r.e, 'ratelimit');
  assert.match(r.m, /15 minutes/);
  assert.equal((await rec(cid)).epoch, 1, 'nothing changed');
  assert.equal((await D.call('chat.open', { cid, cap: r.k })).e, 'denied', 'its member key was never recorded');
  await D.ok('chat.open', { cid, cap: k });
  k = await rotOk(A, cid, 2);   // a removal: no limit, not counted
  let e = 2;
  for (let i = 1; i < 8; i++) { T = t0 + i * 15 * MIN; await rotOk(A, cid, ++e, { why: 'leave' }); }
  T = t0 + 8 * 15 * MIN;
  assert.equal((await rot(A, cid, e + 1, { why: 'leave' })).e, 'ratelimit', 'a 9th in 24 hours');
  T = t0 + 86_400_000;
  await rotOk(A, cid, ++e, { why: 'leave' });   // the first has left the day
  while (e < 24) await rotOk(A, cid, ++e);
  T += 15 * MIN;
  await rotOk(A, cid, ++e, { why: 'leave' });   // past 23: a group's budget is not a channel's
  assert.equal((await rec(cid)).epoch, 25);
});

test('the leave times are kept with the chat: a restart forgets none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hush-leave-'));
  let t = 1_800_000_000_000, st = new Store({ dataDir: dir, now: () => t }).open();
  const cid = chid('Restart'), me = { handle: 'alice', chats: new Map([[cid, { level: 'owner' }]]) };
  const leave = (epoch) => st.rotateChat({ cid, epoch, keys: {}, cap: cap(), why: 'leave' }, me);
  try {
    st.createChat({ cid, d: channelDoc(), caps: CAPS() }, me);
    leave(1);
    st.close(); st = new Store({ dataDir: dir, now: () => t }).open();
    t += MIN;
    throwsCode(() => leave(2), 'ratelimit');
    t += 15 * MIN;
    leave(2);
  } finally { st.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('in a channel new posts, comments, notes, reactions and votes are sealed under the current epoch; an edit may keep its own', async () => {
  const cid = chid('Current');
  await createChat(A, cid, channelDoc({ comments: true }));
  await rotOk(A, cid, 1);
  const k = await rotOk(A, cid, 2);
  const P = (id) => `channels/${cid}/posts/${id}`;
  const r = await A.call('set', { p: P('pOld00000001'), d: post(1) });
  assert.equal(r.e, 'conflict');
  assert.match(r.m, /older key/);
  assert.equal((await A.ok('get', { p: P('pOld00000001') })).d, null, 'nothing stored');
  assert.equal((await A.call('set', { p: P('pOld00000002'), d: svc(1) })).e, 'conflict', 'a service note too');
  assert.equal((await A.call('set', { p: `channels/${cid}/comments/cOld00000001`, d: post(1, { post: 'pNow00000001' }) })).e, 'conflict');
  await A.ok('set', { p: P('pNow00000001'), d: post(2) });
  await A.ok('set', { p: P('pNow00000002'), d: post(2) });
  await A.ok('set', { p: P('pLater000001'), d: post(2, { ts: T + 3600e3 }) });   // scheduled an hour ahead
  await C.ok('chat.open', { cid, cap: k });
  assert.equal((await C.call('chat.act', act(cid, 'pNow00000001', 1))).e, 'conflict');
  assert.equal((await C.call('chat.act', act(cid, 'pNow00000001'))).e, 'invalid', 'a reaction names its epoch');
  await C.ok('chat.act', act(cid, 'pNow00000001', 2));

  await rotOk(A, cid, 3);
  await A.ok('update', { p: P('pNow00000001'), d: { d: 'bmV3', ot: 't0', on: 1, oh: sha('t1') } });   // an edit keeps e 2
  await A.ok('update', { p: P('pNow00000001'), d: { e: 3, d: 'bmV3', ot: 't1', on: 2, oh: sha('t2') } });   // or moves to the current one
  assert.equal((await A.call('update', { p: P('pNow00000001'), d: { e: 1, ot: 't2', on: 3, oh: sha('t3') } })).e, 'conflict');
  await A.ok('update', { p: P('pNow00000002'), d: { ot: 't0', on: 1, oh: '', d: '', n: '', del: true } });   // the wipe sends no e
  await A.ok('update', { p: P('pLater000001'), d: { ts: T, e: 3, ot: 't0', on: 1, oh: sha('t1') } });   // sent early, sealed again

  const g = gid('Current');
  await createChat(A, g, groupDoc());
  await rotOk(A, g, 1); await rotOk(A, g, 2);
  await A.ok('set', { p: `channels/${g}/posts/pGroup000001`, d: post(0) }, 'a group checks only the range');
});

test('a rotation writes the key-chain row; members read it, nobody writes it; once chained, a rotation needs its row', async () => {
  const cid = chid('Chain');
  await createChat(A, cid, channelDoc());
  const k = await rotOk(A, cid, 1, { back: row(1) });
  const RP = `channels/${cid}/chain/1`;
  await C.ok('chat.open', { cid, cap: k });
  assert.deepEqual((await C.ok('get', { p: RP })).d, row(1));
  assert.deepEqual((await C.ok('mget', { ps: [RP, `channels/${cid}/chain/0`] })).docs.map((x) => x.d), [row(1), null]);
  assert.equal((await D.call('get', { p: RP })).e, 'denied', 'no level, no row');
  for (const X of [C, A]) {
    assert.equal((await X.call('set', { p: RP, d: row(1) })).e, 'denied');
    assert.equal((await X.call('update', { p: RP, d: { c: 'eA==' } })).e, 'denied');
    assert.equal((await X.call('delete', { p: RP })).e, 'denied');
  }
  assert.equal((await C.call('query', { p: `channels/${cid}/chain`, l: 10 })).e, 'denied');

  await A.ok('chat.ban', { cid, h: 'dave', on: true });
  const r = await rot(A, cid, 2);
  assert.equal(r.e, 'conflict', 'not invalid: a page from before the chain then keeps the block and never lifts it');
  assert.match(r.m, /reload/);
  assert.equal((await rec(cid)).epoch, 1);
  assert.equal(S.srv.store.isBanned(cid, 'dave'), true);
  for (const bad of [{ b: null, c: 'Yw==' }, { ...row(1), x: 'eA==' }, { b: 'not base64!', c: 'Yw==' }, { b: 'Yg==', c: 'Y'.repeat(1025) }, { b: 'Y'.repeat(257), c: 'Yw==' }, 'Yw==']) {
    assert.equal((await rot(A, cid, 2, { back: bad })).e, 'invalid', JSON.stringify(bad));
  }
  assert.equal((await rec(cid)).epoch, 1, 'no refused rotation was applied');
  assert.equal((await A.ok('get', { p: `channels/${cid}/chain/2` })).d, null);
  await rotOk(A, cid, 2, { back: row(2) });

  const g = gid('Chain');
  await createChat(A, g, groupDoc());
  assert.equal((await rot(A, g, 1, { back: row(1) })).e, 'invalid', 'groups keep no chain');
});

test('chat.chain: an admin backfills or replaces a row of an epoch the channel has reached; a blocked admin may not', async () => {
  const cid = chid('ChainOp'), { caps } = await createChat(A, cid, channelDoc());
  await rotOk(A, cid, 1);
  const k = await rotOk(A, cid, 2);
  const chain = (X, e, d) => X.call('chat.chain', { cid, e, ...d });
  await C.ok('chat.open', { cid, cap: k });
  await B.ok('chat.open', { cid, cap: caps.a });
  await C.ok('sub', { s: 'ch', p: `channels/${cid}/chain`, ids: ['1'] });   // members watch rows by id
  assert.equal((await D.call('sub', { s: 'ch', p: `channels/${cid}/chain`, ids: ['1'] })).e, 'denied', 'no level, no watch');
  assert.equal((await chain(C, 0, row(0))).e, 'denied', 'a member');
  assert.equal((await chain(D, 0, row(0))).e, 'denied', 'no level');
  for (const e of [2, 1, 0]) await B.ok('chat.chain', { cid, e, ...row(e) });   // the head first
  for (const e of [3, 1.5, '1', -1, undefined]) assert.equal((await chain(B, e, row(1))).e, 'invalid', String(e));
  assert.equal((await chain(B, 0, row(1))).e, 'invalid', 'epoch 0 has no key before it');
  assert.equal((await chain(B, 1, row(0))).e, 'invalid', 'from epoch 1 a row brings the key before');
  await B.ok('chat.chain', { cid, e: 1, b: 'Yg==', c: 'bmV3' });
  assert.deepEqual((await C.ok('get', { p: `channels/${cid}/chain/1` })).d, { b: 'Yg==', c: 'bmV3' }, 'replaced');
  await C.waitPush((f) => f.s === 'ch' && f.t === 'set' && f.id === '1' && f.d.c === 'bmV3');   // and the watcher hears it

  await B.ok('chat.ban', { cid, h: 'alice', on: true });   // an admin can't block the owner out of their own tools
  await A.ok('chat.chain', { cid, e: 2, ...row(2) });
  await A.ok('chat.ban', { cid, h: 'bob', on: true });
  assert.equal((await chain(B, 2, row(2))).e, 'denied', 'a blocked admin still holds the admin key, and may not');
  assert.equal((await rot(B, cid, 3, { back: row(3) })).e, 'denied', 'nor rotate');
  await A.ok('chat.ban', { cid, h: 'alice', on: false });
  await rotOk(A, cid, 3, { back: row(3) });

  const g = gid('ChainOp');
  await createChat(A, g, groupDoc());
  assert.equal((await A.call('chat.chain', { cid: g, e: 0, ...row(0) })).e, 'denied');
  const fresh = chid('Backfill');
  await createChat(A, fresh, channelDoc());
  await rotOk(A, fresh, 1);
  await A.ok('chat.chain', { cid: fresh, e: 1, ...row(1) });   // its head
  assert.equal((await rot(A, fresh, 2)).e, 'conflict', 'one backfilled row makes the channel chained');
});

test('chat.chain: a channel\'s first key-chain row is its head, the current epoch\'s; a first row below it is conflict, since the head would be missing above it, and once the head is in, the rows below follow', async () => {
  const cid = chid('Head');
  await createChat(A, cid, channelDoc());
  await rotOk(A, cid, 1); await rotOk(A, cid, 2);   // a channel from before the chain: epoch 2, no rows
  const first = [];
  for (const e of [0, 1]) first.push((await A.call('chat.chain', { cid, e, ...row(e) })).e || 'written');
  assert.deepEqual(first, ['conflict', 'conflict'], 'a first row below the head, row 2, would leave the head missing above it');
  assert.deepEqual((await A.ok('mget', { ps: [0, 1, 2].map((e) => `channels/${cid}/chain/${e}`) })).docs.map((x) => x.d), [null, null, null], 'nothing written: still unchained');
  for (const e of [2, 1, 0]) await A.ok('chat.chain', { cid, e, ...row(e) });
});

test('a key-chain row with no "b" above epoch 0 (a repair: a fresh key chained to no key before it) is taken only from a connection at owner level for the channel, as chat.rotate\'s back or by chat.chain; at admin level, the owner\'s own account included, it is invalid like any malformed row, a level named in the frame counts for nothing, and the chain still starts at its head', async () => {
  const cid = chid('Repair'), { caps } = await createChat(A, cid, channelDoc()), bare = { c: 'Yw==' };
  const res = async (p) => { const r = await p; return r.ok ? 'taken' : r.e + ': ' + r.m; };
  await rotOk(A, cid, 1, { back: row(1) });   // chained
  const A2 = await connectAs(S.url, ids[0]);   // alice again, on a connection that opens the channel with the admin key
  try {
    await B.ok('chat.open', { cid, cap: caps.a }); await A2.ok('chat.open', { cid, cap: caps.a });
    const refused = [];
    for (const X of [B, A2]) refused.push(await res(rot(X, cid, 2, { back: bare })), await res(X.call('chat.chain', { cid, e: 1, ...bare })));
    refused.push(await res(rot(B, cid, 2, { back: bare, level: 'owner' })), await res(B.call('chat.chain', { cid, e: 1, ...bare, level: 'owner' })));
    assert.deepEqual(refused, Array(6).fill('invalid: chain row: field "b" is required'), 'admin level, whoever holds it, whatever the frame says');
    assert.deepEqual([(await rec(cid)).epoch, (await A.ok('get', { p: `channels/${cid}/chain/1` })).d], [1, row(1)], 'nothing changed');
    const taken = [await res(A.call('chat.chain', { cid, e: 1, c: 'bmV3' })), await res(rot(A, cid, 2, { back: bare }))];
    assert.deepEqual(taken, ['taken', 'taken'], 'the owner\'s: her head\'s commit signed again with no b, then her repair\'s key change');
    assert.deepEqual((await A.ok('mget', { ps: [0, 1, 2].map((e) => `channels/${cid}/chain/${e}`) })).docs.map((x) => x.d), [null, { c: 'bmV3' }, bare]);
    assert.equal((await rec(cid)).epoch, 2);
    await rotOk(A, cid, 3, { back: row(3) });   // and the chain goes on from the repair row
  } finally { await A2.close(); }
  const fresh = chid('RepairHead');
  await createChat(A, fresh, channelDoc()); await rotOk(A, fresh, 1); await rotOk(A, fresh, 2);   // from before the chain: epoch 2, no rows
  assert.equal(await res(A.call('chat.chain', { cid: fresh, e: 1, ...bare })), 'conflict: chat.chain: a key chain starts with the current epoch\'s row', 'the owner\'s too');
  assert.equal(await res(A.call('chat.chain', { cid: fresh, e: 0, b: 'Yg==', c: 'Yw==' })), 'invalid: chain row: field "b" is not allowed', 'epoch 0 still holds no key before it');
  assert.equal(await res(A.call('chat.chain', { cid: fresh, e: 2, ...bare })), 'taken', 'its head');
});

test('a rotation carries over the links it names, by id with the same proof, and wipes the rest', async () => {
  const cid = chid('Invites'), PROOF = 'proof-' + 'p'.repeat(30);
  await createChat(A, cid, channelDoc());
  const inv = (over) => ({ iv: 'aXY=', ct: 'Y3Q=', ph: sha(PROOF), ts: T, ...over });
  await A.ok('update', { p: 'channels/' + cid, d: { invites: { iNvOne000001: inv({ as: 'YXM=' }), iNvTwo000001: inv({ ph: sha('other-' + PROOF) }) } } });
  const before = (await rec(cid)).invites;
  const proto = JSON.parse(`{"__proto__":${JSON.stringify(inv())}}`);
  for (const invites of [{ iNvOne000001: inv({ ph: sha('x') }) }, { iNvNew000001: inv() }, proto, { iNvOne000001: 'x' }, [inv()], 'x']) {
    assert.equal((await rot(A, cid, 1, { invites })).e, 'invalid', JSON.stringify(invites));
  }
  assert.deepEqual([(await rec(cid)).epoch, (await rec(cid)).invites], [0, before], 'nothing changed');
  const k = await rotOk(A, cid, 1, { invites: { iNvOne000001: inv({ ph: sha(PROOF).toUpperCase(), ct: 'bmV3', as: 'bmV3YXM=' }) } });
  assert.deepEqual(Object.keys((await rec(cid)).invites), ['iNvOne000001'], 'the other link is gone');
  assert.deepEqual((await rec(cid)).invites.iNvOne000001.ct, 'bmV3');
  assert.deepEqual((await rec(cid)).invites.iNvOne000001.as, 'bmV3YXM=');
  assert.deepEqual(Object.keys((await D.ok('chat.invite', { cid, iid: 'iNvOne000001' }))).sort(), ['ct', 'i', 'iv', 'ok'], 'chat.invite still hands out only iv and ct');
  await D.ok('chat.join', { cid, iid: 'iNvOne000001', proof: PROOF, wraps: { 1: labels(1) } });   // the carried link still opens the door
  await rotOk(A, cid, 2);
  assert.deepEqual((await rec(cid)).invites, {}, 'a rotation without "invites" wipes them, as before');
  for (const as of ['a'.repeat(257), 7, '']) assert.equal((await A.call('update', { p: 'channels/' + cid, d: { invites: { iNvOne000001: inv({ as }) } } })).e, 'invalid', JSON.stringify(as));

  const g = gid('Invites');
  await createChat(A, g, groupDoc({ invites: { iNvOne000001: inv() } }));
  assert.equal((await rot(A, g, 1, { invites: { iNvOne000001: inv() } })).e, 'invalid', 'a group keeps today\'s rule');
});

test('prune keeps only the new wrap table, once the chain holds a row for every epoch from 0', async () => {
  const cid = chid('Prune');
  await createChat(A, cid, channelDoc());
  await rotOk(A, cid, 1);
  const k = await rotOk(A, cid, 2);
  await C.ok('chat.open', { cid, cap: k });
  await C.ok('update', { p: 'channels/' + cid, d: { keys: { 2: labels(2) } } });
  assert.equal(wrapRows(cid), 1);
  assert.equal((await rot(A, cid, 3, { prune: true })).e, 'invalid', 'without the new row');
  for (const e of [2, 1]) await A.ok('chat.chain', { cid, e, ...row(e) });
  assert.equal((await rot(A, cid, 3, { prune: true, back: row(3) })).e, 'invalid', 'row 0 missing: a device without the key could not accept it');
  await A.ok('chat.chain', { cid, e: 0, ...row(0) });
  assert.equal((await rot(A, cid, 3, { prune: 'yes', back: row(3) })).e, 'invalid');
  assert.equal((await rot(A, cid, 3, { prune: false, back: row(3) })).e, 'invalid');
  assert.deepEqual(Object.keys((await rec(cid)).keys), ['0', '1', '2']);
  await rotOk(A, cid, 3, { prune: true, back: row(3) });
  assert.deepEqual(Object.keys((await rec(cid)).keys), ['3']);
  assert.equal(wrapRows(cid), 0, 'the wrap counts below it went too');

  const g = gid('Prune');
  await createChat(A, g, groupDoc());
  assert.equal((await rot(A, g, 1, { prune: true })).e, 'invalid');
});

test('outside chat.rotate an account below admin adds at most 8 wraps per epoch to a channel, or its devices squared, up to 32', async () => {
  const cid = chid('Wraps'), PROOF = 'proof-' + 'w'.repeat(30), { caps } = await createChat(A, cid, channelDoc());
  const add = (X, e, n) => X.call('update', { p: 'channels/' + cid, d: { keys: { [e]: labels(n) } } });
  const count = async (e) => Object.keys((await rec(cid)).keys[e]).length;
  await C.ok('chat.open', { cid, cap: caps.m });
  for (const n of [3, 3, 2]) assert.ok((await add(C, 0, n)).ok);
  const r = await add(C, 0, 1);
  assert.equal(r.e, 'toolarge');
  assert.equal(await count(0), 1 + 8, 'the 9th was not stored');
  const k = await rotOk(A, cid, 1);
  await C.ok('chat.open', { cid, cap: k });
  assert.ok((await add(C, 1, 8)).ok, 'each epoch is counted on its own');
  assert.equal((await add(C, 0, 1)).e, 'toolarge');
  await A.ok('update', { p: 'channels/' + cid, d: { invites: { iNvWrap00001: { iv: 'aXY=', ct: 'Y3Q=', ph: sha(PROOF), ts: T } } } });
  assert.equal((await D.call('chat.join', { cid, iid: 'iNvWrap00001', proof: PROOF, wraps: { 1: labels(9) } })).e, 'toolarge', 'a join is counted');
  await D.ok('chat.join', { cid, iid: 'iNvWrap00001', proof: PROOF, wraps: { 0: labels(8), 1: labels(8) } });
  await E.ok('update', { p: 'directory/erin', d: { devs: devs(4) } });
  await E.ok('chat.open', { cid, cap: k });
  assert.ok((await add(E, 1, 16)).ok, 'four listed devices: 16');
  assert.equal((await add(E, 1, 1)).e, 'toolarge');
  await F.ok('update', { p: 'directory/frank', d: { devs: devs(100) } });
  await F.ok('chat.open', { cid, cap: k });
  assert.ok((await add(F, 1, 32)).ok, 'a hundred listed devices: no more than 32');
  assert.equal((await add(F, 1, 1)).e, 'toolarge');
  await A.ok('update', { p: 'channels/' + cid, d: { keys: { 1: labels(50) } } });   // the owner wraps for others: not counted
  await B.ok('chat.open', { cid, cap: caps.a });
  await B.ok('update', { p: 'channels/' + cid, d: { keys: { 1: labels(20) } } });   // nor an admin
  const ghost = await connectAs(S.url, await makeIdentity('ghost'), { pub: true });   // a sign-up proof, no account made: free
  await ghost.ok('chat.open', { cid, cap: k });
  assert.equal((await add(ghost, 1, 1)).e, 'unauth', 'each unused name would bring 8 more');
  await ghost.close();
  assert.equal(wrapRows(cid), 6, 'one row per account and epoch: carol and dave at 0 and 1, erin and frank at 1');

  const g = gid('Wraps'), gc = await createChat(A, g, groupDoc());
  await C.ok('chat.open', { cid: g, cap: gc.caps.m });
  await C.ok('update', { p: 'channels/' + g, d: { keys: { 0: labels(20) } } });   // groups as before
  assert.equal(wrapRows(g), 0);

  const del = await connectAs(S.url, ids[4]);   // erin's account key: account.delete takes her counts
  await del.ok('account.delete', {});
  await del.closed;
  assert.equal(wrapRows(cid), 5);
  await A.ok('delete', { p: 'channels/' + cid });
  assert.equal(wrapRows(cid), 0, 'and the channel takes the rest');
});

test('a wrap count runs 30 days from its first wrap, then starts again, so phone changes can\'t shut a member out for good', async () => {
  const cid = chid('WrapWin'), { caps } = await createChat(A, cid, channelDoc()), DAY = 1440 * MIN, t0 = T;
  const add = (n) => C.call('update', { p: 'channels/' + cid, d: { keys: { 0: labels(n) } } });
  await C.ok('chat.open', { cid, cap: caps.m });
  assert.ok((await add(3)).ok);
  T = t0 + 20 * DAY;
  assert.ok((await add(5)).ok);
  assert.equal((await add(1)).e, 'toolarge', '8 within the 30 days');
  T = t0 + 30 * DAY - 1;
  assert.equal((await add(1)).e, 'toolarge');
  T = t0 + 30 * DAY;
  assert.ok((await add(8)).ok, 'from the first wrap, not the last: 30 days on, the count starts again');
  assert.equal((await add(1)).e, 'toolarge', 'and is counted as before');
  assert.equal(wrapRows(cid), 1);
});

test('chat.rotate is counted with the messages: a channel\'s key changes have no cap, and each evicts every other connection', async () => {
  const L = await startServer({ authz: 'standard', limits: { postsPerMin: 2 } });
  const X = await signup(L.url, await makeIdentity('rita'));
  try {
    const cid = chid('Bucket');
    await createChat(X, cid, channelDoc());
    await rotOk(X, cid, 1); await rotOk(X, cid, 2);
    assert.equal((await rot(X, cid, 3)).e, 'ratelimit');
    assert.equal((await X.ok('get', { p: 'channels/' + cid })).d.epoch, 2);
  } finally { await X.close(); await L.stop(); }
});
