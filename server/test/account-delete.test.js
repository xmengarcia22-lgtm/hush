// Deleting an account (SPEC.md 4.7), the server's part: account.delete only from a connection proven with the account
// key, everything that names the account erased in one go, a tombstone that keeps only the public keys, the username
// dead for good (prove and sign-up answer `gone`), every connection of the account closed with 4410, and drops to it
// treated like drops to nobody.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { SYSTEM } from '../src/store.js';
import { NOTE_BYTES } from '../src/schemas.js';
import { keyedId, parseDocPath } from '../src/paths.js';
import { createAuthz } from '../src/authz.js';
import { offerTag } from '../src/codes.js';
import { startServer, connect, connectAs, signup, makeIdentity, makeDevice, directoryDoc, CID, CID2 } from './helpers.js';

let S;
before(async () => { S = await startServer({ authz: 'standard', owners: ['olivia'], limits: { proveFailsPer10Min: 1000, dropsPerHourPerAddr: 1000 } }); });
after(async () => { await S.stop(); });

const st = () => S.srv.store;
const a43 = (ch) => ch.repeat(43);
const vid = (ch) => 'v' + ch.repeat(32);
const box = { iv: 'aXY=', ct: 'Y3Q=' };
const note = () => ({ epk: { x: 'x'.repeat(43), y: 'y'.repeat(43) }, iv: 'aXY=', ct: Buffer.alloc(NOTE_BYTES, 7).toString('base64') });
const drop = (body) => fetch(S.httpUrl + '/drop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const has = (path) => !!st().get(path, SYSTEM).d;
const banned = (cid, h) => st().isBanned(cid, h);
const reportTag = (h, cid, pid) => keyedId(st().addrKey, 'report', h + '|' + cid + '|' + pid);
const reportTags = () => st().db.prepare('SELECT tag FROM reports').all().map((r) => r.tag);
const notes = (h) => st().noteCount('inbox/' + h + '/c');

// Everything the server keeps that names `h`: written as the account would, or straight into the store where no client can.
async function seed(c, h, ch) {
  await c.ok('set', { p: `vault/${vid(ch)}`, d: box });
  await c.ok('set', { p: `secure/${h}`, d: { ts: 1 } });
  await c.ok('update', { p: `directory/${h}`, d: { findable: true, bio: 'hello', devs: {} } });
  await c.ok('set', { p: `search/${h}`, d: { h, n: h, n2: '' } });
  await c.ok('set', { p: `presence/${h}`, d: { ts: Date.now() } });
  await c.ok('set', { p: `inbox/${h}/c/own${ch.repeat(9)}`, d: { ...note(), ts: 1, own: 1 } });
  assert.equal((await drop({ to: h, blob: note() })).status, 200);
  await c.ok('set', { p: 'linkreqs/' + offerTag(a43(ch)), d: { state: 'offer', ts: Date.now(), h, n: a43(ch) } });
  st().set(`phones/${a43(ch)}`, { handle: h }, SYSTEM);
  st().set(`recovery/${a43(ch)}`, { h, ts: 1 }, SYSTEM);
  for (const cid of [CID, CID2]) st().q.banPut.run(cid, st()._banTag(cid, h));
  st().q.reportPut.run('r' + h, Date.now(), Date.now() + 1e9, CID2, 'pOsT12345678', 'spam', null, '{}', null, reportTag(h, CID2, 'pOsT12345678'));
}

test('only a connection proven with the account key may delete the account', async () => {
  const alice = await makeIdentity('alice');
  const A = await signup(S.url, alice);                                   // proven with a sign-up proof
  assert.equal((await A.call('account.delete', {})).e, 'denied', 'not over the sign-up proof that made it');
  const d1 = await makeDevice(alice);
  await A.ok('update', { p: 'directory/alice', d: { devs: { [d1.id]: d1.entry } } });
  const D = await connectAs(S.url, alice, { dev: d1 });
  assert.equal((await D.call('account.delete', {})).e, 'denied', 'not with a device key');
  const N = await connectAs(S.url, await makeIdentity('nobody'), { pub: true });
  assert.equal((await N.call('account.delete', {})).e, 'denied', 'not with a sign-up proof for a free name');
  const anon = await connect(S.url);
  await anon.hello();
  assert.equal((await anon.call('account.delete', {})).e, 'unauth');
  const K = await connectAs(S.url, alice);
  assert.equal((await K.call('account.delete', { vault: 'not-a-vault' })).e, 'invalid', 'a bad vault id stops everything');
  assert.equal((await K.call('account.delete', { vault: 7 })).e, 'invalid');
  assert.equal(st().get('directory/alice', SYSTEM).d.gone, undefined, 'nothing happened');
  for (const c of [A, D, N, anon, K]) await c.close();
});

test('account.delete erases what names the account, leaves a tombstone of public keys, and closes every connection with 4410', async () => {
  const erin = await makeIdentity('erin'), bob = await makeIdentity('bob');
  const E = await signup(S.url, erin), B = await signup(S.url, bob);
  await seed(E, 'erin', 'E');
  await seed(B, 'bob', 'B');
  const d1 = await makeDevice(erin);
  await E.ok('update', { p: 'directory/erin', d: { devs: { [d1.id]: d1.entry }, name: 'Erin', photo: 'p' } });
  const before = st().get('directory/erin', SYSTEM).d;
  const ED = await connectAs(S.url, erin, { dev: d1 });
  const EK = await connectAs(S.url, erin);
  assert.equal(notes('erin'), 2);

  const r = await EK.call('account.delete', { vault: vid('E') });
  assert.equal(r.ok, true, 'the reply comes before the close');
  for (const c of [EK, ED, E]) assert.deepEqual(await c.closed, { code: 4410, reason: 'account deleted' });

  const tomb = st().get('directory/erin', SYSTEM).d;
  assert.deepEqual(Object.keys(tomb).sort(), ['ecdh', 'gone', 'handle', 'kv', 'sig']);
  assert.deepEqual({ ecdh: tomb.ecdh, sig: tomb.sig, kv: tomb.kv, handle: tomb.handle }, { ecdh: before.ecdh, sig: before.sig, kv: 1, handle: 'erin' });
  assert.equal(typeof tomb.gone, 'number');
  assert.deepEqual((await B.ok('get', { p: 'directory/erin' })).d, tomb, 'anyone still reads the keys and sees `gone`');

  // Erased for erin, kept for bob.
  assert.equal(has(`vault/${vid('E')}`), false); assert.equal(has(`vault/${vid('B')}`), true);
  assert.equal(notes('erin'), 0); assert.equal(notes('bob'), 2);
  for (const k of ['secure', 'search']) { assert.equal(has(`${k}/erin`), false, k); assert.equal(has(`${k}/bob`), true, k); }
  assert.equal(st().mem.get('presence', 'erin', Date.now()), null); assert.ok(st().mem.get('presence', 'bob', Date.now()));
  for (const k of ['phones', 'recovery']) { assert.equal(has(`${k}/${a43('E')}`), false, k); assert.equal(has(`${k}/${a43('B')}`), true, k); }
  assert.equal(has('linkreqs/' + offerTag(a43('E'))), false); assert.equal(has('linkreqs/' + offerTag(a43('B'))), true);
  for (const cid of [CID, CID2]) { assert.equal(banned(cid, 'erin'), false, cid); assert.equal(banned(cid, 'bob'), true, cid); }
  assert.ok(!reportTags().includes(reportTag('erin', CID2, 'pOsT12345678')));
  assert.ok(reportTags().includes(reportTag('bob', CID2, 'pOsT12345678')));

  // The username is dead: no proof of any kind, no sign-up.
  await assert.rejects(connectAs(S.url, erin), /prove failed: gone/, 'the old account key');
  await assert.rejects(connectAs(S.url, erin, { dev: d1 }), /prove failed: gone/, 'a device key');
  await assert.rejects(connectAs(S.url, await makeIdentity('erin'), { pub: true }), /prove failed: gone/, 'a fresh sign-up');

  // Nobody writes over the tombstone.
  for (const [op, d] of [['set', directoryDoc(erin)], ['update', { name: 'X' }], ['delete', undefined]]) {
    const res = await B.call(op, { p: 'directory/erin', ...(d ? { d } : {}) });
    assert.equal(res.e, 'denied', op); assert.match(res.m, /deleted/, op);
  }
  const authz = createAuthz('standard'), me = { handle: 'erin', viaAccountKey: true, mayCreate: 'erin', pub: erin.sig, signupProof: true, chats: new Map() };
  for (const op of ['set', 'update', 'delete']) {
    assert.throws(() => authz.check(me, op, parseDocPath('directory/erin'), { d: { ...tomb, name: 'X' }, prev: tomb }), (e) => e.code === 'denied', op);
  }
  assert.deepEqual(st().get('directory/erin', SYSTEM).d, tomb);

  // A drop to erin is a drop to nobody.
  const toErin = await drop({ to: 'erin', blob: note() }), toNobody = await drop({ to: 'zzznobody', blob: note() });
  assert.equal(toErin.status, toNobody.status);
  assert.deepEqual(await toErin.json(), await toNobody.json());
  assert.equal(notes('erin'), 0);
  await B.close();
});

test('a client never sets `gone`, and never deletes a vault itself', async () => {
  const carl = await makeIdentity('carl');
  const C = await signup(S.url, carl);
  for (const [op, d] of [['update', { gone: 1 }], ['set', { ...directoryDoc(carl), gone: 1 }]]) {
    assert.equal((await C.call(op, { p: 'directory/carl', d })).e, 'denied', op);
  }
  const N = await connectAs(S.url, await makeIdentity('nina'), { pub: true });
  assert.equal((await N.call('set', { p: 'directory/nina', d: { ...directoryDoc(await makeIdentity('nina')), gone: 1 } })).e, 'denied', 'nor makes a profile born deleted');
  await C.ok('set', { p: `vault/${vid('C')}`, d: box });
  assert.equal((await C.call('delete', { p: `vault/${vid('C')}` })).e, 'denied', 'only account.delete removes a vault');
  assert.equal(has(`vault/${vid('C')}`), true);
  assert.equal(st().get('directory/carl', SYSTEM).d.gone, undefined);
  await C.close(); await N.close();
});

test('a tombstone is no account: an owner listed in HUSH_OWNERS loses report.list; deleting twice is refused', async () => {
  const olivia = await makeIdentity('olivia');
  const O = await signup(S.url, olivia);
  const OK = await connectAs(S.url, olivia);
  await O.ok('report.list', {});
  st().deleteAccount({}, { handle: 'olivia', pub: olivia.sig });         // straight in the store: no connection is closed
  assert.equal((await O.call('report.list', {})).e, 'denied');
  assert.equal((await O.call('report.send', { cid: CID2, pid: 'pOsT12345678', reason: 'spam' })).e, 'unauth');
  assert.equal((await OK.call('account.delete', {})).e, 'denied', 'twice');
  assert.throws(() => st().deleteAccount({}, { handle: 'olivia', pub: olivia.sig }), (e) => e.code === 'denied');
  await O.close(); await OK.close();
});

test('a connection whose account key was replaced since it signed in can not delete the account', async () => {
  const fay = await makeIdentity('fay');
  const F = await signup(S.url, fay);
  const next = await makeIdentity('fay');
  assert.throws(() => st().deleteAccount({}, { handle: 'fay', pub: next.sig }), (e) => e.code === 'denied');
  assert.equal(st().get('directory/fay', SYSTEM).d.gone, undefined);
  await F.close();
});
