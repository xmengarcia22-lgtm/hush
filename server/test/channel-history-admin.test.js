// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.3 `ometa` and `invites`, 5.6 "Key
// chain"; release 92 fix round 3). Anyone holding a device's public key can make a wrap that opens for it, so a server can slip
// a secret of its own into `akeys`. The owner signs the admin secret's fingerprint `ah` with the admin list; a page seals a
// link's secret under the admin secret, or trusts an `as`, only when it is the one its signed roles record names. With none
// (a channel from before release 92, a list that didn't land, a swapped wrap) nothing is sealed or trusted: a link has no `as`,
// joins as before, stops at the next leave, and its joiners wait. The owner's page makes a fresh secret and signs it when it
// opens such a channel. The page harness is channel-history-kit.js.
// This file holds tests 54 to 56 (the server's own admin secret, and a channel made by a release-92 page); tests 57 to 59 (a channel
// with no signed fingerprint) are in channel-history-admin2.test.js, tests 60 to 63, 76 and 77 (the secret the owner's page replaces by
// itself) in channel-history-admin3.test.js, and tests 70 to 75 (a list a lost owner device signed before its removal; two accounts on one
// page) in channel-history-admin4.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, linkOf } from './channel-history-kit.js';

// `ah` as SPEC.md 5.6 has it: HKDF-SHA-256 of the admin secret, salt "hush-admin-id-v1", info the channel id, 32 bytes, base64url.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));
// `m` as SPEC.md 5.6 has it (channel-history-cards.test.js).
const mac = (secret, cid, iid, f) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'base64url'), 'hush-join-mac-v1', [cid, iid, f].join('|'), 32)));
// Helpers shared with the other channel-history files, copied as the removal tests do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
async function plainOf(X, cid, m) {   // the plaintext of a channel's ometa, opened with the key X holds for its epoch
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}

// ---- the server's own admin secret ----

const LBL = 'x'.repeat(22);
// A secret S of the server's, wrapped to X's account key from public data alone: akeys with it first (keep: X's real ones after it).
async function plant(X, cid, rec, keep) {
  const S = new Uint8Array(randomBytes(32)), w = await X.wrapTo(S, X.id.ecdh, X.wrapSalt(cid + '#a', undefined, X.handle));
  return { S, akeys: { [LBL]: w, ...(keep ? rec.akeys : {}) } };
}
// What the server learns with S from a record: each link whose `as` S opens, and the keys its packet holds.
async function leakOf(X, S, c) {
  const out = {};
  for (const [iid, x] of Object.entries(c.invites || {})) { const s = x && x.as && await X.openAs(S, c.id, iid, x.as); if (!s) continue;
    try { out[iid] = JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: X.unb64(x.iv) }, await X.inviteKey(s, c.id, iid), X.unb64(x.ct))).toString()); } catch { out[iid] = 'its secret'; } }
  return out;
}

test('54. the server slips a wrap of its own admin secret into the owner\'s akeys (anyone can make one from public keys): it still gives the server\'s admin key a try but is never kept; Invite via link seals the link\'s secret under none the server knows (no `as` with that wrap alone, the signed secret\'s with the owner\'s wrap after it), and the link joins as before; opening the channel with that wrap alone makes no new secret (a fingerprint is signed, and the wrap isn\'t this device\'s own change) and seals no `as` for a link from before release 92, which gets one under the signed secret once the record\'s own akeys are served again; the server opens no link', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), D = await w.page('dave');
    await makeChannel(A, cid, ['alice']);
    const real = keyOf(A, cid, 'a'); let c = await A.sync(cid); await read(A, cid);
    const p1 = await plant(A, cid, c);
    A.S.chatDocs.set(cid, { ...c, akeys: p1.akeys });   // the record as the server delivers it
    assert.ok(sameKey(await A.adminSecret(A.S.chatDocs.get(cid)), p1.S), 'the wrap opens, for the server\'s admin key');
    assert.ok(sameKey(keyOf(A, cid, 'a'), real), 'but the kept secret is still the signed one');
    const i1 = await A.createInvite(cid);
    c = await A.freshChan(cid);
    assert.deepEqual([c.invites[i1.iid].as, await leakOf(A, p1.S, c)], [undefined, {}], 'with the wrap alone: a link with no `as`');
    await D.joinPrivate(cid, { cid, iid: i1.iid, secret: i1.secret });
    assert.equal(await D.holds(cid, 0), true, 'that joins as before');
    c = await A.sync(cid); const p2 = await plant(A, cid, c, true);
    A.S.chatDocs.set(cid, { ...c, akeys: p2.akeys });
    const i2 = await A.createInvite(cid); c = await A.freshChan(cid);
    assert.equal(b64u(await A.openAs(real, cid, i2.iid, c.invites[i2.iid].as)), i2.secret, 'with the owner\'s wrap after it: the signed secret seals it');
    assert.deepEqual(await leakOf(A, p2.S, c), {}, 'and the server opens nothing');
    // a link from before release 92 (no `as`) this device shows; the owner opens the channel with the server's wrap alone
    await A.S.db.doc('channels/' + cid).update({ invites: { [i2.iid]: { as: null } } }); A.ls.set('hush:inv:' + cid, i2);
    c = await A.sync(cid); const p3 = await plant(A, cid, c);
    A.S.chatDocs.set(cid, { ...c, akeys: p3.akeys }); A.spy.admins.length = 0;
    await A.rollRun(A.S.chatDocs.get(cid));
    c = await A.sync(cid); const o = await plainOf(A, cid, c.ometa);
    assert.deepEqual([A.spy.admins.length, o.ah === fp(real, cid), sameKey(keyOf(A, cid, 'a'), real), c.invites[i2.iid].as], [0, true, true, undefined], 'no new secret, the signed one still kept, no `as` sealed');
    assert.deepEqual(await leakOf(A, p3.S, c), {}, 'the server opens no link');
    await A.run(cid); c = await A.sync(cid);
    assert.deepEqual([A.spy.admins.length, b64u(await A.openAs(real, cid, i2.iid, c.invites[i2.iid].as))], [0, i2.secret], 'served the record\'s own akeys again: the old link\'s `as` under the signed secret');
  });
});

test('55. on an admin\'s page, a wrap the server slipped into akeys: a link it adds with an `as` under its own secret is not shown (keptLink), carried across a leave (carryLinks) or vouched for (readRoll: its joiner waits); with that wrap alone nothing is (fail closed), Invite via link makes a link with no `as` and opening the channel seals none for it; with the owner\'s wrap there too, only the signed secret counts (for the server\'s admin key too); the owner\'s Make admin on a page served that wrap alone seals no `as` it opens with it again under the new secret', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), Z = await w.page('zed');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']);
    await read(B, cid);
    const l1 = await linkOf(B, cid), c0 = await B.sync(cid), p = await plant(B, cid, c0, true);
    assert.equal(typeof c0.invites[l1.iid].as, 'string', 'Bob\'s own link carries `as`');
    // the server's own link, the newest: an `as` under its secret, a packet under that link's secret
    const sS = randomBytes(16), iS = 'srv' + randomBytes(5).toString('hex').slice(0, 9), iv = randomBytes(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await B.inviteKey(sS, cid, iS), Buffer.from('{}')));
    const fake = { ...c0, akeys: p.akeys, invites: { ...c0.invites, [iS]: { iv: B.b64(iv), ct: B.b64(ct), ph: 'f'.repeat(64), ts: Date.now() + 60e3, as: await B.sealAs(p.S, cid, iS, sS) } } };
    // Zed, holding the key from elsewhere, writes a join card through the server's link
    Z.ksPut(cid, 0, B.ksGet(cid, 0)); await Z.writeCard(await Z.sync(cid), 'join', iS, mac(b64u(sS), cid, iS, 'zed'));
    const v = B.metaOf(await B.showMeta(fake)), rnd = new Uint8Array(randomBytes(32)), real = keyOf(A, cid, 'a');
    assert.ok(sameKey(await B.adminSecret(fake), real), 'the server\'s admin key from the signed secret, though the server\'s wrap comes first');
    B.ls.set('hush:inv:' + cid, null);
    assert.equal((await B.keptLink(fake) || {}).iid, l1.iid, 'the invite sheet shows Bob\'s link, not the server\'s');
    let r = await B.readRoll(fake, v);
    assert.deepEqual([r.join.map((x) => x.f), r.wait.map((x) => x.f)], [[], ['zed']], 'Zed waits');
    assert.deepEqual(Object.keys(await B.carryLinks(fake, 1, rnd)), [l1.iid], 'a leave carries Bob\'s link alone');
    const alone = { ...fake, akeys: { [LBL]: p.akeys[LBL] } };
    B.ls.set('hush:inv:' + cid, null);
    assert.equal(await B.keptLink(alone), null, 'with the server\'s wrap alone: no link shown');
    r = await B.readRoll(alone, v);
    assert.deepEqual([r.join.map((x) => x.f), r.wait.map((x) => x.f)], [[], ['zed']], 'none vouched for');
    assert.deepEqual(await B.carryLinks(alone, 1, rnd), {}, 'none carried');
    B.S.chatDocs.set(cid, alone);
    const i3 = await B.createInvite(cid);
    let c = await B.freshChan(cid);
    assert.deepEqual([c.invites[i3.iid].as, await leakOf(B, p.S, c)], [undefined, {}], 'Invite via link: no `as`');
    B.S.chatDocs.set(cid, { ...c, akeys: alone.akeys }); B.spy.admins.length = 0;
    await B.rollRun(B.S.chatDocs.get(cid));
    c = await B.freshChan(cid);
    assert.deepEqual([c.invites[i3.iid].as, B.spy.admins.length, await leakOf(B, p.S, c)], [undefined, 0, {}], 'opening the channel seals none for it');
    // the owner's Make admin on a page served the server's wrap alone, its link in the record: no `as` opened with that wrap is sealed again under the new secret
    await A.S.db.doc('channels/' + cid).update({ invites: { [iS]: fake.invites[iS] } });
    c = await A.sync(cid); await read(A, cid);
    A.S.chatDocs.set(cid, { ...c, akeys: { [LBL]: await A.wrapTo(p.S, A.id.ecdh, A.wrapSalt(cid + '#a', undefined, 'alice')) } });
    await A.setAdmins(cid, ['bob']);
    await read(B, cid); c = await B.sync(cid); B.ls.set('hush:inv:' + cid, null);
    assert.deepEqual([await B.keptLink(c), (await B.readRoll(c, B.metaOf(await B.showMeta(c)))).join, await leakOf(B, keyOf(A, cid, 'a'), c)], [null, [], {}], 'the server\'s link is not taken in under the signed secret');
  });
});

test('56. a channel made by a release-92 page signs its admin secret\'s fingerprint at once, and every owner change of the secret ends with a signed list naming the new one: the owner\'s first link carries `as`, Make admin seals it again under the new secret, an admin\'s page vouches for its joiner and lists them, a leave carries the link and keeps them, Remove admin moves the fingerprint and stops the links; a group\'s ometa names none and its admin change writes no ometa', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), F = await w.page('fay'), D = await w.page('dave'), G = await w.page('gina');
    await A.createChatDoc(cid, 'channel', 'private', { name: 'New', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice', 'bob', 'fay'], banned: [] });
    const s0 = keyOf(A, cid, 'a'), l0 = await A.createInvite(cid);
    let c = await A.sync(cid), o = await plainOf(A, cid, c.ometa);
    const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: A.id.sig.x, y: A.id.sig.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    assert.equal(o.ah, fp(s0, cid), 'created naming the admin secret\'s fingerprint');
    assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(o.rs, 'base64'), Buffer.from(`hush-roles-v1|${cid}|0|${o.rt}|alice||${o.ah}|${o.at}`)), true, 'signed by the owner over hush-roles-v1|cid|e|rt|owner|admins|ah|at');
    assert.ok(Number.isFinite(o.at) && Math.abs(o.at - Date.now()) < 60e3, 'at: when the owner named it');
    assert.equal(b64u(await A.openAs(s0, cid, l0.iid, c.invites[l0.iid].as)), l0.secret, 'the link made at once carries `as`');
    await A.setAdmins(cid, ['bob']);
    const s1 = keyOf(A, cid, 'a'); c = await A.sync(cid); o = await plainOf(A, cid, c.ometa);
    assert.deepEqual([o.admins, o.ah, sameKey(s1, s0)], [['bob'], fp(s1, cid), false], 'Make admin: the new secret\'s fingerprint, signed with the list');
    assert.equal(b64u(await A.openAs(s1, cid, l0.iid, c.invites[l0.iid].as)), l0.secret, 'and the link\'s `as` sealed again under it');
    await read(B, cid);
    assert.ok(sameKey(await B.adminSecret(await B.sync(cid)), s1), 'Bob\'s page opens it');
    await D.joinPrivate(cid, { cid, iid: l0.iid, secret: l0.secret });
    await B.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'fay', 'dave'], 'Bob\'s page vouches for Dave and lists him');
    await leave(F, cid); await B.run(cid);
    c = await B.sync(cid);
    assert.deepEqual([c.epoch, Object.keys(c.invites), (await A.meta(cid)).members, await D.holds(cid, 1)], [1, [l0.iid], ['alice', 'bob', 'dave'], true], 'the leave carried the link and kept Dave');
    const rt1 = o.rt; c = await A.sync(cid); await A.adoptOMeta(c, await A.showMeta(c));
    o = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([(await A.sync(cid)).ometa.e, o.rt, o.ah], [1, rt1, fp(s1, cid)], 'the owner\'s page seals the list again under the new key with the same fingerprint');
    await G.joinPrivate(cid, { cid, iid: l0.iid, secret: l0.secret }); await B.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'dave', 'gina'], 'its next joiner is listed by Bob\'s page');
    await A.setAdmins(cid, []);
    const s2 = keyOf(A, cid, 'a'); c = await A.sync(cid); o = await plainOf(A, cid, c.ometa);
    assert.deepEqual([o.admins, o.ah, sameKey(s2, s1), Object.keys(c.invites || {})], [[], fp(s2, cid), false, []], 'Remove admin: a new fingerprint, the links stopped');
    await read(B, cid);
    assert.equal(await B.keptLink(await B.sync(cid)), null, 'Bob\'s page holds no admin secret any more');
    const g = 'g' + cid.slice(1);   // a group is made at a group's address (release 107)
    await A.createChatDoc(g, 'group', 'private', { name: 'G', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice', 'bob'], banned: [] });
    assert.equal('ah' in await plainOf(A, g, (await A.sync(g)).ometa), false, 'a group\'s ometa names no fingerprint');
    A.spy.updates.length = 0; await A.rotateAdmins(g, ['bob']);
    assert.equal(A.spy.updates.flat().includes('ometa'), false, 'and its admin change writes no ometa');
  });
});
