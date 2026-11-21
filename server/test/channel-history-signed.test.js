// Release 92 (page), private channel history: signed key changes (SPEC.md 5.6 "Key chain", the check; the roles record,
// rs and rt; no key change from a page it names no admin; meta v2; the old wrap salt). The page harness is
// channel-history-kit.js. The owner's page signing only the list its record holds: channel-history-roles.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { offline, pageFor, world, makeChannel, linkOf } from './channel-history-kit.js';

// Helpers shared with channel-history-page.test.js, copied as the removal tests do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const rowOf = async (X, cid, e) => { const s = await X.S.db.doc('channels/' + cid + '/chain/' + e).get(); return s.exists ? s.data() : null; };
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));

// ---- signed key changes (SPEC.md 5.6 "Key chain", the check; release 92 slice 3) ----

const badkey = (e) => !!e && e.message === 'badkey';
const dirOf = (X) => ({ handle: X.handle, ecdh: X.id.ecdh, sig: X.id.sig, kv: 1 });
const rolesNow = (X, cid) => { const r = X.rolesOf(cid) || {}; return { e: r.e, o: r.o, a: r.a, s: r.s }; };
const setRoles = (X, cid, r) => X.ls.set('hush:roles:' + X.handle, { ...X.ls.get('hush:roles:' + X.handle, {}), [cid]: r });
// JSON `x` sealed under `raw` with the additional data `ad`, shaped like sealed meta: an ometa as a page from before release
// 92 sealed it (no rs), or meta v1, as a page from before release 93b sealed it (no epoch in the additional data).
async function bareMeta(e, raw, x, ad) {
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(ad) }, key, Buffer.from(JSON.stringify(x)))).toString('base64') };
}
// The plaintext of a channel's ometa, opened with the key X holds for its epoch.
async function plainOf(X, cid, m) {
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}
// A commit holding exactly `o`, sealed under `raw` as row e's.
async function reCommit(X, cid, e, raw, o) {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return X.b64(await X.sealRaw(key, Buffer.from('hush-rot-v1|' + cid + '|' + e), Buffer.from(JSON.stringify(o))));
}
// A connection that serves these key-chain rows (by epoch) and nothing else, holding the chat at member level, with no member cards (a key
// change reads them first, release 93b); what is set is kept in `put`.
function rowsDb(rows) {
  const put = [], at = (p) => { const m = /\/chain\/(\d+)$/.exec(p), d = m ? rows[m[1]] : null; return { id: p.split('/').pop(), exists: !!d, data: () => d }; };
  const none = { where: () => none, orderBy: () => none, limit: () => none, get: async () => ({ docs: [], size: 0 }) };
  return { put, act: async (...a) => { put.push(a); }, chatLevel: () => 'member', mgetChat: async (_c, ps) => ps.map(at), collection: () => none, doc: (p) => ({ get: async () => at(p), set: async (v) => { put.push([p, v]); }, delete: async () => {} }) };
}
// A key change as a server could plant one (sent here through the owner's connection): the next epoch under Kx, wrapped to
// `members`, with meta and an ometa naming `admins` under Kx (the ometa signed by the puppet's page, not the owner's), and its
// row signed by the puppet, who holds the key before.
async function plantEpoch(A, Pp, cid, Kx, members, admins) {
  const c = await A.sync(cid), e = A.epochOf(c) + 1, v = A.metaOf(await A.showMeta(c));
  assert.ok(await Pp.holds(cid, e - 1)); await A.loadDir(members, true);
  const back = await Pp.chainRow(cid, e, Kx, keyOf(Pp, cid, e - 1));
  await A.S.db.rotateChat(cid, { epoch: e, keys: await A.wrapAll(Kx, members, cid, e), cap: await A.memberCapFrom(cid, e, Kx), meta: await A.sealMeta(cid, e, Kx, v), back });
  await A.S.db.doc('channels/' + cid).update({ ometa: await Pp.sealOMeta(cid, e, Kx, { ...v, admins }) });
  return e;
}

test('10. a removal whose key change meets a current key that doesn\'t check out (badkey) keeps the block, changes no key and writes no list', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), Dv = await w.page('dave'), Pp = await w.page('pete');
    const members = ['alice', 'dave', 'pete'];
    await makeChannel(A, cid, members);
    await A.shown(cid); await A.rolesQ.get(cid);
    const e = await plantEpoch(A, Pp, cid, randomBytes(32), members, ['pete']);
    await A.sync(cid); A.spy.rotate.length = 0; A.spy.updates.length = 0;
    await assert.rejects(A.kickMember(cid, 'dave'), badkey);
    assert.deepEqual(A.spy.ban, [['dave', true]], 'blocked, and the block stays');
    assert.deepEqual([A.spy.rotate, A.spy.updates], [[], []], 'no key change and no lists-only write');
    assert.equal(await Dv.S.db.refreshChat(cid), false, 'the server keeps Dave out');
    assert.equal((await A.sync(cid)).epoch, e);
  });
});

test('12. sealKey refuses the current key unless its commit opens under it, names it, says full and is signed by the owner or an admin with a key this device hasn\'t seen change; a missing row passes only where the chain was never seen and the row before is missing too; keys this page made pass; a reaction is never checked', async () => {
  const [O, Y, Bo, Yn] = [await pageFor(null, 'olga'), await pageFor(null, 'yuri'), await pageFor(null, 'bob'), await pageFor(null, 'yuri')];
  const cid = 'cSealKey00001', K = [0, 1, 2, 3].map(() => randomBytes(32)), Kx = randomBytes(32);
  const c = { id: cid, type: 'channel', visibility: 'private', epoch: 3, keys: {} }, roles = { e: 2, o: 'olga', a: ['yuri'], s: 1, ch: 1, hk: O.id.sig.x };   // hk: taken under Olga's key
  const good = { 2: await O.chainRow(cid, 2, K[2], K[1]), 3: await Y.chainRow(cid, 3, K[3], K[2]) }, o3 = await O.openCommit(cid, 3, K[3], good[3].c);
  // Nina's page: a subscriber holding the current key (or `held`), who last saw Olga own the channel and Yuri as its admin.
  const nina = async (rows, r = roles, o = {}) => { const P = await pageFor(null, 'nina', o); P.S.db = rowsDb(rows); P.ksPut(cid, 3, P.b64(o.held || K[3]));
    for (const X of [O, Y, Bo]) P.S.dir[X.handle] = dirOf(X); if (r) setRoles(P, cid, r); return P; };
  const seal = (P, cc = c) => P.sealKey(cc, P.epochOf(cc));
  let P = await nina(good);
  assert.ok(sameKey((await seal(P)).raw, K[3]), 'an admin\'s commit passes');
  assert.ok(await P.sealPost(c, 'hello'), 'and a post seals under it');
  P = await nina({ ...good, 3: await O.chainRow(cid, 3, K[3], K[2]) }); assert.ok(await seal(P), 'so does the owner\'s');
  P = await nina({ ...good, 3: { b: good[3].b, c: await reCommit(Y, cid, 3, K[3], o3) } }); assert.ok(await seal(P), 'and Yuri\'s commit sealed again as it is');
  P = await nina(good, { ...roles, hk: Bo.id.sig.x }); await assert.rejects(seal(P), badkey, 'a list taken under an owner key since replaced (hk): its admins count for nothing');
  P = await nina({ ...good, 3: await O.chainRow(cid, 3, K[3], K[2]) }, { ...roles, hk: Bo.id.sig.x }); assert.ok(await seal(P), 'the owner still does');

  // A missing row.
  P = await nina({}, null); assert.ok(await seal(P), 'no row at all on a channel this device never saw chained (one from before release 92)');
  P = await nina({}, { ch: 1 }); await assert.rejects(seal(P), badkey, 'no row on a device that saw the chain');
  P = await nina({ 2: good[2] }, null); await assert.rejects(seal(P), badkey, 'no row, an empty roles record, and the row before is there');
  P = await nina({ 2: good[2] }); await assert.rejects(seal(P), badkey, 'the same with roles');

  // The signer.
  P = await nina({ ...good, 3: await Bo.chainRow(cid, 3, K[3], K[2]) }); await assert.rejects(seal(P), badkey, 'Bob is no admin');
  for (const f of [() => P.sealPost(c, 'x'), () => P.sealSvc(c, 'pin', 1), () => P.sealMetaFor(c, { members: ['nina'] }), () => P.sealOMetaFor(c, { owner: 'olga' })]) await assert.rejects(f(), badkey, 'nothing is sealed under it');
  await P.setAct(c, 'pOsT00000001', 'r', { emoji: '👍' });
  assert.deepEqual(P.S.db.put.map((x) => x[2]), ['r'], 'a reaction is saved: setAct stays on convKey');
  P = await nina(good); P.S.dir.yuri = { ...dirOf(Yn), kv: 2, prev: [{ sig: Y.id.sig, until: Date.now() }] };
  await assert.rejects(seal(P), badkey, 'a key Yuri has since replaced (\'prev\') counts for nothing');
  P = await nina(good, roles, { pins: { yuri: { ecdh: Y.id.ecdh, sig: Y.id.sig } } }); P.S.dir.yuri = { ...dirOf(Yn), kv: 2 };
  await assert.rejects(seal(P), badkey, 'pinned at kv1, the directory at kv2, the commit signed with the kv1 key');

  // The commit itself.
  P = await nina({ ...good, 3: { b: good[3].b, c: await reCommit(Y, cid, 3, K[3], { ...o3, m: 'fresh' }) } }); await assert.rejects(seal(P), badkey, 'not marked full');
  P = await nina({ ...good, 3: { b: good[3].b, c: await reCommit(Y, cid, 3, Kx, o3) } }, roles, { held: Kx });
  await assert.rejects(seal(P), badkey, 'a wrong-key wrap: the head wrap opens to Kx, and the commit sealed under Kx was made for K_3 (H)');
  P = await nina(good, roles, { held: Kx }); await assert.rejects(seal(P), badkey, 'a commit that doesn\'t open under the key held');

  // A check waits for the ometa just read: Olga's signed list without Yuri, whose check is still loading her profile.
  P = await nina(good); delete P.S.dir.olga; const dir = P.S.db.doc;
  P.S.db.doc = (p) => (p === 'directory/olga' ? { get: async () => { await new Promise((r) => setTimeout(r, 50)); return { exists: true, data: () => dirOf(O) }; } } : dir(p));
  assert.ok(await P.readOMeta({ ...c, ometa: await O.sealOMeta(cid, 3, K[3], { name: 'R', owner: 'olga', admins: [] }) }));
  await assert.rejects(seal(P), badkey, 'Yuri, dropped by the list just read, signs no more');
  assert.deepEqual(rolesNow(P, cid), { e: 3, o: 'olga', a: [], s: 1 });

  // Only a private channel's current epoch is checked; an unsure read is not kept.
  P = await nina({}, { ch: 1 }); P.ksPut(cid, 2, P.b64(K[2]));
  assert.ok(await P.sealKey(c, 2), 'an older epoch');
  assert.ok(await seal(P, { ...c, type: 'group' }), 'a group');
  assert.ok(await seal(P, { ...c, visibility: 'public', openKeys: { 3: P.b64(K[3]) } }), 'a public channel');
  P = await nina(good); const db = P.S.db; let down = true;
  P.S.db = { ...db, doc: (p) => (down ? { get: async () => { throw offline(); } } : db.doc(p)) };
  await assert.rejects(seal(P), (e) => e.code === 'offline', 'offline: that error, not badkey');
  down = false; assert.ok(await seal(P), 'checked again at the next seal');

  // A key this page made passes, even where the server shows no row (its own key change, not sent here).
  P = await nina({}, null); P.S.db.rotateChat = async () => ({});
  assert.equal(await P.rotateTo({ ...c }, { members: ['nina'], admins: [], banned: [], owner: 'olga' }), 4);
  assert.equal(P.rolesOf(cid).ch, 1, 'seen chained: its own row');
  assert.ok(await seal(P, { ...c, epoch: 4 }), 'its own new key');
  assert.equal(P.sendErr(new Error('badkey')), 'Nothing was sent: Hush couldn’t check this channel. Reload Hush. If the owner’s security code changed, accept the new code. If the channel was made before this version of Hush, its owner signs its admin list once: Channel info, then Edit and Save. If it keeps happening, ask the channel’s owner.', 'the badkey text: a reload first, then the owner\'s one-time save for a channel from before release 92 (release 93b, S1)');
});

test('12. a planted epoch (the server\'s key wrapped to everyone, an ometa under it naming a puppet admin, a row the puppet signed) changes no roles, and is refused before any key change or backfill, also on a device the server tells there are no rows', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }); let Y = await w.page('yuri'); const B = await w.page('bob'), Pp = await w.page('pete');
    const members = ['alice', 'yuri', 'bob', 'pete'];
    await makeChannel(A, cid, members, ['yuri']);
    for (let i = 0; i < 5; i++) await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    const c5 = await A.sync(cid);   // the owner's page seals ometa again under the current epoch (adoptOMeta, once an epoch)
    await A.S.db.doc('channels/' + cid).update({ ometa: await A.sealOMetaFor(c5, A.metaOf(await A.showMeta(c5))) });
    const was = { e: 5, o: 'alice', a: ['yuri'], s: 1 };
    for (const X of [Y, B]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid), was, X.handle + ' noted the signed ometa of epoch 5'); }
    assert.ok(await Y.sealKey(await Y.sync(cid), 5), 'the real head passes');
    const e = await plantEpoch(A, Pp, cid, randomBytes(32), members, ['pete']);
    for (const X of [Y, B]) {
      await X.shown(cid); await X.rolesQ.get(cid);
      assert.deepEqual(rolesNow(X, cid), was, X.handle + '\'s roles don\'t change');
      assert.ok(await X.holds(cid, e), X.handle + ' took the planted key (a wrap is not checked)');
      await assert.rejects(X.sealKey(await X.sync(cid), e), badkey, X.handle + ' seals nothing under it');
    }
    assert.equal(B.rolesOf(cid).ch, 1, 'a subscriber that checked a row has seen the chain');
    // The owner's open: the puppet, an admin by the planted ometa, asks for a new admin secret (an adm card). Nothing happens,
    // so the secret never goes to the puppet.
    await Pp.writeCard(await Pp.sync(cid), 'adm');
    A.spy.rotate.length = 0; A.spy.updates.length = 0;
    await A.run(cid);
    assert.deepEqual([A.spy.admins, A.spy.rotate, A.spy.updates], [[], [], []], 'the owner\'s page acts on nothing under the planted key');
    await assert.rejects(Y.rotateTo(await Y.sync(cid), Y.metaOf(await Y.shown(cid))), badkey);
    assert.deepEqual(Y.spy.rotate, [], 'refused before any key change: the planted key is never chained');
    assert.equal(await Y.ensureChain(await Y.sync(cid)), false);
    assert.deepEqual(Y.spy.chain, [], 'nor backfilled from');

    // The second route: the server answers every row missing to a device that saw the chain. The same refusals.
    Y = await w.reload(Y); await Y.sync(cid);
    assert.equal(Y.rolesOf(cid).ch, 1);
    const none = (p) => ({ id: p.split('/').pop(), exists: false, data: () => undefined }), doc = Y.S.db.doc;
    Y.S.db.mgetChat = async (_c, ps) => ps.map(none);
    Y.S.db.doc = (p) => (/\/chain\//.test(p) ? { get: async () => none(p) } : doc(p));
    await assert.rejects(Y.rotateTo(await Y.sync(cid), Y.metaOf(await Y.shown(cid))), badkey);
    assert.deepEqual(Y.spy.rotate, []);
    assert.equal(await Y.ensureChain(await Y.sync(cid)), false);
    assert.deepEqual(Y.spy.chain, []);
    assert.equal((await A.sync(cid)).epoch, e, 'no key change made it');
  });
});

test('12. a device removal: while it runs, the owner\'s page changes the key of a channel whose current commit her replaced account key signed (as this device had that key, never the server\'s history of it); a subscriber who accepted her new code checks the new commit; outside a removal the old commit counts for nothing', async () => {
  const cid = 'cRekeyHead001', K = [randomBytes(32), randomBytes(32)], O = await pageFor(null, 'olga'), Z = await pageFor(null, 'olga');   // Z: some other key under Olga's name
  const rows = { 0: await O.chainRow(cid, 0, K[0]), 1: await O.chainRow(cid, 1, K[1], K[0]) }, mine = rows[1], sent = [];
  O.S.db = rowsDb(rows); O.S.db.rotateChat = async (_c, spec) => { sent.push(spec); return {}; };
  O.ksPut(cid, 0, O.b64(K[0])); O.ksPut(cid, 1, O.b64(K[1])); setRoles(O, cid, { e: 1, o: 'olga', a: [], s: 1, ch: 1 });
  const c = { id: cid, type: 'channel', visibility: 'private', epoch: 1, keys: {} }, v = () => ({ members: ['olga'], admins: [], banned: [], owner: 'olga' });
  assert.ok(await O.sealKey(c, 1), 'her own commit, before the removal');
  await O.rekeyIdentity(O.S.me); O.S.keys.clear(); O.S.chanKeys.clear();   // the removal's new account keys, and every cache the old ones made (rekeyCaches)
  O.S.dir.olga = { handle: 'olga', ecdh: O.S.me.ecdh, sig: O.S.me.sig, kv: 2, prev: [{ sig: Z.id.sig, until: Date.now() }] };   // the server's copy, mirrored, with a history it made up
  await assert.rejects(O.sealKey(c, 1), badkey, 'outside a removal: signed by the key it replaced');
  await assert.rejects(O.rotateTo({ ...c }, v()), badkey);
  O.S.rekeying = true;
  rows[1] = { b: rows[1].b, c: (await Z.chainRow(cid, 1, K[1], K[0])).c }; O.S.chanKeys.clear();
  await assert.rejects(O.sealKey(c, 1), badkey, 'during one: a key only the server\'s history names counts for nothing');
  rows[1] = mine; O.S.chanKeys.clear();
  assert.equal(await O.rotateTo(c, v()), 2, 'the removal changes the key');
  O.S.rekeying = false;
  assert.equal(sent.length, 1); assert.equal((await O.openCommit(cid, 2, keyOf(O, cid, 2), sent[0].back.c)).f, 'olga');
  await assert.rejects(O.sealKey({ ...c, epoch: 1 }, 1), (e) => !!e && e.message === 'rollback', 'the record of the epoch before is below the mark her key change raised (release 93b, the epoch-rollback guard)');
  setRoles(O, cid, { ...O.rolesOf(cid), hi: undefined });   // the mark put aside (never the key check's cache), so the check below reaches the commit
  await assert.rejects(O.sealKey({ ...c, epoch: 1 }, 1), badkey, 'what passed during the removal is not kept after it');
  assert.ok(await O.sealKey(c, 2), 'her new key');
  const B = await pageFor(null, 'bob'); B.S.db = rowsDb({ ...rows, 2: sent[0].back }); B.ksPut(cid, 2, O.ksGet(cid, 2)); setRoles(B, cid, { e: 1, o: 'olga', a: [], s: 1, ch: 1 });
  B.S.dir.olga = { handle: 'olga', ecdh: O.S.me.ecdh, sig: O.S.me.sig, kv: 2 };   // Bob accepted her new security code
  assert.ok(await B.sealKey(c, 2), 'Bob checks the commit her new key signed');
  B.S.dir.olga = dirOf(O); B.S.chanKeys.clear(); await assert.rejects(B.sealKey(c, 2), badkey, 'which her old key didn\'t');
});

test('12. keys this page made, or took from a link, pass with no read: a new channel\'s first key and a link\'s newest key', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob');
    const offlineRows = (X) => { const doc = X.S.db.doc; X.S.db.doc = (p) => (/\/chain\//.test(p) ? { get: async () => { throw offline(); } } : doc(p)); };
    await A.createChatDoc(cid, 'channel', 'private', { name: 'New', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice'], banned: [] });
    offlineRows(A);
    assert.ok(await A.sealKey(await A.sync(cid), 0), 'the owner\'s page made it');
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    await B.joinPrivate(cid, await linkOf(A, cid));
    offlineRows(B);
    assert.ok(await B.sealKey(await B.sync(cid), 1), 'the link carried it, sealed by an admin under the link\'s secret');
  });
});

test('13. roles: the owner is fixed at first sight; only the owner\'s signed ometa adds admins; an unsigned one only takes them away, and only before a signed one was seen; a copy from before sent again (of an older epoch, or of the same one), another owner\'s, or one signed by a key the directory moved on from changes nothing; a later one by its rt counts whatever its epoch, and one of the same rt under a later key moves only the epoch', async () => {
  const [O, Y, Z, M] = [await pageFor(null, 'olga'), await pageFor(null, 'yuri'), await pageFor(null, 'zara'), await pageFor(null, 'mona')];
  const cid = 'cRolesTest001', K = Array.from({ length: 6 }, () => randomBytes(32));
  const nina = async () => { const N = await pageFor(null, 'nina'); for (let e = 0; e < 6; e++) N.ksPut(cid, e, N.b64(K[e])); for (const X of [O, Y, Z, M]) N.S.dir[X.handle] = dirOf(X); return N; };
  const rec = (ometa) => ({ id: cid, type: 'channel', visibility: 'private', epoch: 5, keys: {}, ometa });
  const see = async (N, ometa) => { assert.ok(await N.readOMeta(rec(ometa)), 'it opens'); await N.rolesQ.get(cid); return rolesNow(N, cid); };
  const by = (X, e, owner, admins) => X.sealOMeta(cid, e, K[e], { name: 'R', owner, admins });   // its rs is X's signature
  const bare = (e, owner, admins) => bareMeta(e, K[e], { name: 'R', desc: '', photo: null, owner, admins }, 'hush-ometa-v1|' + cid);

  let N = await nina(); setRoles(N, cid, { ch: 1, dk: { zara: 2 } });   // what this device kept before
  const before = await by(O, 1, 'olga', ['yuri', 'zara']); O.clock.skew += 1000;   // sealed before the first one: older by its rt
  const first = { e: 2, o: 'olga', a: ['yuri'], s: 1 };
  assert.deepEqual(await see(N, await by(O, 2, 'olga', ['yuri'])), first, 'first sight: the owner is fixed');
  assert.deepEqual([N.rolesOf(cid).ch, N.rolesOf(cid).dk], [1, { zara: 2 }], 'merged onto what was kept');
  assert.deepEqual(await see(N, await by(M, 4, 'mona', ['mona'])), first, 'another owner, signed by that one: nothing');
  assert.deepEqual(await see(N, before), first, 'an older epoch\'s from before, naming a member since removed, sent again: nothing');
  assert.deepEqual(await see(N, await by(Z, 4, 'olga', ['yuri', 'zara'])), first, 'a forged one at 4 under K_4, signed by Zara: nothing');
  assert.deepEqual(await see(N, await bare(4, 'olga', ['zara'])), first, 'an unsigned one, after a signed one: nothing');
  const signed = await by(O, 4, 'olga', ['zara', 'yuri']), dk = await crypto.subtle.importKey('raw', K[4], 'AES-GCM', false, ['decrypt']);
  const { rs, rt } = JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(signed.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, dk, Buffer.from(signed.ct, 'base64'))).toString());
  assert.ok(Number.isFinite(rt) && Math.abs(rt - Date.now()) < 60e3, 'rt: when the owner sealed it');
  const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: O.id.sig.x, y: O.id.sig.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(rs, 'base64'), Buffer.from(`hush-roles-v1|${cid}|4|${rt}|olga|yuri,zara`)), true, 'rs is the owner\'s signature over exactly hush-roles-v1|cid|e|rt|owner|admins, sorted');
  assert.deepEqual(await see(N, signed), { e: 4, o: 'olga', a: ['zara', 'yuri'], s: 1 }, 'a newer signed one adds an admin');
  const early = await by(O, 5, 'olga', ['zara', 'yuri']); O.clock.skew += 1000;
  assert.deepEqual(await see(N, await by(O, 5, 'olga', ['zara'])), { e: 5, o: 'olga', a: ['zara'], s: 1 }, 'and takes one away');
  assert.deepEqual(await see(N, early), { e: 5, o: 'olga', a: ['zara'], s: 1 }, 'a copy of the same epoch from before, sent again: nothing');
  O.clock.skew += 1000; assert.deepEqual(await see(N, await by(O, 5, 'olga', ['zara', 'mona'])), { e: 5, o: 'olga', a: ['zara', 'mona'], s: 1 }, 'a later one of the same epoch adds');
  // Two owner devices, the other one's clock 40 seconds ahead (inside the date limit, five minutes: a copy further ahead
  // than that waits, channel-history-admin5.test.js): once this one has read that one's copy, its own next one is later still.
  const O2 = await pageFor(null, 'olga', { id: O.id, clock: { skew: O.clock.skew + 40e3 } }), ahead = await by(O2, 5, 'olga', ['zara', 'mona', 'yuri']);
  assert.deepEqual(await see(N, ahead), { e: 5, o: 'olga', a: ['zara', 'mona', 'yuri'], s: 1 });
  O.ksPut(cid, 5, O.b64(K[5])); const sv = crypto.subtle.verify; let drop;
  crypto.subtle.verify = async function (...a) { await new Promise((r) => setTimeout(r, 50)); return sv.apply(this, a); };
  try { assert.ok(await O.readOMeta(rec(ahead))); drop = await by(O, 5, 'olga', ['zara']); } finally { delete crypto.subtle.verify; }   // sealed while its check of that copy still runs: the seal waits for it
  assert.deepEqual(await see(N, drop), { e: 5, o: 'olga', a: ['zara'], s: 1 }, 'the device whose clock is behind takes two away');
  // The owner's change sealed under the key its page started from, while the list was sealed again under a later one: later by its rt, so taken.
  O.clock.skew += 50e3; O.ksPut(cid, 3, O.b64(K[3])); const late = await by(O, 3, 'olga', ['zara', 'yuri']);
  assert.deepEqual(await see(N, late), { e: 3, o: 'olga', a: ['zara', 'yuri'], s: 1 }, 'a later one under an older epoch\'s key: taken');
  // Sealed again under a later key (sealMeta 'keep', as adoptOMeta does): at the rt of the owner page's record, only while it is still the one read (_rt).
  assert.ok(await O.readOMeta(rec(late))); await O.rolesQ.get(cid); const t = O.rolesOf(cid).t;
  await assert.rejects(O.sealMeta(cid, 5, K[5], { name: 'R', owner: 'olga', admins: ['zara', 'yuri'], _rt: t - 1 }, 'keep'), (e) => !!e && e.message === 'nokey', 'a record that moved on since the copy was read: nothing sealed');
  const kept = await O.sealMeta(cid, 5, K[5], { name: 'R', owner: 'olga', admins: ['mona'], _rt: t }, 'keep');   // naming others, as a list of that time an owner page with no signed record seals would
  assert.deepEqual(await see(N, kept), { e: 5, o: 'olga', a: ['zara', 'yuri'], s: 1 }, 'the same rt under a later key: only the epoch moves');

  // A device that never saw a signed one (the owner's pages all from before release 92): unsigned ones only take admins away.
  N = await nina();
  assert.deepEqual(await see(N, await bare(2, 'olga', ['yuri', 'zara'])), { e: 2, o: 'olga', a: ['yuri', 'zara'], s: 0 }, 'first sight, unsigned');
  assert.deepEqual(await see(N, await bare(3, 'olga', ['zara', 'mona'])), { e: 2, o: 'olga', a: ['zara'], s: 0 }, 'Yuri taken away, Mona not added');
  assert.deepEqual(await see(N, await bare(1, 'olga', [])), { e: 2, o: 'olga', a: ['zara'], s: 0 }, 'one of an older epoch than the first: nothing');
  assert.deepEqual(await see(N, await by(Y, 4, 'olga', ['zara', 'yuri'])), { e: 2, o: 'olga', a: ['zara'], s: 0 }, 'Yuri\'s own signature is not the owner\'s');
  assert.deepEqual(await see(N, await by(O, 3, 'olga', ['yuri', 'zara'])), { e: 3, o: 'olga', a: ['yuri', 'zara'], s: 1 }, 'the owner\'s signed one adds');
  assert.deepEqual(await see(N, await bare(5, 'olga', [])), { e: 3, o: 'olga', a: ['yuri', 'zara'], s: 1 }, 'after it an unsigned one does nothing');
  N.S.pins = { olga: { ecdh: O.id.ecdh, sig: O.id.sig } }; N.S.dir.olga = { ...dirOf(await pageFor(null, 'olga')), kv: 2 };
  assert.deepEqual(await see(N, await by(O, 5, 'olga', [])), { e: 3, o: 'olga', a: ['yuri', 'zara'], s: 1 }, 'signed by the owner\'s key the directory moved on from: nothing');
});

test('13. the owner\'s page signs an ometa that carries no rs once (adoptOMeta), and leaves a signed one alone', async () => {
  await world({}, async (w) => {
    const { cid } = w; let A = await w.page('alice', { owner: true }); const B = await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob']);
    const v = A.metaOf(await A.shown(cid));
    await A.S.db.doc('channels/' + cid).update({ ometa: await bareMeta(0, keyOf(A, cid, 0), { name: v.name, desc: '', photo: null, owner: 'alice', admins: [] }, 'hush-ometa-v1|' + cid) });   // as a page from before release 92 sealed it
    await B.shown(cid); await B.rolesQ.get(cid);
    assert.deepEqual(rolesNow(B, cid), { e: 0, o: 'alice', a: [], s: 0 }, 'Bob: unsigned');
    let c = await A.sync(cid); const sh = await A.showMeta(c), t0 = A.rolesOf(cid).t;
    A.spy.updates.length = 0;
    const [e1, e2] = [{ ...c }, { ...c }]; await A.adoptOMeta(e1, sh); await A.adoptOMeta(e2, sh);   // two events of the chat watch, each with its own copy of the record
    assert.deepEqual(A.spy.updates, [['ometa']], 'sealed again, once');
    assert.equal((await plainOf(A, cid, (await A.sync(cid)).ometa)).rt, t0, 'under the rt of the signed list the owner\'s record holds');
    await B.shown(cid); await B.rolesQ.get(cid);
    assert.deepEqual(rolesNow(B, cid), { e: 0, o: 'alice', a: [], s: 1 }, 'now signed by the owner');
    A = await w.reload(A); c = await A.sync(cid);
    await A.adoptOMeta(c, await A.showMeta(c));
    assert.deepEqual(A.spy.updates, [], 'a signed one, up to date, is left alone');
  });
});

test('13. adoptOMeta, at every event of the chat watch: a signed, up-to-date ometa is checked once per copy, on any member\'s page', async () => {
  const O = await pageFor(null, 'olga'), B = await pageFor(null, 'bob'), cid = 'cAdoptOnce001', K = randomBytes(32), v = { name: 'R', owner: 'olga', admins: [], members: ['olga', 'bob'], banned: [] };
  B.S.db = { chatLevel: () => 'member' }; B.S.dir.olga = dirOf(O); B.ksPut(cid, 2, B.b64(K));
  const rec = async () => ({ id: cid, type: 'channel', visibility: 'private', epoch: 2, keys: {}, meta: await O.sealMeta(cid, 2, K, v), ometa: await O.sealOMeta(cid, 2, K, v) });
  const watch = async (c) => { const sh = await B.showMeta(c); await B.rolesQ.get(cid); let n = 0; const sv = crypto.subtle.verify;
    crypto.subtle.verify = function (...a) { n++; return sv.apply(this, a); };
    try { for (let i = 0; i < 3; i++) await B.adoptOMeta(c, sh); } finally { delete crypto.subtle.verify; } return n; };
  const c = await rec();
  assert.equal(await watch(c), 1, 'three events, one check');
  assert.equal(await watch(c), 0, 'and none for the same copy later');
  assert.equal(await watch(await rec()), 1, 'a new copy is checked once again');
});

test('14. the old wrap salt opens a key at epoch 31 and below only; since release 93b sealMeta writes meta as v2 (its epoch in the additional data), which opens at its own epoch only, and an ometa still as hush-ometa-v1; meta sealed as v1 (a page before 93b) still opens', async () => {
  const N = await pageFor(null, 'nina'), cid = 'cSaltTest0001', R = {};
  const old = async (e) => { R[e] = randomBytes(32); return { [e]: { L1: await N.wrapTo(R[e], N.id.ecdh, N.wrapSalt(cid, undefined, 'nina')) } }; };
  const at = (e, keys) => N.convKey({ id: cid, type: 'channel', visibility: 'private', epoch: e, keys }, e);
  for (const e of [2, 31]) assert.ok(sameKey((await at(e, await old(e))).raw, R[e]), 'an old-salt wrap opens at epoch ' + e);
  for (const e of [32, 40]) assert.equal(await at(e, await old(e)), null, 'not at epoch ' + e);
  const k40 = randomBytes(32);
  assert.ok(sameKey((await at(40, { 40: { L2: await N.wrapTo(k40, N.id.ecdh, N.wrapSalt(cid, 40, 'nina')) } })).raw, k40), 'today\'s wrap does at 40');

  const c2 = 'cMetaV2Test01', K = randomBytes(32), v = { name: 'Two', desc: '', photo: null, owner: 'olga', admins: [], members: ['nina'], banned: [] };
  N.ksPut(c2, 3, N.b64(K)); N.ksPut(c2, 4, N.b64(K));   // one key at two epochs: only the additional data tells them apart
  const rec = (e, meta) => ({ id: c2, type: 'channel', visibility: 'private', epoch: e, keys: {}, meta });
  const v2 = await N.sealMeta(c2, 3, K, v), v1 = await bareMeta(3, K, v, 'hush-meta-v1|' + c2);   // v1: as a page from before release 93b sealed it
  const key = await crypto.subtle.importKey('raw', K, 'AES-GCM', false, ['decrypt']);
  const under = (m, ad) => crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from(ad) }, key, Buffer.from(m.ct, 'base64'));
  await assert.doesNotReject(under(v2, 'hush-meta-v2|' + c2 + '|3'), 'sealMeta writes v2, at its own epoch');
  await assert.rejects(under(v2, 'hush-meta-v2|' + c2 + '|4'), 'not under another epoch');
  await assert.rejects(under(v2, 'hush-meta-v1|' + c2), 'and not as v1');
  await assert.doesNotReject(under(await N.sealOMeta(c2, 3, K, v), 'hush-ometa-v1|' + c2), 'an ometa is still sealed as hush-ometa-v1');
  assert.deepEqual((await N.readMeta(rec(3, v2))).members, ['nina'], 'v2 opens');
  assert.deepEqual((await N.readMeta(rec(3, v1))).members, ['nina'], 'v1 opens');
  assert.equal(await N.readMeta(rec(4, { ...v2, e: 4 })), null, 'a v2 meta passed off as epoch 4\'s doesn\'t');
  assert.deepEqual((await N.readMeta(rec(4, { ...v1, e: 4 }))).members, ['nina'], 'a v1 one can\'t tell (what v2 is for)');
  assert.equal(await N.readMeta(rec(3, await bareMeta(3, K, v, 'hush-ometa-v1|' + c2))), null, 'an ometa never reads as meta');
});

test('15. dropping an admin: the owner signs the current commit again first, its key before sealed again from the key held, so a subscriber\'s check still passes; a reaction is never checked, so a subscriber who pinned the owner\'s old key still saves one', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'); let B = await w.page('bob');
    await makeChannel(A, cid, ['alice', 'xena', 'bob'], ['xena']);
    await X.rotateTo(await X.sync(cid), X.metaOf(await X.shown(cid)));   // the current key (epoch 1) carries Xena's commit
    const was = await rowOf(A, cid, 1);
    assert.equal((await A.openCommit(cid, 1, keyOf(X, cid, 1), was.c)).f, 'xena');
    await B.shown(cid); assert.ok(await B.sealKey(await B.sync(cid), 1), 'Bob: Xena is an admin');
    const order = [], real = { chain: A.S.db.chain, setAdmins: A.S.db.setAdmins, doc: A.S.db.doc };
    A.S.db.chain = async (...a) => { order.push('chain'); return real.chain(...a); };
    A.S.db.setAdmins = async (...a) => { order.push('admins'); return real.setAdmins(...a); };
    A.S.db.doc = (p) => { const d = real.doc(p), u = d.update; d.update = (v) => { order.push(...Object.keys(v)); return u(v); }; return d; };
    await A.shown(cid); await A.setAdmins(cid, []);
    assert.deepEqual(order, ['chain', 'admins', 'ometa', 'ometa'], 'the commit first, then the admin key, then the signed list naming its fingerprint, then the one without Xena');
    const row = await rowOf(A, cid, 1), o = await A.openCommit(cid, 1, keyOf(A, cid, 1), row.c);
    assert.deepEqual([o.f, o.m], ['alice', 'full'], 'now the owner\'s');
    assert.notEqual(row.b, was.b, 'its key before sealed again');
    assert.ok(sameKey(await A.openBack(cid, 1, keyOf(A, cid, 1), row.b), keyOf(A, cid, 0)), 'from the key the owner holds');
    B = await w.reload(B); await B.shown(cid); await B.rolesQ.get(cid);
    assert.deepEqual(rolesNow(B, cid), { e: 1, o: 'alice', a: [], s: 1 }, 'Bob\'s page: no admins');
    assert.ok(await B.sealKey(await B.sync(cid), 1), 'and the owner\'s commit passes');
    await real.chain(cid, 1, was.b, was.c);                    // without the new signature Xena's commit would stand
    B = await w.reload(B); await assert.rejects(B.sealKey(await B.sync(cid), 1), badkey, 'and be refused from here on');
    await real.chain(cid, 1, row.b, row.c);

    // The owner's account key changed; Bob's page pinned the old one: a post waits for Accept, a reaction doesn't.
    B = await w.reload(B); const c = await B.sync(cid); await B.showMeta(c); await B.rolesQ.get(cid);
    B.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } }; B.S.dir.alice = { ...dirOf(await pageFor(null, 'alice')), kv: 2 };
    await assert.rejects(B.sealPost(c, 'hi'), badkey, 'a post is refused until Bob accepts the new security code');
    await A.S.db.doc('channels/' + cid + '/posts/pOsT00000001').set({ sl: 1, ts: Date.now(), e: 1, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: 'a'.repeat(64), on: 0 });
    await B.setAct(c, 'pOsT00000001', 'r', { emoji: '👍' });
    const acts = (await A.S.db.collection('channels/' + cid + '/acts').limit(10).get()).docs.map((d) => d.data());
    assert.deepEqual(acts.map((x) => [x.post, x.kind, x.e]), [['pOsT00000001', 'r', 1]], 'the reaction is saved');
  });
});

test('15a. dropping an admin signs the head of the record as it is now: from a copy one key change behind (the admin\'s own), and again when the admin changes the key while their admin key is being replaced; a subscriber\'s check passes on both', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), M = await w.page('mona');
    await makeChannel(A, cid, ['alice', 'xena', 'mona'], ['xena']);
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));   // chained, epoch 1, the owner's row
    await A.shown(cid); await A.rolesQ.get(cid);
    const stale = A.S.chatDocs.get(cid); assert.equal(A.epochOf(stale), 1);
    await X.rotateTo(await X.sync(cid), X.metaOf(await X.shown(cid)));   // Xena changes the key: epoch 2, her row
    A.S.chatDocs.set(cid, stale); A.spy.chain.length = 0;                // the owner's page hasn't seen it yet
    await A.setAdmins(cid, []);
    assert.deepEqual(A.spy.chain, [2], 'the head row, not the one below it');
    assert.equal((await A.openCommit(cid, 2, keyOf(X, cid, 2), (await rowOf(A, cid, 2)).c)).f, 'alice', 'now the owner\'s');
    let N = await w.reload(M), f = await N.sync(cid); await N.shown(cid); await N.rolesQ.get(cid);
    assert.deepEqual((N.rolesOf(cid) || {}).a, [], 'Mona\'s page: no admins');
    assert.ok(await N.sealKey(f, 2), 'and the current key passes');

    // Xena changes the key once the owner signed the head, before her admin key is replaced (timed, say): that head is
    // signed too, after the replacement, when she can make no more.
    const g = cid.slice(0, -1) + 'z';
    await makeChannel(A, g, ['alice', 'xena', 'mona'], ['xena']);
    await A.rotateTo(await A.sync(g), A.metaOf(await A.shown(g))); await A.shown(g); await A.rolesQ.get(g);
    A.spy.chain.length = 0; const sa = A.S.db.setAdmins;
    A.S.db.setAdmins = async (...a) => { A.S.db.setAdmins = sa; assert.deepEqual(A.spy.chain, [1], 'the head signed first');
      await X.rotateTo(await X.sync(g), X.metaOf(await X.shown(g))); return sa(...a); };
    await A.setAdmins(g, []);
    assert.deepEqual(A.spy.chain, [1, 2], 'and her head signed after the admin key changed');
    assert.equal((await A.openCommit(g, 2, keyOf(X, g, 2), (await rowOf(A, g, 2)).c)).f, 'alice');
    N = await w.reload(N); f = await N.sync(g); await N.shown(g); await N.rolesQ.get(g);
    assert.deepEqual([N.epochOf(f), (N.rolesOf(g) || {}).a], [2, []]);
    assert.ok(await N.sealKey(f, 2), 'a subscriber\'s check passes');
    const notmember = (e) => !!e && e.message === 'notmember';
    await assert.rejects(X.rotateTo(await X.sync(g), X.metaOf(await X.shown(g))), notmember, 'and Xena\'s page, at member level now and so reading no list (channel-members.test.js), changes the key no more');
    setRoles(X, g, { ...X.rolesOf(g), a: ['xena'] });   // a page of hers that never saw the drop
    await assert.rejects(X.rotateTo(await X.sync(g), X.metaOf(await X.shown(g))), notmember, 'nor does one that never saw the drop');
    await assert.rejects(X.S.db.rotateChat(g, { epoch: 3, keys: {}, cap: 'A'.repeat(43) }), (e) => !!e && e.code === 'denied', 'and the server refuses her');
  });
});

test('124. the owner blocking an admin under a current key that doesn\'t check out (badkey) fails before any block: her replacement of the admin key comes first and is what refuses, so the error says so (noBan) and the server keeps no block; blocking a subscriber under the same key places the block first and keeps it', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }); await w.page('bob'); await w.page('cyd');
    await makeChannel(A, cid, ['alice', 'bob', 'cyd'], ['bob']);
    await A.shown(cid); await A.rolesQ.get(cid);
    await A.S.db.chain(cid, 0, undefined, 'A'.repeat(48)); A.S.chanKeys.clear();   // a head commit that opens to nothing: sealKey refuses the current key
    A.spy.ban.length = 0; A.spy.rotate.length = 0; A.spy.updates.length = 0; A.spy.admins.length = 0;
    let err = null; try { await A.kickMember(cid, 'bob', { ban: true }); } catch (x) { err = x; }
    assert.deepEqual([badkey(err), err.noBan, A.spy.ban, A.spy.rotate, A.spy.admins, A.spy.updates, (await A.shown(cid)).admins], [true, true, [], [], [], [], ['bob']], 'an admin: refused before the block, nothing changed, and the error says no block was placed');
    err = null; try { await A.kickMember(cid, 'cyd', { ban: true }); } catch (x) { err = x; }
    assert.deepEqual([badkey(err), err.noBan, A.spy.ban, A.spy.rotate, A.spy.updates], [true, undefined, [['cyd', true]], [], []], 'a subscriber: blocked first, and the block stays');
  });
});

test('144. a member whose first check of an admin\'s key commit can\'t read the signer\'s profile (the directory read fails) is refused then, and takes the key once the profile loads, with no reload: a refusal made without the signer\'s keys is not kept (release 93b, item 5)', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus');
    await makeChannel(A, cid, ['alice', 'bob', 'gus'], ['bob']);
    for (const P of [A, B, G]) { await P.shown(cid); await P.rolesQ.get(cid); }
    assert.equal(await B.rotateTo(await B.sync(cid), B.metaOf(await B.shown(cid))), 1, 'Bob, a signed admin, changes the key');
    const seal = async () => { try { await G.sealKey(await G.sync(cid), 1); return 'ok'; } catch (e) { return e.message; } };
    const doc = G.S.db.doc; delete G.S.dir.bob;
    G.S.db.doc = (p) => (p === 'directory/bob' ? { get: () => Promise.reject(offline()) } : doc(p));   // his profile can't be read: the check has no key to verify his commit with
    assert.equal(await seal(), 'badkey', 'his profile unreadable: refused');
    G.S.db.doc = doc; await G.loadDir(['bob'], true);   // his profile now loaded, as a member list's load would put it
    assert.equal(await seal(), 'ok', 'taken once his profile is loaded, with no reload: the refusal was not kept');
    assert.equal(G.rolesOf(cid).hi, 1, 'and the checked key change raised his mark (release 93b, the epoch-rollback guard)');
  });
});
