// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.6 "Key chain"; release 92 fix round 3),
// fifth part; the first is channel-history-admin.test.js. A lost owner device holds her account key until she removes it, so
// before then it can sign her list naming an admin of its own, dated ahead of hers. A page notes no copy dated more than five
// minutes ahead of its own clock (the date limit; the same copy is taken once that clock has caught up), so her next
// admin change, dated by her clock, is taken everywhere. The admins of a roles record count for key commits only while it was
// taken under her key as the page holds it now, decided at every check and never kept: after her key change (a device removal)
// none count, on a page other than hers, until a copy of hers under the new key is noted; her removal's own copy, at her
// record's rt under her new key, narrows a record taken under the replaced key whatever rt the lost device chose (only the
// admins in both lists stay, the rt stays), so a planted admin is gone the moment it arrives, with no change of hers.
// This file holds tests 79 to 82; the other lost-device tests are 70 to 78 (channel-history-admin3 and -admin4.test.js), 83
// to 86 (channel-history-admin6.test.js) and 94 to 106 (channel-history-admin9 to -admin11.test.js). The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, lift, mkBuild, pageFor } from './channel-history-kit.js';

// `ah` as SPEC.md 5.6 has it: HKDF-SHA-256 of the admin secret, salt "hush-admin-id-v1", info the channel id, 32 bytes, base64url.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));
// Helpers shared with channel-history-admin4.test.js and the other channel-history files, copied as the removal tests do.
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
// The lost device's own copy of the owner's part: sealed under epoch e's key, signed with the account key it still holds.
async function lostCopy(sigPriv, cid, e, raw, x) {
  const sk = await crypto.subtle.importKey('jwk', sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const parts = [cid, String(e), String(x.rt), x.owner, [...x.admins].sort().join(','), x.ah, String(x.at)];
  const rs = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from('hush-roles-v1|' + parts.join('|')))).toString('base64');
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(JSON.stringify({ ...x, rs })))).toString('base64') };
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

test('79. the date limit: a lost owner device, before its removal, signs her list naming an admin of its own (Mal) at rt 1e300, which the server shows every page, hers included, and at an rt a day ahead, kept from her devices, and names an admin secret of its own at her record\'s rt with `at` 1e300 and a day ahead: no page notes any of them, so her next admin change, dated by her clock, is taken everywhere', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), X = await w.page('xena'); await w.page('mal');
    await makeChannel(A, cid, ['alice', 'bob', 'xena', 'mal'], ['bob', 'xena']);
    for (const P of [A, B, X]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, o1 = await plainOf(A, cid, m1), St = new Uint8Array(randomBytes(32));
    const rec = (P) => { const r = P.rolesOf(cid); return [r.t, r.a, r.h]; }, was = [A, B, X].map(rec);
    for (const [what, rt, admins, at, hers] of [
      ['rt 1e300', 1e300, ['bob', 'xena', 'mal'], 1, true], ['an rt a day ahead', Date.now() + 864e5, ['bob', 'xena', 'mal'], 1, false],
      ['`at` 1e300', o1.rt, o1.admins, 1e300, true], ['`at` a day ahead', o1.rt, o1.admins, Date.now() + 864e5, false]]) {
      const x = { name: o1.name, desc: o1.desc, photo: o1.photo, owner: 'alice', admins, rt, ah: fp(St, cid), at };
      await A.S.db.doc('channels/' + cid).update({ ometa: await lostCopy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), x) });
      for (const P of hers ? [A, B, X] : [B, X]) await read(P, cid);
      await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
      assert.deepEqual([A, B, X].map(rec), was, what + ': noted by no page');
    }
    await read(A, cid); await A.setAdmins(cid, ['bob']);
    for (const P of [B, X]) await read(P, cid);
    const o2 = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.ok(o2.rt > o1.rt && o2.rt <= Date.now(), 'her change: dated by her clock');
    assert.deepEqual([A, B, X].map((P) => [P.rolesOf(cid).t, P.rolesOf(cid).a]), Array(3).fill([o2.rt, ['bob']]), 'and taken everywhere');
  });
});

test('80. after a device removal and Accept, a page whose roles record was taken under her replaced key counts its admins for no key commit until a copy of hers under her new key comes (the removal\'s, which the server held back a moment here): a key change an admin makes is refused there, while the admin\'s own page makes one (the commit it checks is hers); once her copy lands the page takes it with no reload: his key seals there and his next change is taken. Her own page counts her admins throughout, so her removal changes a key an admin made', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), F = await w.page('fay', { build: acceptBuild });
    await makeChannel(A, cid, ['alice', 'bob', 'fay'], ['bob']);
    for (const P of [B, F]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, F]) await read(P, cid);
    assert.equal(await ownChange(B, cid), 1, 'the current key: Bob\'s');
    const m1 = (await A.sync(cid)).ometa, R = (await plainOf(A, cid, m1)).rt;
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members: ['alice', 'bob', 'fay'] }])).rotated, [{ cid, ok: true }], 'her page, its record still under her old key, counts Bob\'s commit and changes the key');
    const keep = (await A.sync(cid)).ometa;
    assert.equal((await plainOf(A, cid, keep)).rt, R, 'the removal signs her list again at its rt, under her new key');
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });   // held back a moment
    for (const P of [B, F]) { await P.loadDir(['alice'], true); await P.S.acceptKey('alice'); await read(P, cid); }
    assert.deepEqual([F.rolesOf(cid).t, F.rolesOf(cid).a, F.rolesOf(cid).hk === A.S.me.sig.x], [R, ['bob'], false], 'Fay\'s record: her list, taken under her replaced key');
    assert.equal(await plantedBy(B, F, cid, await curKey(F, cid)), 'badkey', 'a key change Bob makes: refused on Fay\'s page');
    assert.equal(await ownChange(B, cid), 3, 'Bob\'s own page makes one: the commit it checks is hers');
    assert.equal(await seal(F, cid), 'badkey', 'which Fay\'s page refuses too');
    await A.S.db.doc('channels/' + cid).update({ ometa: keep });
    for (const P of [B, F]) await read(P, cid);
    assert.deepEqual([F.rolesOf(cid).a, F.rolesOf(cid).hk === A.S.me.sig.x], [['bob'], true], 'her copy under the new key: taken');
    assert.deepEqual([await seal(F, cid), await plantedBy(B, F, cid, await curKey(F, cid))], ['ok', 'taken'], 'Bob\'s key seals there now, and his next change is taken');
    assert.equal(await ownChange(B, cid), 4, 'and Bob\'s page makes another');
  });
});

test('81. a lost owner device, before its removal, signs her list at her record\'s rt plus one (within the date limit) naming an admin of its own (Mal, a subscriber), which the server shows the others and keeps from her devices: after the removal and Accept, her removal\'s copy, at her record\'s rt under her new key, narrows their records at once: Mal is gone (his key change is refused), Bob counts (his is taken, and his own page makes one), the lost device\'s rt stays; her own page counts her admins throughout; her next admin change then takes the whole list and clears the mark', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), F = await w.page('fay', { build: acceptBuild }), M = await w.page('mal');
    await makeChannel(A, cid, ['alice', 'bob', 'fay', 'mal'], ['bob']);
    for (const P of [B, F]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, F]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, o1 = await plainOf(A, cid, m1);
    const x = { name: o1.name, desc: o1.desc, photo: o1.photo, owner: 'alice', admins: ['bob', 'mal'], rt: o1.rt + 1, ah: fp(new Uint8Array(randomBytes(32)), cid), at: 1 };
    await A.S.db.doc('channels/' + cid).update({ ometa: await lostCopy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), x) });
    for (const P of [B, F]) await read(P, cid);
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    assert.deepEqual([A, B, F].map((P) => P.rolesOf(cid).a), [['bob'], ['bob', 'mal'], ['bob', 'mal']], 'before the removal, every page it reaches takes it: her key signed it');
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members: ['alice', 'bob', 'fay', 'mal'] }])).rotated, [{ cid, ok: true }]);
    const S2 = keyOf(A, cid, 'a');
    for (const P of [B, F]) { await P.loadDir(['alice'], true); await P.S.acceptKey('alice'); await read(P, cid); }
    await read(A, cid);
    assert.deepEqual([A.rolesOf(cid).t, B.rolesOf(cid).t, F.rolesOf(cid).t], [o1.rt, o1.rt + 1, o1.rt + 1], 'the removal\'s list, at her record\'s rt, moves no record\'s time');
    assert.deepEqual([B, F].map((P) => [P.rolesOf(cid).a, P.rolesOf(cid).h, P.rolesOf(cid).hk === A.S.me.sig.x, P.rolesOf(cid).n]), [[['bob'], fp(S2, cid), true, 1], [['bob'], fp(S2, cid), true, 1]], 'but narrows each: Mal is gone, the removal\'s secret is taken, under her new key, the mark set');
    assert.deepEqual([await plantedBy(M, F, cid, await curKey(F, cid)), await plantedBy(B, F, cid, await curKey(F, cid))], ['badkey', 'taken'], 'on Fay\'s page: Mal\'s key change refused, Bob\'s taken');
    assert.equal(await plantedBy(B, A, cid, await curKey(A, cid)), 'taken', 'her own page counts her admins');
    assert.equal(await ownChange(B, cid), 2, 'and Bob\'s page makes one');
    await A.shown(cid); await A.setAdmins(cid, ['bob']);   // her next admin change: any will do
    for (const P of [B, F]) await read(P, cid);
    assert.deepEqual([F.rolesOf(cid).t > o1.rt + 1, F.rolesOf(cid).a, F.rolesOf(cid).n, B.rolesOf(cid).n], [true, ['bob'], 0, 0], 'taken whole: a later time, the mark cleared');
    assert.deepEqual([await plantedBy(M, F, cid, await curKey(F, cid)), await plantedBy(B, F, cid, await curKey(F, cid))], ['badkey', 'taken'], 'Mal\'s refused, Bob\'s taken');
  });
});

test('82. the date limit on one page: a copy of her list dated more than five minutes ahead of this page\'s clock (from her other device, whose clock is eleven minutes fast, too far to be noted by itself: test 83) is not noted, and the same copy is noted when this page reads it once this clock has caught up, with no reload', async () => {
  const O = await pageFor(null, 'olga'), F = await pageFor(null, 'olga', { id: O.id, clock: { skew: 660e3 } }), N = await pageFor(null, 'nina');
  const cid = 'cRolesAhead01', K = randomBytes(32), rec = (m) => ({ id: cid, type: 'channel', visibility: 'private', epoch: 0, keys: {}, ometa: m });
  N.ksPut(cid, 0, N.b64(K)); N.S.dir.olga = { handle: 'olga', ecdh: O.id.ecdh, sig: O.id.sig, kv: 1 };
  const see = async (m) => { assert.ok(await N.readOMeta(rec(m)), 'it opens'); await N.rolesQ.get(cid); const r = N.rolesOf(cid); return r && [r.a, r.h]; };
  assert.deepEqual(await see(await O.sealOMeta(cid, 0, K, { name: 'R', owner: 'olga', admins: ['yuri'], _ah: 'h0' })), [['yuri'], 'h0'], 'her copy, dated by a clock like this one: noted');
  const ahead = await F.sealOMeta(cid, 0, K, { name: 'R', owner: 'olga', admins: ['yuri', 'zara'], _ah: 'h1' });
  assert.deepEqual(await see(ahead), [['yuri'], 'h0'], 'eleven minutes ahead of this clock: not noted');
  N.clock.skew += 420e3;
  assert.deepEqual(await see(ahead), [['yuri', 'zara'], 'h1'], 'the same copy, once this clock has caught up: noted');
});
