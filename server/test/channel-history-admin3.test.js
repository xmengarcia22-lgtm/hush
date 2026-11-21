// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.3 `ometa` and `invites`, 5.6 "Key
// chain"; release 92 fix round 3), third part; the first is channel-history-admin.test.js. When the owner's page replaces the
// admin secret by itself (a device removal, an admin dropped while the channel was public) it signs the new fingerprint with the
// list it already holds, at that record's rt; a roles copy the owner signed for the same admins takes the fingerprint named later
// (`at`). An admin's page that has seen her key change but not accepted it trusts no admin secret (test 76), and one whose record
// was taken under her replaced key takes, of her list at or before its rt under her new key, only the admins in both lists, its rt
// unchanged, and its admin secret only when it names no other (tests 77 and 78; the rest of the lost-device tests, 70 to 75, are
// in channel-history-admin4.test.js). The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, linkOf, lift, mkBuild, pageFor } from './channel-history-kit.js';

// `ah` as SPEC.md 5.6 has it: HKDF-SHA-256 of the admin secret, salt "hush-admin-id-v1", info the channel id, 32 bytes, base64url.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));
// Helpers shared with channel-history-admin.test.js and the other channel-history files, copied as the removal tests do.
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
async function plainOf(X, cid, m) {   // the plaintext of a channel's ometa, opened with the key X holds for its epoch
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}

const LBL = 'x'.repeat(22);
// What the server learns with S from a record: each link whose `as` S opens, and the keys its packet holds.
async function leakOf(X, S, c) {
  const out = {};
  for (const [iid, x] of Object.entries(c.invites || {})) { const s = x && x.as && await X.openAs(S, c.id, iid, x.as); if (!s) continue;
    try { out[iid] = JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: X.unb64(x.iv) }, await X.inviteKey(s, c.id, iid), X.unb64(x.ct))).toString()); } catch { out[iid] = 'its secret'; } }
  return out;
}

// ---- an admin secret the owner's page replaces by itself, and the times it is named at ----

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
// A link of someone else's in X's copy of the record: its `as` under the secret S, its packet under its own secret.
async function foreignLink(X, cid, S, c) {
  const s = randomBytes(16), iid = 'srv' + randomBytes(5).toString('hex').slice(0, 9), iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await X.inviteKey(s, cid, iid), Buffer.from('{}')));
  return { ...c, invites: { [iid]: { iv: X.b64(iv), ct: X.b64(ct), ph: 'f'.repeat(64), ts: Date.now() + 60e3, as: await X.sealAs(S, cid, iid, s) } } };
}

test('60. the owner removes a device: her page names the new admin secret at its record\'s rt with the list unchanged, under her new key; an admin\'s page that pinned her old key keeps the old fingerprint (the lost device knows that secret) until it accepts her new security code, and takes the new one as it does, with no reload: a wrap of the old secret for it then seals no `as` under it, and a link of the lost device\'s is neither shown nor carried', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }); await w.page('fay');
    await makeChannel(A, cid, ['alice', 'bob', 'fay'], ['bob']);
    B.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as Bob's page first saw it
    await read(A, cid); await read(B, cid);
    const S1 = keyOf(A, cid, 'a'), o1 = await plainOf(A, cid, (await A.sync(cid)).ometa);
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members: ['alice', 'bob', 'fay'] }])).rotated, [{ cid, ok: true }]);
    const S2 = keyOf(A, cid, 'a'), o2 = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([o2.rt, o2.admins, o2.ah, o2.at > o1.at, sameKey(S2, S1)], [o1.rt, ['bob'], fp(S2, cid), true, false], 'the new secret named later, at her record\'s rt, the list unchanged');
    await B.loadDir(['alice'], true); await read(B, cid);
    assert.equal(B.rolesOf(cid).h, fp(S1, cid), 'her new code not accepted: the old fingerprint');
    await B.S.acceptKey('alice'); await read(B, cid);
    assert.deepEqual([B.rolesOf(cid).h, B.rolesOf(cid).e, B.rolesOf(cid).a], [fp(S2, cid), 1, ['bob']], 'accepted, no reload: the new one, under the new key');
    // the lost device and the server: a wrap of S1 for Bob first in akeys, and a link of the lost device's with an `as` under S1
    let c = await B.sync(cid); const p = { ...c, akeys: { [LBL]: await B.wrapTo(S1, B.id.ecdh, B.wrapSalt(cid + '#a', undefined, 'bob')), ...c.akeys } };
    B.S.chatDocs.set(cid, p);
    const i = await B.createInvite(cid); c = await B.freshChan(cid);
    assert.deepEqual([await leakOf(B, S1, c), b64u(await B.openAs(S2, cid, i.iid, c.invites[i.iid].as))], [{}, i.secret], 'Bob\'s link: its `as` under the new secret, nothing under the old');
    const fake = await foreignLink(B, cid, S1, p); B.ls.set('hush:inv:' + cid, null);
    assert.deepEqual([await B.keptLink(fake), await B.carryLinks(fake, 2, new Uint8Array(randomBytes(32)))], [null, {}], 'the lost device\'s link: not shown, not carried');
  });
});

test('61. made public, an admin dropped while public (a new admin secret, no ometa), then private again: the private ometa names no admin secret; the owner\'s page then makes a fresh one, wrapped to the owner and the admins left, and names it at that ometa\'s rt; every page takes it, so the private secret from before, which the dropped admin knows, seals no `as` when slipped into akeys; when the fresh one is lost, every page refuses all until the owner\'s next open makes one, past such a wrap', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), X = await w.page('xena');
    await makeChannel(A, cid, ['alice', 'bob', 'xena'], ['bob', 'xena']);
    for (const P of [A, B, X]) await read(P, cid);
    const S1 = keyOf(A, cid, 'a'), om = [], doc = A.S.db.doc;
    A.S.db.doc = (q) => { const d = doc(q), u = d.update; d.update = (v) => { if (v && v.ometa) om.push(v.ometa); return u(v); }; return d; };
    await A.shown(cid); await A.setVisibility(cid, 'public'); await A.sync(cid); await A.setAdmins(cid, ['bob']);
    const Sp = keyOf(A, cid, 'a'); await A.sync(cid); await A.setVisibility(cid, 'private');
    const S3 = keyOf(A, cid, 'a'), p0 = await plainOf(A, cid, om[0]);
    assert.deepEqual([om.length, 'ah' in p0], [2, false], 'the private ometa names none, and one more follows');
    const p1 = await plainOf(A, cid, om[1]);
    assert.deepEqual([p1.admins, p1.ah, p1.rt, sameKey(S3, S1), sameKey(S3, Sp)], [['bob'], fp(S3, cid), p0.rt, false, false], 'a fresh secret, named at its rt');
    await read(B, cid); await read(X, cid);
    assert.deepEqual([B.rolesOf(cid).a, B.rolesOf(cid).h, await X.verifiedAdmin(await X.sync(cid))], [['bob'], fp(S3, cid), null], 'Bob\'s page takes it; Xena (no subscriber now: a public channel lists none) holds none a page trusts');
    // Xena and the server: a wrap of S1 for Bob, first in akeys
    let c = await B.sync(cid); B.S.chatDocs.set(cid, { ...c, akeys: { [LBL]: await X.wrapTo(S1, B.id.ecdh, X.wrapSalt(cid + '#a', undefined, 'bob')), ...c.akeys } });
    const i = await B.createInvite(cid); c = await B.freshChan(cid);
    assert.deepEqual([await leakOf(B, S1, c), b64u(await B.openAs(S3, cid, i.iid, c.invites[i.iid].as))], [{}, i.secret], 'Bob\'s link: its `as` under the fresh secret, nothing under S1');
    // once more, the fresh secret lost (chat.admins refused): every page refuses all, until the owner's next open makes one
    await A.sync(cid); await A.setVisibility(cid, 'public'); await A.sync(cid); A.spy.failAdmins = 1; await A.setVisibility(cid, 'private');
    await read(B, cid);
    const l = await linkOf(B, cid);
    assert.deepEqual([B.rolesOf(cid).h, (await B.sync(cid)).invites[l.iid].as], [undefined, undefined], 'no fingerprint anywhere: Bob\'s link has no `as`');
    c = await A.sync(cid); A.S.chatDocs.set(cid, { ...c, akeys: { [LBL]: await X.wrapTo(S1, A.id.ecdh, X.wrapSalt(cid + '#a', undefined, 'alice')), ...c.akeys } }); A.spy.admins.length = 0;
    await A.rollRun(A.S.chatDocs.get(cid));
    const S4 = keyOf(A, cid, 'a'), o4 = await plainOf(A, cid, (await A.sync(cid)).ometa); await read(B, cid);
    assert.deepEqual([A.spy.admins.length, o4.ah, B.rolesOf(cid).h, sameKey(S4, S1), sameKey(S4, S3)], [1, fp(S4, cid), fp(S4, cid), false, false], 'the owner\'s next open: a fresh one, past the wrap of S1, and Bob\'s page takes it');
  });
});

test('62. an owner device the server keeps from a later admin change (served the older signed ometa), even the one whose own secret that copy names, or one linked since and served that copy first with a wrap of the server\'s, makes no admin secret when it opens the channel; on a device that saw the drop an adm card\'s new secret is named at the same rt and every page takes it; one acted on by the device kept from it replaces the secret only at that older list\'s rt, so no page takes the old list back and the admin dropped since gets none any page trusts', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), A2 = await w.page('alice', { owner: true, id: A.id }), B = await w.page('bob'), X = await w.page('xena');
    await makeChannel(A, cid, ['alice', 'bob', 'xena'], ['bob', 'xena']);
    for (const P of [A, A2, B, X]) await read(P, cid);
    await A2.rotateAdmins(cid, ['bob', 'xena']);   // the second device's own change: its secret, named and landed
    for (const P of [A, B, X]) await read(P, cid);
    const old = (await A.sync(cid)).ometa, o0 = await plainOf(A, cid, old);
    await A.shown(cid); await A.setAdmins(cid, ['bob']);   // the first device drops Xena
    for (const P of [B, X]) await read(P, cid);
    const o1 = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([B.rolesOf(cid).a, X.rolesOf(cid).h], [['bob'], o1.ah]);
    let c = await A2.sync(cid); A2.S.chatDocs.set(cid, { ...c, ometa: old }); A2.spy.admins.length = 0;
    await A2.rollRun(A2.S.chatDocs.get(cid));
    const N = await w.page('alice', { owner: true, id: A.id }); c = await N.sync(cid);   // a device of hers linked since
    N.S.chatDocs.set(cid, { ...c, ometa: old, akeys: { [LBL]: await N.wrapTo(new Uint8Array(randomBytes(32)), N.id.ecdh, N.wrapSalt(cid + '#a', undefined, 'alice')), ...c.akeys } });
    await N.rollRun(N.S.chatDocs.get(cid));
    assert.deepEqual([A2.spy.admins.length, N.spy.admins.length, N.rolesOf(cid).h], [0, 0, o0.ah], 'neither makes an admin secret');
    // Bob removes a lost device: his adm card, acted on by the device that saw the drop: the new secret named at the same rt, taken by every page
    await B.writeCard(await B.sync(cid), 'adm'); A.spy.admins.length = 0; await A.run(cid);
    const S5 = keyOf(A, cid, 'a'), o5 = await plainOf(A, cid, (await A.sync(cid)).ometa);
    for (const P of [B, X]) await read(P, cid);
    assert.deepEqual([A.spy.admins.length, o5.rt, o5.admins, B.rolesOf(cid).h, X.rolesOf(cid).h, X.rolesOf(cid).a], [1, o1.rt, ['bob'], fp(S5, cid), fp(S5, cid), ['bob']], 'named at the drop\'s rt, every page takes it');
    const l = await linkOf(B, cid);
    assert.equal(b64u(await B.openAs(S5, cid, l.iid, (await B.sync(cid)).invites[l.iid].as)), l.secret, 'Bob\'s next link carries `as` under it');
    // and again, acted on by the device kept from the drop: replaced there only at the older list's rt
    await B.writeCard(await B.sync(cid), 'adm');
    c = await A2.sync(cid); A2.S.chatDocs.set(cid, { ...c, ometa: old }); await A2.rollRun(A2.S.chatDocs.get(cid));
    const o2 = await plainOf(A2, cid, (await A2.freshChan(cid)).ometa);
    assert.deepEqual([A2.spy.admins.length, o2.rt, o2.admins], [1, o0.rt, ['bob', 'xena']], 'replaced there, named at the older list\'s rt');
    for (const P of [A, B, X]) await read(P, cid);
    assert.deepEqual([A.rolesOf(cid).a, B.rolesOf(cid).a, B.rolesOf(cid).h, X.rolesOf(cid).h], [['bob'], ['bob'], fp(S5, cid), fp(S5, cid)], 'no page takes the old list or its secret');
    assert.deepEqual([await X.verifiedAdmin(await X.sync(cid)), await B.verifiedAdmin(await B.sync(cid))], [null, null], 'Xena holds no secret a page trusts (and Bob\'s page trusts none until the owner\'s next change)');
  });
});

test('63. roles: of the record\'s own rt, a copy the owner signed naming the same admins takes the admin secret\'s fingerprint named later (`at`), also over one the record names, and moves the epoch; one named earlier and sent again, or naming other admins, changes nothing; a later rt takes its list with its fingerprint, or with none', async () => {
  const [O, N] = [await pageFor(null, 'olga'), await pageFor(null, 'nina')];
  const cid = 'cAdminIdTst01', K = Array.from({ length: 3 }, () => randomBytes(32));
  for (const X of [O, N]) { for (let e = 0; e < 3; e++) X.ksPut(cid, e, X.b64(K[e])); X.S.dir.olga = { handle: 'olga', ecdh: O.id.ecdh, sig: O.id.sig, kv: 1 }; }
  const rec = (ometa) => ({ id: cid, type: 'channel', visibility: 'private', epoch: 2, keys: {}, ometa });
  const see = async (X, m) => { assert.ok(await X.readOMeta(rec(m)), 'it opens'); await X.rolesQ.get(cid); const r = X.rolesOf(cid); return [r.t, r.a, r.h, r.e]; };
  const c0 = await O.sealOMeta(cid, 0, K[0], { name: 'R', owner: 'olga', admins: ['yuri'], _ah: 'h0' }); await see(O, c0);
  const t = O.rolesOf(cid).t, keep = (e, admins, ah) => { O.clock.skew += 1000; return O.sealMeta(cid, e, K[e], { name: 'R', owner: 'olga', admins, _rt: t, _ah: ah }, 'keep'); };
  const k1 = await keep(0, ['yuri'], 'h1'), k2 = await keep(1, ['yuri'], 'h2'), kz = await keep(0, ['yuri', 'zara'], 'hz');
  assert.deepEqual(await see(N, c0), [t, ['yuri'], 'h0', 0], 'first sight');
  assert.deepEqual(await see(N, kz), [t, ['yuri'], 'h0', 0], 'the same rt naming other admins: nothing, though named later');
  assert.deepEqual(await see(N, k2), [t, ['yuri'], 'h2', 1], 'the same rt and admins, named later: taken, and the epoch moves');
  assert.deepEqual(await see(N, k1), [t, ['yuri'], 'h2', 1], 'one named earlier, sent again: nothing');
  O.clock.skew += 1000; const later = await O.sealOMeta(cid, 1, K[1], { name: 'R', owner: 'olga', admins: ['yuri', 'zara'], _ah: '' }), lt = (await plainOf(O, cid, later)).rt;
  assert.deepEqual(await see(N, later), [lt, ['yuri', 'zara'], undefined, 1], 'a later rt naming none: its list, and no fingerprint');
});

test('76. the owner removes a device, and an admin\'s page has her new code but hasn\'t accepted it: it trusts no admin secret (it refuses her signed lists then too), so once another admin who accepted changes the key (Xena removes Fay), Bob\'s page makes no link (it counts Xena\'s key change only once it holds the list under her new key) and a wrap of the secret from before the removal, which the lost device knew, seals no `as`, so the key from after the removal doesn\'t leak; after his Accept he takes the removal\'s, and his link\'s `as` is under it (a lost device\'s own secret: test 75)', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), X = await w.page('xena', { build: acceptBuild }); await w.page('fay');
    await makeChannel(A, cid, ['alice', 'bob', 'xena', 'fay'], ['bob', 'xena']);
    for (const P of [B, X]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, X]) await read(P, cid);
    const S1 = keyOf(A, cid, 'a');
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob', 'xena'], members: ['alice', 'bob', 'xena', 'fay'] }])).rotated, [{ cid, ok: true }]);
    const S2 = keyOf(A, cid, 'a');
    await X.loadDir(['alice'], true); await X.S.acceptKey('alice'); await read(X, cid);
    await X.kickMember(cid, 'fay', { ban: false });
    await B.loadDir(['alice'], true); await read(B, cid);
    assert.deepEqual([B.S.pins.alice.sig.x !== B.S.dir.alice.sig.x, B.rolesOf(cid).h, B.epochOf(await B.sync(cid)), await B.holds(cid, 2)], [true, fp(S1, cid), 2, true], 'Bob\'s page: her new code not accepted, the old fingerprint on record, and the key Xena made after the removal');
    // the lost device and the server: a wrap of S1 for Bob first in akeys
    let c = await B.sync(cid); const p = { ...c, akeys: { [LBL]: await B.wrapTo(S1, B.id.ecdh, B.wrapSalt(cid + '#a', undefined, 'bob')), ...c.akeys } };
    B.S.chatDocs.set(cid, p); const v = await B.verifiedAdmin(p);
    await assert.rejects(B.createInvite(cid), (e) => !!e && e.message === 'badkey', 'Bob\'s page makes no link: Xena\'s key change isn\'t checked yet');
    c = await B.freshChan(cid);
    assert.deepEqual([v, await leakOf(B, S1, c)], [null, {}], 'Bob\'s page trusts none, and nothing leaks');
    await B.S.acceptKey('alice'); await read(B, cid);
    assert.ok(sameKey(await B.verifiedAdmin(await B.sync(cid)), S2), 'after his Accept: the removal\'s');
    c = await B.sync(cid); B.S.chatDocs.set(cid, { ...c, akeys: { [LBL]: await B.wrapTo(S1, B.id.ecdh, B.wrapSalt(cid + '#a', undefined, 'bob')), ...c.akeys } });
    const i = await B.createInvite(cid); c = await B.freshChan(cid);
    assert.deepEqual([await leakOf(B, S1, c), b64u(await B.openAs(S2, cid, i.iid, c.invites[i.iid].as))], [{}, i.secret], 'and his link: its `as` under it, nothing under the old');
  });
});

// ---- a lost owner device's list at her record's rt plus one ----

// The lost device's own copy of the owner's part, as channel-history-admin4.test.js makes it: sealed under epoch e's key, signed
// with the account key it still holds.
async function lostCopy(sigPriv, cid, e, raw, x) {
  const sk = await crypto.subtle.importKey('jwk', sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const parts = [cid, String(e), String(x.rt), x.owner, [...x.admins].sort().join(','), x.ah, String(x.at)];
  const rs = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from('hush-roles-v1|' + parts.join('|')))).toString('base64');
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(JSON.stringify({ ...x, rs })))).toString('base64') };
}
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; await X.leaveChat(cid); };
// B (naming `before` as the key before) and the server plant the next epoch for X: X's check of it (sealKey), 'badkey' or 'taken'
// (channel-history-roles.test.js).
async function plantedBy(B, X, cid, before) {
  const cur = await X.sync(cid), e = X.epochOf(cur) + 1, Kp = randomBytes(32), row = await B.chainRow(cid, e, Kp, before);
  await X.loadDir([X.handle], true);
  const planted = { ...cur, epoch: e, keys: { ...cur.keys, [e]: await X.wrapAll(Kp, [X.handle], cid, e) } }, doc = X.S.db.doc;
  X.S.db.doc = (p) => (p === 'channels/' + cid + '/chain/' + e ? { get: async () => ({ exists: true, data: () => row }) } : doc(p));
  X.S.chanKeys.clear();
  try { const k = await X.sealKey(planted, e); return k && sameKey(k.raw, Kp) ? 'taken' : 'other'; } catch (x) { return x.message; } finally { X.S.db.doc = doc; }
}

test('77. a lost owner device, before its removal, signs her list at her record\'s rt plus one (ahead of no clock), which the server shows the admins and keeps from her devices: her removal\'s copy, at her record\'s rt under her new key, narrows Bob\'s record at once (the same list, so only the key it counts under moves and the removal\'s secret is taken; the lost device\'s rt stays); after Accept, Xena leaves and the owner\'s page signs the list without her at that same rt plus one (Member cards), naming the secret it replaced first: Bob\'s page takes the drop and keeps a trusted secret, so Xena is no admin there and a key change she makes after leaving is refused, as on the owner\'s page', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), X = await w.page('xena', { build: acceptBuild }); await w.page('fay');
    await makeChannel(A, cid, ['alice', 'bob', 'xena', 'fay'], ['bob', 'xena']);
    for (const P of [B, X]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, X]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, o1 = await plainOf(A, cid, m1), St = new Uint8Array(randomBytes(32));
    const x = { name: o1.name, desc: o1.desc, photo: o1.photo, owner: 'alice', admins: o1.admins, rt: o1.rt + 1, ah: fp(St, cid), at: 1 };
    await A.S.db.doc('channels/' + cid).update({ ometa: await lostCopy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), x) });
    for (const P of [B, X]) await read(P, cid);
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob', 'xena'], members: ['alice', 'bob', 'xena', 'fay'] }])).rotated, [{ cid, ok: true }]);
    for (const P of [B, X]) { await P.loadDir(['alice'], true); await P.S.acceptKey('alice'); await read(P, cid); }
    await read(A, cid);
    const S2 = keyOf(A, cid, 'a');
    assert.deepEqual([A.rolesOf(cid).t, B.rolesOf(cid).t, B.rolesOf(cid).a, B.rolesOf(cid).h, B.rolesOf(cid).hk === A.S.me.sig.x, B.rolesOf(cid).n], [o1.rt, o1.rt + 1, ['bob', 'xena'], fp(S2, cid), true, 1], 'the removal\'s copy, at her record\'s rt, narrows Bob\'s record: the lost device\'s rt and the same list stay, the key it counts under moves, the removal\'s secret is taken, the mark is set');
    await leave(X, cid); await A.run(cid);
    const o2 = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([o2.rt, o2.admins, o2.ah], [o1.rt + 1, ['bob'], fp(keyOf(A, cid, 'a'), cid)], 'her page drops Xena at its record\'s rt plus one, naming the secret it replaced first');
    await read(B, cid);
    assert.deepEqual([B.rolesOf(cid).a, B.rolesOf(cid).h, sameKey(await B.verifiedAdmin(await B.sync(cid)), keyOf(A, cid, 'a'))], [['bob'], o2.ah, true], 'Bob\'s page: her list and secret, under her new key, over the lost device\'s at that rt');
    const before = keyOf(B, cid, B.epochOf(await B.sync(cid)));
    assert.deepEqual([await plantedBy(X, B, cid, before), await plantedBy(X, A, cid, before)], ['badkey', 'badkey'], 'a key change Xena makes after leaving: refused on Bob\'s page, as on hers');
  });
});

test('78. two of the owner\'s devices across her key change: her phone drops Xena, who left, at her record\'s rt plus one under her old key, and Bob\'s page takes it; Xena joins again through a link; her iPad, which missed that drop, removes a lost device and then drops Yan, who left, at that same rt plus one under her new key, naming Xena and a fresh admin secret wrapped to her: Bob\'s page keeps only the admins in both lists and trusts no admin secret, so his link has no `as` under it and a key change Xena makes is refused; her phone, under her new key, likewise', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), A2 = await w.page('alice', { owner: true, id: A.id });
    const B = await w.page('bob', { build: acceptBuild }), X = await w.page('xena', { build: acceptBuild }), Y = await w.page('yan');
    await makeChannel(A, cid, ['alice', 'bob', 'xena', 'yan'], ['bob', 'xena', 'yan']);
    for (const P of [B, X, Y]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, A2, B, X, Y]) await read(P, cid);
    const R = (await plainOf(A, cid, (await A.sync(cid)).ometa)).rt;
    await leave(X, cid); await A.run(cid); await read(B, cid);
    assert.deepEqual([B.rolesOf(cid).t, B.rolesOf(cid).a], [R + 1, ['bob', 'yan']], 'her phone\'s list without Xena, on Bob\'s page');
    await X.joinPrivate(cid, await linkOf(B, cid)); await B.run(cid);
    const members = (await A.meta(cid)).members;
    await newKeys(A2);
    assert.deepEqual((await removal(A2, [{ cid, owner: true, admins: ['bob', 'xena', 'yan'], members }])).rotated, [{ cid, ok: true }]);
    for (const P of [B, X]) { await P.loadDir(['alice'], true); await P.S.acceptKey('alice'); await read(P, cid); }
    await leave(Y, cid); await A2.run(cid);
    const o = await plainOf(A2, cid, (await A2.sync(cid)).ometa), S3 = keyOf(A2, cid, 'a');
    assert.deepEqual([o.rt, o.admins, o.ah, sameKey(await X.adminSecret(await X.sync(cid)), S3)], [R + 1, ['bob', 'xena'], fp(S3, cid), true], 'her iPad drops Yan at its record\'s rt plus one, naming Xena and a secret she holds');
    await read(B, cid);
    assert.deepEqual([B.rolesOf(cid).a, B.rolesOf(cid).h, await B.verifiedAdmin(await B.sync(cid))], [['bob'], undefined, null], 'Bob\'s page: the admins in both lists, no admin secret trusted');
    const i = await B.createInvite(cid), c = await B.freshChan(cid);
    assert.deepEqual([c.invites[i.iid].as, await leakOf(B, S3, c)], [undefined, {}], 'his link has no `as`');
    assert.equal(await plantedBy(X, B, cid, keyOf(B, cid, B.epochOf(c))), 'badkey', 'a key change Xena makes: refused on Bob\'s page');
    A.S.me = { ...A2.S.me }; A.S.keys.clear(); A.S.chanKeys.clear();   // her phone, under her new key as her other devices get it
    const sk = await crypto.subtle.importKey('jwk', A.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    await A.S.db.prove(null); await A.S.db.prove({ h: 'alice', pub: A.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
    await read(A, cid);
    assert.deepEqual([A.rolesOf(cid).a, A.rolesOf(cid).h], [['bob'], undefined], 'her phone: likewise');
  });
});
