// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.6 "Key chain"; release 92 fix round 3),
// tenth part; the first is channel-history-admin.test.js. Where the admins of a roles record count for no key commit (one taken
// under an owner key since replaced), an admin's own device removal still counts them, so his key change lands and his lost
// device loses the key; the owner's removal of the admin whose key change is the current one signs that key's commit again, and
// every page that had checked it under his name checks the row once more before refusing, so each still seals, with no reload;
// her removal's copy narrows a record to the admins both lists name, never adding one: an admin she added within a lost device's
// forward date window waits for her next change after it (and until then no admin's page that took the lost device's list trusts
// the admin secret, so their links carry no `as`), and a device of hers kept from a later admin change demotes, on the
// members, the admins it never saw, until her next change restores them.
// This file holds tests 98 to 101; 94 to 97 are in channel-history-admin9.test.js, 102 to 107 in channel-history-admin11.test.js.
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
// Who signed the current key's commit, as the server has the row now.
const headSigner = async (X, cid) => { const c = await X.sync(cid), e = X.epochOf(c), d = await X.S.db.doc('channels/' + cid + '/chain/' + e).get(); if (!d.exists) return 'none'; const o = await X.openCommit(cid, e, keyOf(X, cid, e), d.data().c); return o ? o.f : 'unopened'; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('98. an admin\'s own device removal while the server keeps her removal\'s copy from the admins (their records still under her replaced key) and another admin\'s key change is the current key: outside his removal Bob\'s page refuses Carol\'s key, as Fay\'s does (fail closed), yet his removal counts her (the device\'s own removal is the one check excepted), so its key change lands and his lost phone loses the key; his adm card has her page replace the admin secret alone', async () => {
  await world({ limits: { framesPerMin: 1000 } }, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), Cp = await w.page('carol'), F = await w.page('fay');
    const members = ['alice', 'bob', 'carol', 'fay'];
    await makeChannel(A, cid, members, ['bob', 'carol']);
    for (const P of [A, B, Cp, F]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, oldX = A.id.sig.x;
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob', 'carol'], members }])).rotated, [{ cid, ok: true }]);
    const keep = (await A.sync(cid)).ometa;
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });   // withheld: the admins never see her removal's copy
    for (const P of [B, Cp, F]) { await P.loadDir(['alice'], true); await read(P, cid); }   // her new key from the directory; the copy they read is the one from before
    assert.deepEqual([B.rolesOf(cid).hk === oldX, B.rolesOf(cid).a], [true, ['bob', 'carol']], 'Bob\'s record: under her replaced key');
    assert.equal(await ownChange(Cp, cid), 2, 'Carol changes the key: the commit her page checks is the removal\'s, the owner\'s');
    assert.deepEqual([await seal(B, cid), await seal(F, cid)], ['badkey', 'badkey'], 'outside a removal, Bob\'s page and Fay\'s refuse Carol\'s key: their records count no admin under her replaced key');
    const lost = await pageFor(null, 'bob', { id: B.id }), holds = async () => { const c = await A.sync(cid); return !!(await lost.convKey(c, A.epochOf(c))); };
    assert.equal(await holds(), true, 'his phone, lost next, holds the current key');
    await newKeys(B);
    assert.deepEqual((await removal(B, [{ cid, admin: true, admins: ['bob', 'carol'], members }])).rotated, [{ cid, ok: true, card: 'adm' }], 'his removal counts Carol: its key change lands, with his adm card');
    assert.deepEqual([A.epochOf(await A.sync(cid)), await holds()], [3, false], 'the key changed without his lost phone');
    await A.S.db.doc('channels/' + cid).update({ ometa: keep });   // her own page is served her copy (the server kept it from the admins only)
    await A.loadDir(['bob'], true);   // his new key, as the directory refresh brings it: until then her page can't check his commit
    const n = [A.spy.rotate.length, A.spy.admins.length];
    await A.run(cid); await A.run(cid);
    assert.deepEqual([A.spy.rotate.length - n[0], A.spy.admins.length - n[1], await A.cards(cid)], [0, 1, []], 'her page: a new admin secret, no second key change; the card is gone');
  });
});

test('99. a lost owner device, before its removal, signs her list naming Mal dated fifteen seconds ahead of her clock (within the date limit), which the server shows the members and keeps from her devices; after the removal and Accept her removal\'s copy narrows their records (Mal gone) at the lost device\'s time: her Make admin (Yuri) made before that time has passed is dated below it, so it narrows too and adds nobody (Yuri counts on the members only later), while her drop of Bob applies at once; her first change dated after that time carries the whole list: Yuri counts, Mal doesn\'t', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), F = await w.page('fay', { build: acceptBuild }), Y = await w.page('yuri'), M = await w.page('mal');
    const members = ['alice', 'bob', 'fay', 'yuri', 'mal'];
    await makeChannel(A, cid, members, ['bob']);
    for (const P of [B, F]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, F, Y, M]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, o1 = await plainOf(A, cid, m1), oldX = A.id.sig.x, ahead = Date.now() + 15e3;
    await A.S.db.doc('channels/' + cid).update({ ometa: await lostCopy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), { name: o1.name, desc: o1.desc, photo: o1.photo, owner: 'alice', admins: ['bob', 'mal'], rt: ahead, ah: fp(new Uint8Array(randomBytes(32)), cid), at: 1 }) });
    for (const P of [B, F]) await read(P, cid);
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true }]);
    const S2 = keyOf(A, cid, 'a'), asOf = async (X) => { const i = await X.createInvite(cid); return (await X.freshChan(cid)).invites[i.iid].as; };   // the removal's admin secret; the `as` of a link X makes now
    for (const P of [B, F]) { await P.loadDir(['alice'], true); await P.S.acceptKey('alice'); await read(P, cid); }
    assert.deepEqual([F.rolesOf(cid).a, F.rolesOf(cid).t, F.rolesOf(cid).hk === oldX, F.rolesOf(cid).n], [['bob'], ahead, false, 1], 'after the removal: narrowed to Bob at the lost device\'s time, under her new key');
    assert.ok(Date.now() < ahead - 2000, 'still within the lost device\'s window (a run this slow proves nothing)');
    await A.shown(cid); await A.setAdmins(cid, ['bob', 'yuri']);   // within the window: dated by her clock, below the lost device's time
    for (const P of [B, F]) await read(P, cid);
    assert.deepEqual([F.rolesOf(cid).a, await plantedBy(Y, F, cid, await curKey(F, cid)), A.rolesOf(cid).a], [['bob'], 'badkey', ['bob', 'yuri']], 'her add within the window: nobody added on Fay\'s page (Yuri\'s key change refused there); her own record has him');
    assert.deepEqual([B.rolesOf(cid).h === fp(S2, cid), sameKey(S2, keyOf(A, cid, 'a')), await B.verifiedAdmin(await B.sync(cid)), await asOf(B)], [true, false, null, undefined], 'and the records keep the removal\'s fingerprint, whose secret her add replaced: Bob\'s page trusts no admin secret, so his link carries no `as`');
    await A.shown(cid); await A.setAdmins(cid, ['yuri']);   // a drop within the window (Bob): applies at once
    assert.ok(Date.now() < ahead, 'still within the window');
    for (const P of [B, F]) await read(P, cid);
    assert.deepEqual([F.rolesOf(cid).a, await plantedBy(B, F, cid, await curKey(F, cid))], [[], 'badkey'], 'her drop within the window: Bob gone at once');
    const left = ahead - Date.now(); if (left > 0) await wait(left + 500);
    await A.shown(cid); await A.setAdmins(cid, ['yuri', 'bob']);   // her first change dated after the lost device's time: the whole list
    for (const P of [B, F]) await read(P, cid);
    assert.deepEqual([[...F.rolesOf(cid).a].sort(), F.rolesOf(cid).n, await plantedBy(Y, F, cid, await curKey(F, cid)), await plantedBy(M, F, cid, await curKey(F, cid))], [['bob', 'yuri'], 0, 'taken', 'badkey'], 'taken whole: Yuri counts, Mal doesn\'t');
    assert.deepEqual([sameKey(await B.verifiedAdmin(await B.sync(cid)), keyOf(A, cid, 'a')), typeof await asOf(B)], [true, 'string'], 'its fresh secret trusted on Bob\'s page: his links carry `as` again');
  });
});

test('100. no lost device: Bob, an admin, changed the key last, and the owner, Carol (an admin) and Mona (a member) each sealed under it (the head\'s commit checked under his name and kept); the owner removes Bob as admin, signing the head\'s commit again as herself: each of them still seals the current key with nothing cleared (the check reads the row once more before refusing a signer the record no longer counts), and so does Nina, who checks it first after the drop; a key change Bob makes now is refused', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), Cp = await w.page('carol'), M = await w.page('mona'), N = await w.page('nina');
    const members = ['alice', 'bob', 'carol', 'mona', 'nina'];
    await makeChannel(A, cid, members, ['bob', 'carol']);
    await A.ensureChain(await A.sync(cid));
    for (const P of [A, B, Cp, M, N]) await read(P, cid);
    assert.equal(await ownChange(B, cid), 1, 'Bob changes the key (a kick, a leave batch): his commit is the head');
    assert.deepEqual([await seal(A, cid), await seal(Cp, cid), await seal(M, cid)], ['ok', 'ok', 'ok'], 'each page seals under it: the head is checked under his name and kept');
    await A.setAdmins(cid, ['carol']);   // the owner removes Bob: signs the head again as herself first, replaces the admin secret, writes the list
    for (const P of [A, Cp, M, N]) await read(P, cid);
    assert.deepEqual([await headSigner(A, cid), ...[A, Cp, M].map((P) => P.rolesOf(cid).a)], ['alice', ['carol'], ['carol'], ['carol']], 'the head\'s commit is hers now, and Bob is off every record');
    assert.deepEqual([await seal(A, cid), await seal(Cp, cid), await seal(M, cid), await seal(N, cid)], ['ok', 'ok', 'ok', 'ok'], 'each still seals the current key, with nothing cleared; Nina at her first check');
    assert.equal(await plantedBy(B, M, cid, await curKey(M, cid)), 'badkey', 'a key change Bob makes now: refused');
  });
});

test('101. the stale-device bound: her other device makes Carol admin (every member takes it); the server keeps her removing device from that copy, so its removal signs her older list at her older rt under her new key: the members keep only the admins both lists name (Carol demoted there, nobody promoted), the record\'s later time stays, the key it counts under moves (Carol\'s key change refused, Bob\'s taken); her next admin change, dated past that time, carries the whole list and restores Carol everywhere', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), F = await w.page('fay', { build: acceptBuild }), Cp = await w.page('carol'), G = await w.page('gus');
    const members = ['alice', 'bob', 'fay', 'carol', 'gus'];
    await makeChannel(A, cid, members, ['bob']);
    for (const P of [B, F]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, F, Cp, G]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, R = (await plainOf(A, cid, m1)).rt, oldX = A.id.sig.x;
    const A2 = await w.page('alice', { owner: true, id: A.id }); await read(A2, cid);   // her other device, the same keys
    await A2.setAdmins(cid, ['bob', 'carol']);
    const R2 = (await plainOf(A2, cid, (await A2.sync(cid)).ometa)).rt;
    for (const P of [B, F, Cp, G]) await read(P, cid);
    assert.deepEqual([R2 > R, ...[B, F, G].map((P) => [P.rolesOf(cid).a, P.rolesOf(cid).t === R2]), await plantedBy(Cp, F, cid, await curKey(F, cid))], [true, [['bob', 'carol'], true], [['bob', 'carol'], true], [['bob', 'carol'], true], 'taken'], 'her other device\'s change, taken by every member');
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });   // the server keeps her removing device from that copy: it serves it the older one
    await read(A, cid); assert.deepEqual([A.rolesOf(cid).a, A.rolesOf(cid).t], [['bob'], R], 'her removing device never saw the change');
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true }]);
    const keep = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([keep.rt, keep.admins], [R, ['bob']], 'the removal\'s copy: her older list at her older rt, under her new key');
    for (const P of [B, F]) { await P.loadDir(['alice'], true); await P.S.acceptKey('alice'); await read(P, cid); }
    await G.loadDir(['alice'], true); await read(G, cid);
    const state = async () => { const out = []; for (const P of [B, F, G]) { await P.rolesQ.get(cid); const r = P.rolesOf(cid); out.push([[...r.a].sort(), r.t === R2, r.hk !== oldX && r.hk === A.S.me.sig.x, r.n, await plantedBy(Cp, P, cid, await curKey(P, cid)), P === B ? 'n/a' : await plantedBy(B, P, cid, await curKey(P, cid))]); } return out; };
    assert.deepEqual(await state(), [[['bob'], true, true, 1, 'badkey', 'n/a'], [['bob'], true, true, 1, 'badkey', 'taken'], [['bob'], true, true, 1, 'badkey', 'taken']], 'narrowed to the admins both lists name, the later time kept, the key moved: Carol demoted (fail closed), Bob counts');
    await A.shown(cid); await A.setAdmins(cid, ['bob', 'carol']);   // her next change, dated by her clock: past R2
    assert.ok((await plainOf(A, cid, (await A.sync(cid)).ometa)).rt > R2, 'dated past the stale time');
    for (const P of [B, F, G]) await read(P, cid);
    assert.deepEqual(await state(), [[['bob', 'carol'], false, true, 0, 'taken', 'n/a'], [['bob', 'carol'], false, true, 0, 'taken', 'taken'], [['bob', 'carol'], false, true, 0, 'taken', 'taken']], 'the whole list again, the mark cleared, Carol restored');
    assert.deepEqual([...A.rolesOf(cid).a].sort(), ['bob', 'carol'], 'her own record too');
  });
});
