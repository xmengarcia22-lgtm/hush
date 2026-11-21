// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.6 "Key chain"; release 92 fix round 3),
// eleventh part; the first is channel-history-admin.test.js. The roles record narrows: a signed copy under the owner's current
// key, dated at or before the record's rt and above 1, narrows a record taken under a key she has since replaced, or already so
// narrowed (`n`), to the admins in both lists, moving the key the record counts under and keeping its time; a later rt takes the
// whole list and clears the mark. A channel from before release 92 is unsigned on every device until the owner signs it by hand
// (owner decision D1): a lost device's signed list is taken there, and her removal seals no copy and replaces no admin secret for
// it, so members fail closed until she saves the channel's admin list once (Edit, then Save); a lost device's list that left an admin out leaves that admin demoted on members, and no admin's page there
// trusting the admin secret, until that same save; any device of hers the server kept from a later admin change narrows the
// members' records likewise when it seals its stale list again under her new key, until her next change of admins.
// This file holds tests 102 to 107; 94 to 97 are in channel-history-admin9.test.js, 98 to 101 in channel-history-admin10.test.js.
// The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, lift, mkBuild, pageFor } from './channel-history-kit.js';

// `ah` as SPEC.md 5.6 has it: HKDF-SHA-256 of the admin secret, salt "hush-admin-id-v1", info the channel id, 32 bytes, base64url.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));
// Helpers shared with channel-history-admin9.test.js and the other channel-history files, copied as the removal tests do.
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
async function plainOf(X, cid, m) {   // the plaintext of a channel's ometa, opened with the key X holds for its epoch
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}
// A device removal's rotate stage on X's page, and the new account keys before it, as channel-history-removal.test.js runs them.
async function removal(X, chats) {
  const rec = { stage: 'rotate', name: 'Old phone', rotated: [], chats: chats.map((x) => ({ type: 'channel', vis: 'private', owner: false, admin: false, admins: [], members: [], name: 'History', unlocked: true, ...x })) }, fails = [];
  const ui = { step: (t) => { if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} };
  X.S.contactsReady = true; X.S.vaultOk = true;
  await X.rekeyRun(rec, ui);
  assert.deepEqual(fails, ['Removing the device stopped (stop). Close Hush and open it again to finish it.'], 'the rotate stage ran to its end');
  X.S.rekeying = false; return rec;
}
async function newKeys(X) {
  await X.rekeyIdentity(X.S.me); X.S.keys.clear(); X.S.chanKeys.clear();
  await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() });
  const sk = await crypto.subtle.importKey('jwk', X.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await X.S.db.prove(null);
  await X.S.db.prove({ h: X.handle, pub: X.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  await X.loadDir([X.handle], true);
}
// The page's own Accept new code (acceptKey); rewrapFor and dmInfo answer for no chat.
const acceptBuild = mkBuild([lift('async function acceptKey(', 'async function rewrapFor('), 'const rewrapFor=async()=>{},dmInfo=()=>null;Object.assign(S,{acceptKey,cache:new Map(),warned:new Set(),verified:{}});'].join('\n'));
// A copy of the owner's part signed with `sigPriv` (an account key of hers: a lost device's, or a page's own) with the time, list and
// fingerprint given, sealed under epoch e's key: what her page would write, dated as chosen here. No `ah`: none named.
async function copyBy(sigPriv, cid, e, raw, x) {
  const sk = await crypto.subtle.importKey('jwk', sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const parts = [cid, String(e), String(x.rt), x.owner, [...x.admins].sort().join(',')].concat(x.ah ? [x.ah, String(x.at)] : []);
  const rs = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from('hush-roles-v1|' + parts.join('|')))).toString('base64');
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(JSON.stringify({ ...x, rs })))).toString('base64') };
}
// A lost device's copy of A's list naming `admins` at `rt(o)`, from the owner's part as the server has it (A still holds the key it signs with).
const thiefCopy = async (A, cid, admins, rt) => { const o = await plainOf(A, cid, (await A.sync(cid)).ometa); return copyBy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), { name: o.name, desc: o.desc, photo: o.photo, owner: 'alice', admins, rt: rt(o), ah: fp(new Uint8Array(randomBytes(32)), cid), at: 1 }); };
// An ometa as a page from before release 92 sealed it: no rs (channel-history-roles.test.js).
async function bareMeta(e, raw, x, ad) {
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(ad) }, key, Buffer.from(JSON.stringify(x)))).toString('base64') };
}
// A channel from before release 92: an unsigned ometa, which the owner's page keeps unsigned and seals nothing of again (owner decision
// D1; roles test 38), read so by `readers`. The owner signs it by hand later (editSave).
async function pre92(A, cid, members, admins, readers) {
  await makeChannel(A, cid, members, admins);
  await A.S.db.doc('channels/' + cid).update({ ometa: await bareMeta(0, keyOf(A, cid, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins }, 'hush-ometa-v1|' + cid) });
  const c = await A.sync(cid), sh = await A.showMeta(c); await A.rolesQ.get(cid);
  assert.equal(A.rolesOf(cid).s, 0, 'an unsigned first sight');
  await A.adoptOMeta(c, sh); await A.rolesQ.get(cid);
  assert.deepEqual([(await A.sync(cid)).ometa.iv, A.rolesOf(cid).s], [c.ometa.iv, 0], 'nothing sealed again: still unsigned');
  for (const P of readers) { await read(P, cid); assert.deepEqual([P.rolesOf(cid).t, P.rolesOf(cid).s], [0, 0], P.handle + ': unsigned'); }
}
// Save pressed in X's Edit sheet (openEditConv), the record being X's copy of it: the sheet's error line ('' once saved). The owner's manual step.
async function editSave(X, cid, name) {
  X.S.convs = [{ ...(await X.showMeta(X.S.chatDocs.get(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); return at((e) => e.cls === 'err').textContent;
}
// B (naming `before` as the key before) and the server plant the next epoch for X: X's check of it (sealKey), 'badkey' or 'taken'
// (channel-history-roles.test.js); the planted key, which X's store keeps once unwrapped, is forgotten after, so X can be asked again.
async function plantedBy(B, X, cid, before) {
  const cur = await X.sync(cid), e = X.epochOf(cur) + 1, Kp = randomBytes(32), row = await B.chainRow(cid, e, Kp, before);
  await X.loadDir([X.handle], true);
  const planted = { ...cur, epoch: e, keys: { ...cur.keys, [e]: await X.wrapAll(Kp, [X.handle], cid, e) } }, doc = X.S.db.doc;
  X.S.db.doc = (p) => (p === 'channels/' + cid + '/chain/' + e ? { get: async () => ({ exists: true, data: () => row }) } : doc(p));
  X.S.chanKeys.clear();
  try { const k = await X.sealKey(planted, e); return k && sameKey(k.raw, Kp) ? 'taken' : 'other'; } catch (x) { return x.message; } finally { X.S.db.doc = doc; X.ksPut(cid, e, null); X.S.chanKeys.clear(); }
}
const curKey = async (X, cid) => keyOf(X, cid, X.epochOf(await X.sync(cid)));
const ownChange = (X, cid) => X.shown(cid).then((s) => X.rotateTo(X.S.chatDocs.get(cid), X.metaOf(s)));   // a key change of X's own, from its record
const seal = async (X, cid) => { const c = await X.sync(cid); try { return (await X.sealKey(c, X.epochOf(c))) ? 'ok' : 'none'; } catch (e) { return e.message; } };   // X's check of the current key, caches as they are

test('102. roles: the narrowed mark. A signed copy under the owner\'s current key at or before the record\'s rt (above 1) narrows a record taken under her replaced key: the admins in both lists, the key moves, the time stays, `n` set; on a narrowed record another such copy adds nobody, and a copy at the record\'s own time and fingerprint naming fewer (a \'next\' drop) keeps the fingerprint; a later rt takes the whole list and clears `n`; a copy under the same key below the time of a record with `n` clear changes nothing; a copy at rt 1 narrows no record above 1, only one at 1; `n` survives the record\'s other writers (ch, p)', async () => {
  const [O, O2, N] = [await pageFor(null, 'olga'), await pageFor(null, 'olga'), await pageFor(null, 'nina')];   // O2: Olga's keys after a device removal
  const K = randomBytes(32), T = Date.now() - 60e3, base = { name: 'R', desc: '', photo: null, owner: 'olga' };
  N.S.dir.olga = { handle: 'olga', ecdh: O.id.ecdh, sig: O.id.sig, kv: 1 };
  const see = async (cid, m) => { N.ksPut(cid, 0, N.b64(K)); assert.ok(await N.readOMeta({ id: cid, type: 'channel', visibility: 'private', epoch: 0, keys: {}, ometa: m }), 'it opens'); await N.rolesQ.get(cid); const r = N.rolesOf(cid); return [r.t, r.a, r.h, r.hk === O2.id.sig.x ? 'new' : r.hk === O.id.sig.x ? 'old' : r.hk, r.n]; };
  const by = (X, cid, x) => copyBy(X.S.me.sigPriv, cid, 0, K, { ...base, ...x });
  const [c1, c2, c3, c4] = ['cNarrowMark01', 'cNarrowMark02', 'cNarrowMark03', 'cNarrowMark04'];
  // first sight of each, under her key as this device holds it
  for (const c of [c1, c2, c3]) assert.deepEqual(await see(c, await by(O, c, { admins: ['yuri', 'zara'], rt: T, ah: 'h0', at: T })), [T, ['yuri', 'zara'], 'h0', 'old', undefined], c + ': first sight');
  assert.deepEqual(await see(c4, await by(O, c4, { admins: ['yuri', 'zara'], rt: 1, ah: 'h0', at: T })), [1, ['yuri', 'zara'], 'h0', 'old', undefined], 'c4: first sight at rt 1 (a channel from before release 92, sealed again by her page)');
  assert.deepEqual(await see(c1, await by(O2, c1, { admins: ['yuri'], rt: T - 5, ah: 'h1', at: T + 1 })), [T, ['yuri', 'zara'], 'h0', 'old', undefined], 'a copy under a key this device does not hold as hers: nothing');
  N.S.dir.olga = { handle: 'olga', ecdh: O2.id.ecdh, sig: O2.id.sig, kv: 2 };   // her key changed (a device removal), as the directory brings it
  // c1: narrowing below the record's time, more copies on the narrowed record, a later rt, then a same-key lower copy on the clear record
  assert.deepEqual(await see(c1, await by(O2, c1, { admins: ['yuri'], rt: T - 5, ah: 'h1', at: T + 1 })), [T, ['yuri'], 'h1', 'new', 1], 'under her new key, below the record\'s time: the admins in both lists, the key moves, the time stays, the mark set, the fingerprint taken (the key flipped)');
  assert.deepEqual(await see(c1, await by(O2, c1, { admins: ['yuri', 'zara', 'mona'], rt: T - 7, ah: 'h2', at: T + 2 })), [T, ['yuri'], 'h1', 'new', 1], 'narrowed: a copy below naming others adds nobody, and its fingerprint is not taken (the record\'s stays: the list did not shrink)');
  assert.deepEqual(await see(c1, await by(O2, c1, { admins: [], rt: T - 6, ah: 'h3', at: T + 3 })), [T, [], 'h3', 'new', 1], 'narrowed: a copy below naming fewer drops them, and its fingerprint, named later, is taken');
  assert.deepEqual(await see(c1, await by(O2, c1, { admins: ['yuri', 'zara'], rt: T + 10, ah: 'h4', at: T + 4 })), [T + 10, ['yuri', 'zara'], 'h4', 'new', 0], 'a later rt: the whole list, the mark cleared');
  assert.deepEqual(await see(c1, await by(O2, c1, { admins: ['yuri'], rt: T + 5, ah: 'h5', at: T + 5 })), [T + 10, ['yuri', 'zara'], 'h4', 'new', 0], 'under the same key, below the time of a record with the mark clear: nothing');
  // c2: the 'next' drop on a narrowed record: the record's own fingerprint named again at its own time, with fewer admins
  assert.deepEqual(await see(c2, await by(O2, c2, { admins: ['yuri', 'zara'], rt: T, ah: 'h1', at: T + 1 })), [T, ['yuri', 'zara'], 'h1', 'new', 1], 'the removal\'s copy (the same list at the record\'s time): the key moves, the fingerprint taken');
  assert.deepEqual(await see(c2, await by(O2, c2, { admins: ['yuri'], rt: T, ah: 'h1', at: T + 1 })), [T, ['yuri'], 'h1', 'new', 1], 'a \'next\' drop at the record\'s time naming its own fingerprint again: the drop, the fingerprint kept');
  assert.deepEqual(await see(c2, await by(O2, c2, { admins: [], rt: T, ah: 'hz', at: T + 1 })), [T, [], undefined, 'new', 1], 'one naming another fingerprint no later: the drop, and no fingerprint until a later rt');
  // c3 and c4: a copy at rt 1 under her new key
  assert.deepEqual(await see(c3, await by(O2, c3, { admins: ['yuri'], rt: 1, ah: 'h1', at: T + 1 })), [T, ['yuri', 'zara'], 'h0', 'old', undefined], 'at rt 1 (a re-seal by a device of hers with no signed record): it narrows no record above 1');
  assert.deepEqual(await see(c4, await by(O2, c4, { admins: ['yuri'], rt: 1, ah: 'h1', at: T + 1 })), [1, ['yuri'], 'h1', 'new', 1], 'only one at 1');
  // the record's other writers keep the mark
  N.noteChained(c2); N.noteOwnAh(c2, 'p1');
  assert.deepEqual([N.rolesOf(c2).n, N.rolesOf(c2).ch, N.rolesOf(c2).p], [1, 1, 'p1'], 'the chain mark and the page\'s own fingerprint keep it');
});

test('103. a channel from before release 92 (its record unsigned on every device, the owner not having signed it): a lost owner device signs [bob, mal] at a real time, kept from her devices, and the members take it (her key signed it, the first signed copy they saw); her removal seals no copy there and hands the unsigned list no admin secret (own: unsigned; from release 93b it replaces the secret with one her own devices alone hold), so after it the members keep the lost device\'s list under her replaced key and fail closed: Mal AND Bob are refused there, while her own list looks right; her Edit then Save (the whole list at a fresh rt) recovers everyone', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), G = await w.page('gus'), M = await w.page('mal');
    const members = ['alice', 'bob', 'gus', 'mal'];
    B.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as Bob's page first saw it
    await pre92(A, cid, members, ['bob'], [B, G, M]);
    const m1 = (await A.sync(cid)).ometa, oldX = A.id.sig.x, T = Date.now();
    await A.S.db.doc('channels/' + cid).update({ ometa: await thiefCopy(A, cid, ['bob', 'mal'], () => T) });
    for (const P of [B, G]) await read(P, cid);
    assert.deepEqual([B.rolesOf(cid).a, B.rolesOf(cid).t, G.rolesOf(cid).a], [['bob', 'mal'], T, ['bob', 'mal']], 'the members take the lost device\'s list at its time: her key signed it, and an unsigned record takes the first signed copy');
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });   // kept from her devices
    await newKeys(A); A.spy.admins.length = 0;
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true, own: 'unsigned' }]);
    assert.deepEqual([(await A.sync(cid)).ometa.iv, A.spy.admins], [m1.iv, [cid]], 'the removal: no copy sealed; the admin secret replaced with one her own devices alone hold, none handed to the unsigned list (release 93b)');
    await B.loadDir(['alice'], true); await B.S.acceptKey('alice'); await read(B, cid);
    await G.loadDir(['alice'], true); await read(G, cid);
    await read(A, cid);
    assert.deepEqual([A.rolesOf(cid).a, A.rolesOf(cid).s, (await A.shown(cid)).admins], [['bob'], 0, ['bob']], 'her own device: her list, unsigned, nothing odd to see');
    const state = async () => [[B.rolesOf(cid).a, B.rolesOf(cid).t === T, B.rolesOf(cid).hk === oldX, await plantedBy(M, B, cid, await curKey(B, cid))], [G.rolesOf(cid).a, G.rolesOf(cid).t === T, G.rolesOf(cid).hk === oldX, await plantedBy(M, G, cid, await curKey(G, cid)), await plantedBy(B, G, cid, await curKey(G, cid))]];
    assert.deepEqual(await state(), [[['bob', 'mal'], true, true, 'badkey'], [['bob', 'mal'], true, true, 'badkey', 'badkey']], 'the members: the lost device\'s list under her replaced key still; Mal refused, and Bob too (fail closed)');
    assert.equal(await editSave(A, cid, 'History'), '', 'the recovery: her admin list saved by hand (Edit, then Save)');
    for (const P of [B, G]) await read(P, cid);
    assert.deepEqual(await state(), [[['bob'], false, false, 'badkey'], [['bob'], false, false, 'badkey', 'taken']], 'her save: the whole list at a fresh time, under her new key, everywhere: Mal gone, Bob counts');
  });
});

test('104. a channel from before release 92 (unsigned on every device): a lost owner device signs her UNCHANGED list [bob] at a real time, kept from her devices (no planted admin at all): after the removal (no copy sealed, the record unsigned, the admin secret one her own devices alone hold) every member refuses Bob\'s key changes (the record is under her replaced key), and Bob\'s own page can make none (his connection is at member level there, release 93b); nothing on her device shows it but the unsigned list; her Edit then Save recovers, and her next open hands Bob the admin secret again', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), G = await w.page('gus'), F = await w.page('fay', { build: acceptBuild });
    const members = ['alice', 'bob', 'gus', 'fay'];
    for (const P of [B, F]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    await pre92(A, cid, members, ['bob'], [B, G, F]);
    const m1 = (await A.sync(cid)).ometa, oldX = A.id.sig.x, T = Date.now();
    await A.S.db.doc('channels/' + cid).update({ ometa: await thiefCopy(A, cid, ['bob'], () => T) });
    for (const P of [B, G, F]) await read(P, cid);
    assert.deepEqual([G.rolesOf(cid).a, G.rolesOf(cid).t], [['bob'], T], 'the same list, at a real time');
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true, own: 'unsigned' }]);
    assert.equal((await A.sync(cid)).ometa.iv, m1.iv, 'the removal sealed no copy');
    for (const P of [B, F]) { await P.loadDir(['alice'], true); await P.S.acceptKey('alice'); await read(P, cid); }
    await G.loadDir(['alice'], true); await read(G, cid);
    await read(A, cid); const sh = await A.shown(cid);
    assert.deepEqual([A.rolesOf(cid).a, A.rolesOf(cid).s, sh.admins, !!sh._odd, !!sh._stale], [['bob'], 0, ['bob'], false, false], 'her device: the list unchanged and unsigned, nothing odd to see');
    assert.deepEqual([G, F].map((P) => [P.rolesOf(cid).a, P.rolesOf(cid).t === T, P.rolesOf(cid).hk === oldX]), [[['bob'], true, true], [['bob'], true, true]], 'the members: the lost device\'s copy of her list, under her replaced key');
    assert.deepEqual([await plantedBy(B, G, cid, await curKey(G, cid)), await plantedBy(B, F, cid, await curKey(F, cid))], ['badkey', 'badkey'], 'Bob, the one legitimate admin, refused on both: a denial the lost device planted that outlasts its removal');
    await assert.rejects(ownChange(B, cid), /notmember/, 'Bob\'s own page can make none: the removal\'s admin secret is hers alone (release 93b), so his connection is at member level there and reads no list');
    assert.equal(await seal(G, cid), 'ok', 'the current key is her removal\'s, which Gus seals under');
    assert.equal(await editSave(A, cid, 'History'), '', 'the recovery: her admin list saved by hand');
    for (const P of [G, F]) await read(P, cid);
    assert.deepEqual([G.rolesOf(cid).a, G.rolesOf(cid).hk === A.S.me.sig.x, await seal(G, cid), await plantedBy(B, F, cid, await curKey(F, cid))], [['bob'], true, 'ok', 'taken'], 'her save: taken everywhere, Bob counts again');
    await A.run(cid);   // her next open: the admin secret for the signed list, wrapped to Bob too
    assert.deepEqual([await ownChange(B, cid), await seal(G, cid)], [2, 'ok'], 'Bob\'s own page changes the key again, and Gus seals under it');
  });
});

test('105. a channel from release 92, admins Bob and Carol: a lost owner device signs [bob, mal] (Carol left out) at her record\'s rt plus one, kept from her devices; the removal\'s copy at her rt narrows the members\' records to the admins in BOTH lists, so Carol stays demoted on every member (her key change refused; Mal gone, Bob counts) while her own device shows Bob and Carol and nothing prompts her; her admin list saved once, unchanged, restores Carol', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), Cp = await w.page('carol'), G = await w.page('gus'), M = await w.page('mal');
    const members = ['alice', 'bob', 'carol', 'gus', 'mal'];
    B.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as Bob's page first saw it
    await makeChannel(A, cid, members, ['bob', 'carol']);
    for (const P of [A, B, Cp, G, M]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, R = (await plainOf(A, cid, m1)).rt;
    await A.S.db.doc('channels/' + cid).update({ ometa: await thiefCopy(A, cid, ['bob', 'mal'], (o) => o.rt + 1) });
    for (const P of [B, Cp, G]) await read(P, cid);
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob', 'carol'], members }])).rotated, [{ cid, ok: true }]);
    await B.loadDir(['alice'], true); await B.S.acceptKey('alice'); await read(B, cid);
    for (const P of [Cp, G]) { await P.loadDir(['alice'], true); await read(P, cid); }
    const shown = await A.shown(cid); await read(A, cid);
    assert.deepEqual([[...shown.admins].sort(), !!shown._odd, !!shown._stale, [...A.rolesOf(cid).a].sort()], [['bob', 'carol'], false, false, ['bob', 'carol']], 'her device: Bob and Carol, nothing to prompt her');
    const state = async () => [G.rolesOf(cid).a, G.rolesOf(cid).t === R + 1, G.rolesOf(cid).hk === A.S.me.sig.x, G.rolesOf(cid).n, await plantedBy(Cp, G, cid, await curKey(G, cid)), await plantedBy(B, G, cid, await curKey(G, cid)), await plantedBy(M, G, cid, await curKey(G, cid))];
    assert.deepEqual(await state(), [['bob'], true, true, 1, 'badkey', 'taken', 'badkey'], 'Gus: the admins in both lists at the lost device\'s time, under her new key: Carol demoted (fail closed), Mal gone, Bob counts');
    assert.deepEqual([B.rolesOf(cid).a, Cp.rolesOf(cid).a], [['bob'], ['bob']], 'Bob\'s page and Carol\'s own likewise');
    const asOf = async (X) => { const i = await X.createInvite(cid); return (await X.freshChan(cid)).invites[i.iid].as; };   // the `as` of a link X makes now
    assert.deepEqual([[B, Cp, G].map((P) => P.rolesOf(cid).h), await B.verifiedAdmin(await B.sync(cid)), await asOf(B)], [[undefined, undefined, undefined], null, undefined], 'the copy names an admin outside the lost device\'s list, so no fingerprint is taken: no admin\'s page trusts the admin secret, and a link Bob makes carries no `as` (its joiners wait for an Add)');
    await A.setAdmins(cid, ['bob', 'carol']);   // her admin list saved once, unchanged
    for (const P of [G, Cp, B]) await read(P, cid);
    assert.deepEqual([[...G.rolesOf(cid).a].sort(), G.rolesOf(cid).n, await plantedBy(Cp, G, cid, await curKey(G, cid))], [['bob', 'carol'], 0, 'taken'], 'her save: the whole list, Carol restored');
    assert.deepEqual([B.rolesOf(cid).h === fp(keyOf(A, cid, 'a'), cid), sameKey(await B.verifiedAdmin(await B.sync(cid)), keyOf(A, cid, 'a')), typeof await asOf(B)], [true, true, 'string'], 'and a fresh secret, trusted again: his links carry `as`');
  });
});

test('106. a lost owner device, before its removal, signs her list at her record\'s rt plus one (a time already past: no clock bound catches it) naming Fay, an account of the thief\'s, as an extra admin, kept from her devices: after the removal and Accept, Bob\'s record holds the admins in both lists (Fay gone: the removal\'s copy at her rt narrows it), so a key change Fay signs is refused on his page as on hers', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), F = await w.page('fay');
    await makeChannel(A, cid, ['alice', 'bob', 'fay'], ['bob']);
    B.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as Bob's page first saw it
    for (const P of [A, B]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, o1 = await plainOf(A, cid, m1);
    await A.S.db.doc('channels/' + cid).update({ ometa: await thiefCopy(A, cid, ['bob', 'fay'], (o) => o.rt + 1) });
    await read(B, cid); await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    assert.deepEqual([B.rolesOf(cid).a, B.rolesOf(cid).t], [['bob', 'fay'], o1.rt + 1], 'Bob\'s page took it: her key signed it');
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members: ['alice', 'bob', 'fay'] }])).rotated, [{ cid, ok: true }]);
    await B.loadDir(['alice'], true); await B.S.acceptKey('alice'); await read(B, cid); await read(A, cid);
    assert.deepEqual([A.rolesOf(cid).a, A.rolesOf(cid).t, B.rolesOf(cid).a, B.rolesOf(cid).t, B.rolesOf(cid).hk === A.S.me.sig.x], [['bob'], o1.rt, ['bob'], o1.rt + 1, true], 'after the removal and Accept: Fay is off Bob\'s record, at the lost device\'s time, under her new key');
    assert.deepEqual([await plantedBy(F, B, cid, await curKey(B, cid)), await plantedBy(F, A, cid, await curKey(A, cid))], ['badkey', 'badkey'], 'a key change Fay signs: refused on Bob\'s page, as on hers');
  });
});

test('107. the stale-device bound from a device of hers other than the removing one: her laptop, kept by the server from her Make admin Carol, reloads into her new keys after the removal (its store, so its roles record under her replaced key, kept) and is shown the copy it was kept on, sealed under a key since replaced, so it seals its stale list again at its stale rt under her new key (adoptOMeta): every member and her own phone narrow to the admins both lists name, the later time kept and no fingerprint (Carol demoted, Bob counts, no admin\'s page trusts the admin secret, his link carries no `as`); her phone, shown that older copy, refuses her change (nokey); her save from the laptop restores Carol everywhere', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), Cp = await w.page('carol'), G = await w.page('gus');
    const members = ['alice', 'bob', 'carol', 'gus'];
    B.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as Bob's page first saw it
    await makeChannel(A, cid, members, ['bob']);
    for (const P of [A, B, Cp, G]) await read(P, cid);
    const L = await w.page('alice', { owner: true, id: structuredClone(A.id) }); await read(L, cid);   // her laptop: the same account keys, a store of its own
    const m1 = (await A.sync(cid)).ometa, R = (await plainOf(A, cid, m1)).rt, oldX = A.id.sig.x;
    await A.shown(cid); await A.setAdmins(cid, ['bob', 'carol']);   // her phone makes Carol admin; the server keeps the laptop from that copy
    const R2 = (await plainOf(A, cid, (await A.sync(cid)).ometa)).rt;
    for (const P of [B, Cp, G]) await read(P, cid);
    assert.deepEqual([L.rolesOf(cid).a, L.rolesOf(cid).t, G.rolesOf(cid).a, G.rolesOf(cid).t], [['bob'], R, ['bob', 'carol'], R2], 'the laptop never saw the change; the members took it');
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob', 'carol'], members }])).rotated, [{ cid, ok: true }]);
    await B.loadDir(['alice'], true); await B.S.acceptKey('alice'); await read(B, cid);
    for (const P of [Cp, G]) { await P.loadDir(['alice'], true); await read(P, cid); }
    const st = async (P) => { await P.rolesQ.get(cid); const r = P.rolesOf(cid); return [[...r.a].sort(), r.t === R2, r.hk === A.S.me.sig.x, r.n, r.h === undefined]; };
    assert.deepEqual([await st(G), await plantedBy(Cp, G, cid, await curKey(G, cid))], [[['bob', 'carol'], true, true, 1, false], 'taken'], 'after the removal: her current list under her new key, marked narrowed, its fingerprint taken; Carol counts');
    const fresh = { ...A.S.me }; delete fresh.prev;
    const L2 = await w.page('alice', { owner: true, id: fresh, store: L.store });   // the laptop reloads into her new keys, its record kept
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });   // and is shown the copy it was kept on
    const c = await L2.sync(cid), shown = await L2.showMeta(c); await L2.rolesQ.get(cid);
    assert.deepEqual([shown._ometa, !!shown._odd, !!shown._stale, shown.admins, L2.rolesOf(cid).hk === oldX], [true, false, false, ['bob'], true], 'the laptop: a copy under her replaced key, its record stale, nothing odd or stale to see');
    await L2.adoptOMeta(c, shown);
    const o3 = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([o3.rt, o3.admins, typeof o3.rs, 'ah' in o3], [R, ['bob'], 'string', false], 'it seals its stale list again at its stale rt under her new key, naming no secret');
    for (const P of [B, Cp, G, A]) await read(P, cid);
    const asOf = async (X) => { const i = await X.createInvite(cid); return (await X.freshChan(cid)).invites[i.iid].as; };   // the `as` of a link X makes now
    assert.deepEqual([await st(G), await st(A), await plantedBy(Cp, G, cid, await curKey(G, cid)), await plantedBy(B, G, cid, await curKey(G, cid)), (await A.shown(cid)).admins, await B.verifiedAdmin(await B.sync(cid)), await asOf(B)], [[['bob'], true, true, 1, true], [['bob'], true, true, 1, true], 'badkey', 'taken', ['bob'], null, undefined], 'members and her phone: the admins both lists name, the later time kept, no fingerprint: Carol demoted, Bob counts, no admin secret trusted, his link without `as`');
    await assert.rejects(A.setAdmins(cid, ['bob', 'carol']), /nokey/, 'her phone, shown a copy older than its record, refuses her change');
    await L2.shown(cid); await L2.setAdmins(cid, ['bob', 'carol']);   // the recovery, from the laptop
    for (const P of [B, Cp, G, A]) await read(P, cid);
    assert.deepEqual([(await st(G))[0], G.rolesOf(cid).n, await plantedBy(Cp, G, cid, await curKey(G, cid)), (await st(A))[0], sameKey(await B.verifiedAdmin(await B.sync(cid)), keyOf(L2, cid, 'a')), typeof await asOf(B)], [['bob', 'carol'], 0, 'taken', ['bob', 'carol'], true, 'string'], 'her save: the whole list at a fresh time, Carol restored everywhere, a fresh secret trusted, his links carry `as` again');
  });
});
