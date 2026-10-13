// A leave-and-rejoin loop can't use up a group's epochs (SPEC.md 5.6 "Leave"). A chat has epochs 0 to 31 for its
// whole life, and any member can make admins' pages rotate by posting "leave", getting back in and leaving again.
// The server refuses a rotation marked `why: "leave"` past `leaveRotateMaxEpoch` (23), so the last epochs stay for
// removals an admin chooses; the page then drops the leaver from the sealed member list without a new key.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import WebSocket from 'ws';

import { startServer, signup, makeIdentity, signText, directoryDoc, createChat, groupDoc, dmDoc, cap, label, wrap, sealed, CAPS, appSource } from './helpers.js';
import { DEFAULT_LIMITS } from '../src/limits.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const svc = (e) => ({ sv: 1, ts: Date.now(), e, n: 'n', d: 'd' });
let n = 0;
const pid = () => 'pOsT' + String(++n).padStart(8, '0');
const gid = (s) => ('g' + s + '0'.repeat(12)).slice(0, 13);

let S, alice, bob, carol, A, B, C;
before(async () => {
  S = await startServer({ authz: 'standard', limits: { postsPerMin: 1000 } });   // the loop below posts two notes a round
  [alice, bob, carol] = await Promise.all([makeIdentity('alice'), makeIdentity('bob'), makeIdentity('carol')]);
  A = await signup(S.url, alice);
  B = await signup(S.url, bob);
  C = await signup(S.url, carol);
});
after(async () => { await A.close(); await B.close(); await C.close(); await S.stop(); });

const rotate = (X, cid, epoch, extra = {}) => X.call('chat.rotate', { cid, epoch, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(epoch), ...extra });
const epochOf = async (X, cid) => (await X.ok('get', { p: `channels/${cid}` })).d.epoch;

test('the default keeps epochs 24 to 31 for removals', () => {
  assert.equal(DEFAULT_LIMITS.leaveRotateMaxEpoch, 23);
});

test('"why" may only be "leave"', async () => {
  const cid = gid('Why');
  await createChat(A, cid, groupDoc());
  for (const why of ['kick', '', 'LEAVE', 1, true, null, { k: 'leave' }]) assert.equal((await rotate(A, cid, 1, { why })).e, 'invalid', JSON.stringify(why));
  assert.equal(await epochOf(A, cid), 0, 'nothing changed');
  await A.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(1), why: 'leave' });
  assert.equal(await epochOf(A, cid), 1);
});

test('leave rotations work up to epoch 23 and are refused past it; plain rotations still go to 31', async () => {
  const cid = gid('Budget');
  const { caps } = await createChat(A, cid, groupDoc());
  // The owner and an admin take turns; each rotation evicts the other one, who opens again with their key.
  const turn = async (e, extra) => { const X = e % 2 ? A : C; await X.ok('chat.open', { cid, cap: X === A ? caps.o : caps.a }); return X.ok('chat.rotate', { cid, epoch: e, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(e), ...extra }); };
  for (let e = 1; e <= 23; e++) await turn(e, { why: 'leave' });
  const memberKey = cap();
  assert.equal((await rotate(A, cid, 24, { why: 'leave' })).e, 'conflict');
  await C.ok('chat.open', { cid, cap: caps.a });
  const r = await C.call('chat.rotate', { cid, epoch: 24, keys: { [label()]: wrap() }, cap: memberKey, meta: sealed(24), why: 'leave' });
  assert.equal(r.e, 'conflict', 'the admin is refused the same');
  assert.match(r.m, /leaving/, 'and told why');
  assert.equal(await epochOf(A, cid), 23, 'the refused rotation changed nothing');
  assert.equal((await B.call('chat.open', { cid, cap: memberKey })).e, 'denied', 'its member key was never recorded');
  for (let e = 24; e <= 31; e++) await turn(e, {});
  assert.equal(await epochOf(A, cid), 31, 'deliberate removals keep the last epochs');
  assert.equal((await rotate(A, cid, 32)).e, 'conflict', 'and 31 is still the end');
});

test('a leave rotation that skips ahead is refused as a plain one is', async () => {
  const cid = gid('Skip');
  await createChat(A, cid, groupDoc());
  assert.equal((await rotate(A, cid, 2, { why: 'leave' })).e, 'conflict');
  assert.equal((await rotate(A, cid, 1, { why: 'leave', meta: sealed(0) })).e, 'invalid', 'the other rules still apply');
});

test('a member still cannot rotate a group, leave or not', async () => {
  const cid = gid('Member');
  const { caps } = await createChat(A, cid, groupDoc());
  await B.ok('chat.open', { cid, cap: caps.m });
  assert.equal((await rotate(B, cid, 1, { why: 'leave' })).e, 'denied');
});

test('DMs: "why" is refused, plain rotations as before', async () => {
  const cid = 'd' + 'LeaveDm'.padEnd(22, 'x');
  await createChat(A, cid, dmDoc(), { m: cap() });
  assert.equal((await A.call('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), why: 'leave' })).e, 'invalid');
  await A.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap() });
  assert.equal(await epochOf(A, cid), 1);
});

test('the loop: leave, get back in by link or by another member\'s wrap, leave again; the epoch never passes 23', async () => {
  const cid = gid('Loop');
  const { caps } = await createChat(A, cid, groupDoc());
  let mcap = caps.m, epoch = 0, refused = 0;
  await B.ok('chat.open', { cid, cap: mcap });
  for (let round = 0; round < 40; round++) {
    // Carol gets back in: a fresh invite link (rotations clear old ones), or Bob adds a wrap for her.
    await C.ok('chat.open', { cid, cap: mcap });
    if (round % 2) {
      const proof = 'p'.repeat(20) + round, iid = 'iNv' + String(round).padStart(9, '0');
      await A.ok('update', { p: `channels/${cid}`, d: { invites: { [iid]: { iv: 'aXY=', ct: 'Y3Q=', ph: sha(proof), ts: Date.now() } } } });
      const wraps = {};
      for (let e = 0; e <= epoch; e++) wraps[e] = { [label()]: wrap() };
      await C.ok('chat.join', { cid, iid, proof, wraps });
    } else await B.ok('update', { p: `channels/${cid}`, d: { keys: { [epoch]: { [label()]: wrap() } } } });
    await C.ok('set', { p: `channels/${cid}/posts/${pid()}`, d: svc(epoch) });   // "joined"
    await C.ok('set', { p: `channels/${cid}/posts/${pid()}`, d: svc(epoch) });   // "left"
    // The admin's page answers the leave with a leave rotation.
    const next = cap();
    const r = await A.call('chat.rotate', { cid, epoch: epoch + 1, keys: { [label()]: wrap() }, cap: next, meta: sealed(epoch + 1), why: 'leave' });
    if (r.ok) { epoch++; mcap = next; await B.ok('chat.open', { cid, cap: mcap }); }
    else { assert.equal(r.e, 'conflict'); refused++; }
  }
  assert.equal(epoch, 23, 'leaves stop at 23');
  assert.equal(await epochOf(A, cid), 23);
  assert.equal(refused, 40 - 23, 'every later leave was refused');
  await A.ok('chat.rotate', { cid, epoch: 24, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(24) });   // and Carol can still be removed for good
  assert.equal(await epochOf(A, cid), 24);
});

// ---- the page: the leave branch of reconcileSvc, kickMember and rotateTo, lifted from the app and run with the
// page's own adapter against a real server. Only the sealing is stubbed: meta is readable JSON here.
const html = appSource();
function lift(from, to) {
  const a = html.indexOf(from); assert.ok(a > 0, `the page's files contain ${JSON.stringify(from)}`);
  const b = html.indexOf(to, a + from.length); assert.ok(b > a, `the page's files contain ${JSON.stringify(to)}`);
  return html.slice(a, b);
}
const createHushAdapter = new Function(lift('/* ===== HUSH ADAPTER BEGIN ===== */', '/* ===== HUSH ADAPTER END ===== */') + '\nreturn createHushAdapter;')();
const PAGE = [
  lift('const metaOf=', '\n'), lift('const epochOf=', '\n'),
  lift('async function rotateTo(', 'const dmEpochBusy='),
  lift('async function freshChan(', '\n'), lift('async function chatAnd(', '\n'),
  lift('async function kickMember(', 'async function rotateAdmins('),
  lift('const reconciled=new Set();', 'function noteAccepted('),
].join('\n');
const STUBS = ['S', 'typeOf', 'isAdmin', 'isOwner', 'loadDir', 'wrapAll', 'sealMeta', 'sealMetaFor', 'showMeta', 'memberCapFrom', 'ksPut', 'b64', 'ls', 'convById', 'rotateAdmins'];
const page = new Function(...STUBS, PAGE + '\nreturn { reconcileSvc, kickMember, chatAnd };');

const proofOf = (id) => ({ h: id.handle, pub: id.sig, dev: '', signDev: null, signAcct: (m) => signText(id.sigKey, m) });
const enc64 = (v) => Buffer.from(JSON.stringify(v)).toString('base64');
const dec64 = (m) => JSON.parse(Buffer.from(m.ct, 'base64').toString());

// Alice's page, the owner of a private group with `members`, on a server of its own with `limits`.
async function alicePage(limits, members, fn) {
  const P = await startServer({ authz: 'standard', limits });
  const id = await makeIdentity('alice');
  const caps = CAPS(), cid = 'gLeavePage001';
  const db = createHushAdapter(P.url, { WebSocket, onStatus: () => {}, caps: () => caps.o });
  try {
    await db.ready;
    await db.prove(proofOf(id)); await db.doc('directory/alice').set(directoryDoc(id));
    await db.createChat(cid, groupDoc({ meta: { e: 0, iv: 'aXY=', ct: enc64({ owner: 'alice', admins: [], members, banned: [] }) } }), caps);
    const t = { P, caps, cid, rot: [], ups: [], refusals: [], S: { me: { handle: 'alice' }, db, chatDocs: new Map() } };
    const realRotate = db.rotateChat, realDoc = db.doc;
    db.rotateChat = async (c, spec) => { t.rot.push(spec.why); try { return await realRotate(c, spec); } catch (e) { t.refusals.push(e.code); throw e; } };
    db.doc = (p) => { const d = realDoc(p); const u = d.update; d.update = (v) => { if (p === 'channels/' + cid) t.ups.push(v); return u(v); }; return d; };
    const seal = (e, v) => ({ e, iv: 'aXY=', ct: enc64({ owner: v.owner, admins: v.admins, members: v.members, banned: v.banned }) });
    Object.assign(t, page(t.S, (c) => c.type, () => true, (c) => c.owner === 'alice', async () => {},
      async (raw, hs) => Object.fromEntries(hs.map(() => [label(), wrap()])),
      async (c, e, raw, v) => seal(e, v), async (c, v) => seal(c.epoch || 0, v), async (c) => ({ ...c, ...dec64(c.meta) }),
      async (c, e, raw) => Buffer.from(raw).toString('base64url'), () => {}, (b) => Buffer.from(b).toString('base64'),
      { get: () => null, set: () => {} }, () => null, async () => {}));
    t.record = async () => ({ id: cid, ...(await realDoc('channels/' + cid).get()).data() });
    t.server = async () => { const d = await t.record(); return { epoch: d.epoch, meta: d.meta, ...dec64(d.meta) }; };
    t.conv = async () => ({ id: cid, type: 'group', visibility: 'private', owner: 'alice', ...(await t.server()) });
    await fn(t);
  } finally { db.close(); await P.stop(); }
}
const note = (svc, from, _id) => ({ _id, svc, from, e: 0 });

test('the page: one leave rotation per leaver; once refused, one meta update without them and no retry', async () => {
  await alicePage({ leaveRotateMaxEpoch: 2 }, ['alice', 'bob', 'carol', 'dave', 'erin', 'frank'], async (t) => {
    const { rot, ups, refusals, reconcileSvc, kickMember } = t, conv = t.conv, server = t.server, cid = t.cid;

    // Carol posted "left" three times: one rotation, marked as a leave.
    let c = await conv();
    await reconcileSvc(c, [note('leave', 'carol', 'n1'), note('leave', 'carol', 'n2'), note('leave', 'carol', 'n3')]);
    assert.deepEqual(rot, ['leave']);
    let s = await server();
    assert.equal(s.epoch, 1);
    assert.ok(!s.members.includes('carol'), 'the new sealed list leaves her out');

    // Bob left and came back: his later "joined" outweighs the "left", nothing happens.
    c = await conv();
    await reconcileSvc(c, [note('leave', 'bob', 'n4'), note('join', 'bob', 'n5')]);
    assert.equal(rot.length, 1);
    assert.equal(ups.length, 0);

    // Dave leaves: the last leave rotation the limit allows.
    await reconcileSvc(c, [note('leave', 'dave', 'n6')]);
    assert.deepEqual(rot, ['leave', 'leave']);
    assert.equal((await server()).epoch, 2);

    // Erin leaves past the limit: the server refuses, the page drops her from the list with one update, no new key.
    c = await conv();
    const posts = [note('leave', 'erin', 'n7')];
    await reconcileSvc(c, posts);
    assert.deepEqual(rot, ['leave', 'leave', 'leave']);
    assert.deepEqual(refusals, ['conflict']);
    assert.equal(ups.length, 1, 'one meta update');
    assert.deepEqual(Object.keys(ups[0]), ['meta']);
    s = await server();
    assert.equal(s.epoch, 2, 'no new epoch');
    assert.equal(s.meta.e, 2, 'sealed under the current epoch');
    assert.deepEqual(s.members, ['alice', 'bob', 'frank']);
    assert.ok(!c.members.includes('erin'), 'the page\'s copy agrees');

    // The same notes again, plus another "left" from Erin: no retry, no second update.
    await reconcileSvc(c, [...posts, note('leave', 'erin', 'n8')]);
    await reconcileSvc(await conv(), [...posts, note('leave', 'erin', 'n9')]);
    assert.equal(rot.length, 3, 'no rotation retried');
    assert.equal(ups.length, 1, 'no update repeated');

    // A removal an admin chooses is a plain rotation and still goes past the leave limit.
    await kickMember(cid, 'frank', { ban: false });
    assert.deepEqual(rot, ['leave', 'leave', 'leave', undefined]);
    s = await server();
    assert.equal(s.epoch, 3);
    assert.deepEqual(s.members, ['alice', 'bob']);
  });
});

test('the page: when another admin rotated first, the leave is redone once from their record, or dropped if they left them out', async () => {
  await alicePage({}, ['alice', 'bob', 'carol', 'dave'], async (t) => {
    const { rot, ups, refusals, reconcileSvc, cid } = t;
    t.S.chatDocs.set(cid, await t.record());                   // Alice's page still holds epoch 0
    const X = await signup(t.P.url, await makeIdentity('admin2'));
    try {
      await X.ok('chat.open', { cid, cap: t.caps.a });
      // The other admin blocked Dave (epoch 1) before Alice's page saw Carol's "left".
      await X.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: { e: 1, iv: 'aXY=', ct: enc64({ owner: 'alice', admins: [], members: ['alice', 'bob', 'carol'], banned: ['dave'] }) } });
      await reconcileSvc({ id: cid, type: 'group', visibility: 'private', owner: 'alice', epoch: 0, members: ['alice', 'bob', 'carol', 'dave'] }, [note('leave', 'carol', 'r1')]);
      assert.deepEqual(refusals, ['conflict'], 'the stale rotation lost the race');
      assert.deepEqual(rot, ['leave', 'leave'], 'and was redone once, from the fresh record, still marked as a leave');
      assert.equal(ups.length, 0, 'no list-only fallback while leaves may still rotate');
      let s = await t.server();
      assert.equal(s.epoch, 2);
      assert.deepEqual([s.members, s.banned], [['alice', 'bob'], ['dave']], 'Carol is out, and Dave is not written back from the stale copy');

      // The other admin already handled Bob's "left": nothing more to do.
      await X.ok('chat.open', { cid, cap: t.caps.a });            // Alice's page re-keyed it: the other admin opens it again
      await X.ok('chat.rotate', { cid, epoch: 3, keys: { [label()]: wrap() }, cap: cap(), meta: { e: 3, iv: 'aXY=', ct: enc64({ owner: 'alice', admins: [], members: ['alice'], banned: ['dave'] }) } });
      await reconcileSvc({ id: cid, type: 'group', visibility: 'private', owner: 'alice', epoch: 0, members: ['alice', 'bob'] }, [note('leave', 'bob', 'r2')]);
      assert.equal(ups.length, 0, 'no update');
      s = await t.server();
      assert.deepEqual([s.epoch, s.members], [3, ['alice']]);
    } finally { await X.close(); }
  });
});

test('the page: at epoch 31 a block keeps its server ban and goes into the lists without a key change', async () => {
  await alicePage({}, ['alice', 'bob', 'carol'], async (t) => {
    const { kickMember, cid } = t;
    for (let e = 1; e <= 31; e++) await t.S.db.rotateChat(cid, { epoch: e, keys: {}, cap: cap(), meta: { e, iv: 'aXY=', ct: enc64({ owner: 'alice', admins: [], members: ['alice', 'bob', 'carol'], banned: [] }) } });
    t.S.chatDocs.set(cid, await t.record());
    await kickMember(cid, 'carol');
    const s = await t.server();
    assert.deepEqual([s.epoch, s.members, s.banned], [31, ['alice', 'bob'], ['carol']], 'no key change is left: the lists say it');
    assert.equal(t.P.srv.store.isBanned(cid, 'carol'), true, 'and the server keeps her out: her epoch-31 key no longer opens it from her account');
  });
});

test('wraps a member adds stop at three quarters of the record, so a removal always fits', async () => {
  const T = await startServer({ authz: 'standard' });
  const [alice, bob, carol] = await Promise.all([makeIdentity('alice'), makeIdentity('bob'), makeIdentity('carol')]);
  const A = await signup(T.url, alice), B = await signup(T.url, bob), C = await signup(T.url, carol);
  try {
    const cid = 'gLeaveRoom001', PROOF = 'proof-' + 'q'.repeat(40);
    const { caps } = await createChat(A, cid, groupDoc());
    await B.ok('chat.open', { cid, cap: caps.m });
    const junk = (n) => Object.fromEntries(Array.from({ length: n }, () => [label(), wrap()]));
    let refused = null;
    for (let i = 0; i < 40 && !refused; i++) { const r = await B.call('update', { p: 'channels/' + cid, d: { keys: { 0: junk(500) } } }); if (!r.ok) refused = r.e; }
    assert.equal(refused, 'toolarge', 'a member\'s junk wraps are refused before the record is full');
    await A.ok('update', { p: 'channels/' + cid, d: { invites: { iNvItE000001: { iv: 'aXY=', ct: 'Y3Q=', ph: createHash('sha256').update(PROOF).digest('hex'), ts: Date.now() } } } });
    assert.equal((await C.call('chat.join', { cid, iid: 'iNvItE000001', proof: PROOF, wraps: { 0: junk(400) } })).e, 'toolarge', 'nor by a link');
    assert.equal((await A.call('chat.rotate', { cid, epoch: 1, keys: junk(50), cap: cap(), meta: sealed(1) })).ok, true, 'a removal still fits');
  } finally { await A.close(); await B.close(); await C.close(); await T.stop(); }
});
