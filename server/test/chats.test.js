// The capability plane (SPEC.md 5): room keys, levels, previews, joins, rotation, admins, pointers.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { SYSTEM } from '../src/store.js';

import { startServer, connect, signup, makeIdentity, cap, label, wrap, sealed, CAPS, groupDoc, channelDoc, dmDoc, createChat, DMID, CID, CID2, PID, TAG } from './helpers.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const post = (over = {}) => ({ sl: 1, ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: sha('t0'), on: 0, ...over });
const svc = () => ({ sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' });

let S, alice, bob, carol, A, B, C;
before(async () => {
  S = await startServer({ authz: 'standard' });
  [alice, bob, carol] = await Promise.all([makeIdentity('alice'), makeIdentity('bob'), makeIdentity('carol')]);
  A = await signup(S.url, alice);
  B = await signup(S.url, bob);
  C = await signup(S.url, carol);
});
after(async () => { await A.close(); await B.close(); await C.close(); await S.stop(); });

test('creating a chat records only key hashes; the record itself may carry no names', async () => {
  const anon = await connect(S.url);
  await anon.hello();
  assert.equal((await anon.call('chat.create', { cid: CID, d: groupDoc(), caps: CAPS() })).e, 'unauth');
  await anon.close();
  assert.equal((await A.call('chat.create', { cid: CID, d: groupDoc({ members: ['alice', 'bob'] }), caps: CAPS() })).e, 'invalid', 'members never go to the server');
  assert.equal((await A.call('chat.create', { cid: CID, d: groupDoc({ name: 'Secret' }), caps: CAPS() })).e, 'invalid', 'private names belong in sealed meta');
  assert.equal((await A.call('chat.create', { cid: CID, d: groupDoc(), caps: { m: cap() } })).e, 'invalid', 'groups need admin and owner keys');
  assert.equal((await A.call('set', { p: `channels/${CID}`, d: groupDoc() })).e, 'denied', 'plain set cannot create a chat');
  const { level } = await createChat(A, CID, groupDoc());
  assert.equal(level, 'owner');
  assert.equal((await A.call('chat.create', { cid: CID, d: groupDoc(), caps: CAPS() })).e, 'exists');
  const row = S.srv.store.db.prepare('SELECT * FROM chats WHERE cid = ?').get(CID);
  assert.match(row.cap_m, /^[0-9a-f]{64}$/, 'hashes, not keys');
});

test('a key opens a chat at its level; a wrong key does not; the record is trimmed without one', async () => {
  const { caps } = await createChat(A, CID2, channelDoc());
  assert.equal((await B.call('chat.open', { cid: CID2, cap: cap() })).e, 'denied');
  const preview = (await B.ok('get', { p: `channels/${CID2}` })).d;
  assert.deepEqual(Object.keys(preview).sort(), ['akeys', 'epoch', 'keys', 'type', 'visibility'], 'enough to find your wrap, nothing more');
  assert.equal((await B.call('sub', { s: 1, p: 'channels', ids: [CID2] })).e, 'denied', 'no watching without a level');
  assert.equal((await B.call('query', { p: `channels/${CID2}/posts`, l: 10 })).e, 'denied');
  const m = await B.ok('chat.open', { cid: CID2, cap: caps.m });
  assert.deepEqual(m, { i: m.i, ok: true, level: 'member', epoch: 0 });
  const full = (await B.ok('get', { p: `channels/${CID2}` })).d;
  assert.ok(full.meta && full.invites, 'members see the whole record');
  assert.equal((await B.ok('query', { p: `channels/${CID2}/posts`, l: 10 })).docs.length, 0);
  assert.equal((await C.ok('chat.open', { cid: CID2, cap: caps.a })).level, 'admin');
  assert.equal((await A.ok('chat.open', { cid: CID2, cap: caps.o })).level, 'owner');
});

test('levels decide who may do what in a channel', async () => {
  // B is a member of CID2, C an admin, A the owner (opened above)
  assert.equal((await B.call('set', { p: `channels/${CID2}/posts/${PID}`, d: post() })).e, 'denied', 'members do not post in channels');
  await C.ok('set', { p: `channels/${CID2}/posts/${PID}`, d: post() });
  await B.ok('set', { p: `channels/${CID2}/acts/${PID}~${TAG}~react`, d: { post: PID, kind: 'react', e: 0, iv: 'aXY=', ct: 'Y3Q=', ts: Date.now(), sg: 'sig' } });
  await B.ok('set', { p: `channels/${CID2}/reads/0~${TAG}`, d: { ts: Date.now(), sg: 'sig' } });
  await B.ok('update', { p: `channels/${CID2}`, d: { ts: 5, last: { ts: 5, sl: 1 } } });
  assert.equal((await B.call('update', { p: `channels/${CID2}`, d: { pins: [PID] } })).e, 'denied', 'pins are an admin matter outside DMs');
  await C.ok('update', { p: `channels/${CID2}`, d: { pins: [PID], reactions: { mode: 'off' } } });
  assert.equal((await C.call('update', { p: `channels/${CID2}`, d: { epoch: 1 } })).e, 'denied', 'epochs change through chat.rotate');
  assert.equal((await C.call('update', { p: `channels/${CID2}`, d: { type: 'group' } })).e, 'denied');
  assert.equal((await C.call('update', { p: `channels/${CID2}`, d: { akeys: { [label()]: wrap() } } })).e, 'denied', 'admin keys change through chat.admins');
  assert.equal((await C.call('delete', { p: `channels/${CID2}` })).e, 'denied', 'only the owner deletes');
  assert.equal((await B.call('delete', { p: `channels/${CID2}/posts/${PID}` })).e, 'denied');
  await C.ok('delete', { p: `channels/${CID2}/posts/${PID}` });   // admins may delete any post
});

test('wrap entries may only be added under existing epochs, never changed, removed or invented', async () => {
  const doc = (await B.ok('get', { p: `channels/${CID2}` })).d;
  const [oldLabel] = Object.keys(doc.keys[0]);
  await B.ok('update', { p: `channels/${CID2}`, d: { keys: { 0: { [label()]: wrap() } } } });
  assert.equal((await B.call('update', { p: `channels/${CID2}`, d: { keys: { 0: { [oldLabel]: { ...wrap(), iv: 'changed=' } } } } })).e, 'denied');
  assert.equal((await B.call('update', { p: `channels/${CID2}`, d: { keys: { 0: { [oldLabel]: null } } } })).e, 'denied');
  assert.equal((await B.call('update', { p: `channels/${CID2}`, d: { keys: { 1: { [label()]: wrap() } } } })).e, 'denied');
  assert.equal(Object.keys((await B.ok('get', { p: `channels/${CID2}` })).d.keys[0]).length, 2);
});

test('rotation: a new epoch and member key; everyone else is evicted and the old key is dead', async () => {
  const { caps } = await createChat(A, 'gRotate000001', groupDoc());
  await B.ok('chat.open', { cid: 'gRotate000001', cap: caps.m });
  await B.ok('sub', { s: 'r', p: 'channels/gRotate000001/posts', l: 10 });
  await B.waitPush((f) => f.s === 'r' && f.t === 'init');
  assert.equal((await B.call('chat.rotate', { cid: 'gRotate000001', epoch: 1, keys: { [label()]: wrap() }, cap: cap() })).e, 'denied', 'members do not rotate groups');
  assert.equal((await A.call('chat.rotate', { cid: 'gRotate000001', epoch: 2, keys: {}, cap: cap() })).e, 'conflict', 'epochs go up by one');
  const next = cap();
  const r = await A.ok('chat.rotate', { cid: 'gRotate000001', epoch: 1, keys: { [label()]: wrap() }, cap: next, meta: sealed(1) });
  assert.equal(r.epoch, 1);
  const ev = await B.waitPush((f) => f.t === 'evict');
  assert.equal(ev.cid, 'gRotate000001');
  assert.equal((await B.call('query', { p: 'channels/gRotate000001/posts', l: 10 })).e, 'denied', 'the level is gone');
  assert.equal((await B.call('chat.open', { cid: 'gRotate000001', cap: caps.m })).e, 'denied', 'and so is the old key');
  const again = await B.ok('chat.open', { cid: 'gRotate000001', cap: next });
  assert.equal(again.epoch, 1);
  const doc = (await B.ok('get', { p: 'channels/gRotate000001' })).d;
  assert.equal(doc.epoch, 1);
  assert.equal(doc.meta.e, 1);
  assert.deepEqual(doc.invites, {}, 'old links die with the old key');
  await A.ok('set', { p: 'channels/gRotate000001/posts/aFterRotate1', d: post({ e: 1 }) });   // the rotator keeps its level
  // a DM may be rotated by either side
  await createChat(B, DMID, dmDoc(), { m: caps.m });
  await B.ok('chat.rotate', { cid: DMID, epoch: 1, keys: { [label()]: wrap() }, cap: cap() });
});

test('the owner replaces the admin secret; admins are evicted and re-open with the new key', async () => {
  const { caps } = await createChat(A, 'gAdmins000001', groupDoc());
  await C.ok('chat.open', { cid: 'gAdmins000001', cap: caps.a });
  assert.equal((await C.call('chat.admins', { cid: 'gAdmins000001', akeys: { [label()]: wrap() }, cap: cap() })).e, 'denied');
  const next = cap();
  await A.ok('chat.admins', { cid: 'gAdmins000001', akeys: { [label()]: wrap() }, cap: next });
  await C.waitPush((f) => f.t === 'evict' && f.cid === 'gAdmins000001');
  assert.equal((await C.call('chat.open', { cid: 'gAdmins000001', cap: caps.a })).e, 'denied');
  assert.equal((await C.ok('chat.open', { cid: 'gAdmins000001', cap: next })).level, 'admin');
  assert.equal((await C.ok('chat.open', { cid: 'gAdmins000001', cap: caps.m })).level, 'member', 'the member key still works');
});

test('joining by link: the proof must match, wraps are added, labels cannot collide', async () => {
  const { caps } = await createChat(A, 'gJoin00000001', groupDoc());
  const proof = 'proof-' + 'x'.repeat(40);   // real proofs are 43-character hashes
  await A.ok('update', { p: 'channels/gJoin00000001', d: { invites: { iNvItE000001: { iv: 'aXY=', ct: 'Y3Q=', ph: sha(proof), ts: Date.now() } } } });
  assert.deepEqual(await C.ok('chat.invite', { cid: 'gJoin00000001', iid: 'iNvItE000001' }).then((r) => [r.iv, r.ct]), ['aXY=', 'Y3Q=']);
  assert.equal((await C.call('chat.invite', { cid: 'gJoin00000001', iid: 'nOpE00000001' })).e, 'notfound');
  assert.equal((await C.call('chat.join', { cid: 'gJoin00000001', iid: 'iNvItE000001', proof: 'wrong-' + 'y'.repeat(40), wraps: { 0: { [label()]: wrap() } } })).e, 'denied');
  const mine = label();
  await C.ok('chat.join', { cid: 'gJoin00000001', iid: 'iNvItE000001', proof, wraps: { 0: { [mine]: wrap() } } });
  assert.equal((await C.call('chat.join', { cid: 'gJoin00000001', iid: 'iNvItE000001', proof, wraps: { 0: { [mine]: wrap() } } })).e, 'conflict');
  assert.equal((await C.call('chat.join', { cid: 'gJoin00000001', iid: 'iNvItE000001', proof, wraps: { 3: { [label()]: wrap() } } })).e, 'invalid');
  await C.ok('chat.open', { cid: 'gJoin00000001', cap: caps.m });   // the key came out of the invite blob
  assert.ok((await C.ok('get', { p: 'channels/gJoin00000001' })).d.keys[0][mine]);
});

test('public channels: anyone signed in can list and preview them; posting still needs the admin key', async () => {
  const { caps } = await createChat(A, 'cPublic000001', channelDoc({ visibility: 'public', name: 'News', desc: 'd', owner: 'alice', admins: [], meta: undefined, openKeys: { 0: 'k'.repeat(44) } }));
  const list = await B.ok('query', { p: 'channels', w: [['visibility', '==', 'public']], l: 100 });
  assert.deepEqual(list.docs.map((d) => d.id), ['cPublic000001']);
  const pv = (await B.ok('get', { p: 'channels/cPublic000001' })).d;
  assert.equal(pv.name, 'News');
  assert.equal(pv.owner, 'alice');
  await B.ok('chat.open', { cid: 'cPublic000001', cap: caps.m });   // derived from the published key in real life
  assert.equal((await B.call('set', { p: 'channels/cPublic000001/posts/pUbPost00001', d: post() })).e, 'denied');
  await A.ok('set', { p: 'channels/cPublic000001/posts/pUbPost00001', d: post() });
  assert.equal((await B.ok('query', { p: 'channels/cPublic000001/posts', l: 10 })).docs.length, 1);
});

test('deleting a chat takes its posts and media with it and evicts everyone', async () => {
  const { caps } = await createChat(A, 'gDelete000001', groupDoc());
  await B.ok('chat.open', { cid: 'gDelete000001', cap: caps.m });
  await B.ok('set', { p: 'channels/gDelete000001/posts/dElPost00001', d: post() });
  assert.equal((await B.call('set', { p: 'channels/gDelete000001/media/mDelMedia0001/chunks/0', d: { i: 0, iv: 'aXY=', d: 'AAEC' } })).e, 'denied', 'media goes over HTTP (stage 6)');
  S.srv.store.mediaPut({ cid: 'gDelete000001', mid: 'mDelMedia0001', i: 0, body: Buffer.alloc(40, 7) }, SYSTEM);
  assert.equal(S.srv.store.mediaBytes('gDelete000001'), 28);
  await A.ok('delete', { p: 'channels/gDelete000001' });
  assert.equal(S.srv.store.mediaBytes('gDelete000001'), 0, 'and its media allowance is free again');
  await B.waitPush((f) => f.t === 'evict' && f.cid === 'gDelete000001');
  assert.equal(Number(S.srv.store.db.prepare("SELECT COUNT(*) AS n FROM docs WHERE parent LIKE 'channels/gDelete000001%'").get().n), 0);
  assert.equal(Number(S.srv.store.media.prepare('SELECT COUNT(*) AS n FROM chunks WHERE cid = ?').get('gDelete000001').n), 0);
  assert.equal((await B.call('chat.open', { cid: 'gDelete000001', cap: caps.m })).e, 'notfound');
  assert.equal((await B.call('delete', { p: `channels/${DMID}` })).e, 'denied', 'DMs have no owner and are never deleted');
});

test('mailbox notes: over the socket you may only write into your own box; only you can read or remove them', async () => {
  const ptr = { epk: { x: 'x'.repeat(43), y: 'y'.repeat(43) }, iv: 'aXY=', ct: Buffer.alloc(1040).toString('base64'), ts: Date.now() };
  await B.ok('sub', { s: 'in', p: 'inbox/bob/c', l: 500 });
  await B.waitPush((f) => f.s === 'in' && f.t === 'init');
  assert.equal((await A.call('set', { p: 'inbox/bob/c/pTr000000001', d: ptr })).e, 'denied', 'a note to someone else goes through POST /drop (stage 5)');
  await B.ok('set', { p: 'inbox/bob/c/pTr000000001', d: ptr });              // a note to yourself
  const push = await B.waitPush((f) => f.s === 'in' && f.t === 'set');
  assert.equal(push.id, 'pTr000000001');
  assert.equal((await B.call('set', { p: 'inbox/bob/c/pTr000000001', d: ptr })).e, 'exists');
  assert.equal((await B.call('set', { p: 'inbox/bob/c/pTr000000009', d: { ...ptr, ct: 'Y3Q=' } })).e, 'invalid', 'every note is exactly the padded size');
  assert.equal((await A.call('update', { p: 'inbox/bob/c/pTr000000001', d: { ts: 1 } })).e, 'denied');
  assert.equal((await A.call('get', { p: 'inbox/bob/c/pTr000000001' })).e, 'denied');
  assert.equal((await A.call('query', { p: 'inbox/bob/c', l: 10 })).e, 'denied');
  assert.equal((await A.call('delete', { p: 'inbox/bob/c/pTr000000001' })).e, 'denied');
  assert.equal((await B.call('set', { p: 'inbox/bob/c/pTr000000002', d: { cid: CID, from: 'alice' } })).e, 'invalid', 'notes are sealed blobs, never plain');
  await B.ok('delete', { p: 'inbox/bob/c/pTr000000001' });
  const anon = await connect(S.url);
  await anon.hello();
  assert.equal((await anon.call('set', { p: 'inbox/bob/c/pTr000000003', d: ptr })).e, 'unauth');
  await anon.close();
});

test('the legacy shapes are gone for good', async () => {
  for (const p of ['channels/dm~alice~bob', 'owners/alice', 'uids/x', 'inbox/alice/c/dm~alice~bob']) {
    assert.equal((await A.call('set', { p, d: { ts: 1 } })).e, 'invalid', p);
  }
  assert.equal((await A.call('query', { p: 'channels', w: [['members', 'array-contains', 'alice']], l: 10 })).e, 'invalid');
});
