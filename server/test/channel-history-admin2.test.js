// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.3 `ometa` and `invites`, 5.6 "Key
// chain"; release 92 fix round 3), second part; the first is channel-history-admin.test.js. A channel from before release 92, one
// whose signed list was lost, and one whose roles record is unsigned have no fingerprint a page trusts: no `as` is sealed or
// trusted, links join as before and their joiners wait, and the owner's page signs a fresh secret when it opens the channel.
// The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, offline, world, makeChannel, linkOf } from './channel-history-kit.js';

// `ah` as SPEC.md 5.6 has it: HKDF-SHA-256 of the admin secret, salt "hush-admin-id-v1", info the channel id, 32 bytes, base64url.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));
// Helpers shared with channel-history-admin.test.js and the other channel-history files, copied as the removal tests do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const roll = async (A, cid, all) => { const c = await A.sync(cid); return A.readRoll(c, A.metaOf(await A.showMeta(c)), all); };
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
async function bareMeta(e, raw, x, ad) {   // an ometa as a page from before release 92 sealed it: no rs, no ah
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(ad) }, key, Buffer.from(JSON.stringify(x)))).toString('base64') };
}
async function plainOf(X, cid, m) {   // the plaintext of a channel's ometa, opened with the key X holds for its epoch
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}
const pre92 = async (A, cid, admins, more) => A.S.db.doc('channels/' + cid).update({ ometa: await bareMeta(0, keyOf(A, cid, 0), { name: 'History', desc: '', photo: null, owner: A.handle, admins, ...more }, 'hush-ometa-v1|' + cid) });
// Save pressed in X's Edit sheet (openEditConv), the record being X's copy of it: the sheet's error line ('' once saved). The owner's manual step (owner decision D1).
async function editSave(X, cid, name) {
  X.S.convs = [{ ...(await X.showMeta(X.S.chatDocs.get(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); return at((e) => e.cls === 'err').textContent;
}

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

test('57. a channel from before release 92 (an unsigned ometa; the server\'s copy names a fingerprint, which no page keeps or signs): no page trusts an `as` under its admin secret, and while the record is unsigned the owner\'s page seals nothing again and makes no secret (owner decision D1); once she has saved the list by hand (Edit, then Save: signed at a fresh rt, no fingerprint), her next open makes a fresh admin secret, wrapped to the owner and the admins, and signs its fingerprint at her record\'s rt, past a wrap the server slipped in beforehand; in that run her link from before release 92 gets an `as` under it and its joiner is listed; an admin\'s page then vouches for it, and the next open makes no other secret', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), D = await w.page('dave'), E = await w.page('erin');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']);
    const old = keyOf(A, cid, 'a');
    await pre92(A, cid, ['bob'], { ah: fp(old, cid) });   // unsigned, naming a fingerprint: only a server makes such a copy
    // her link from before release 92 (no `as`, its secret kept on her device), and Bob's, which the server gave an `as` under the old secret
    const l0 = await linkOf(A, cid); await A.S.db.doc('channels/' + cid).update({ invites: { [l0.iid]: { as: null } } }); A.ls.set('hush:inv:' + cid, { iid: l0.iid, secret: l0.secret, h: 'alice' });
    const lb = await linkOf(B, cid); await A.S.db.doc('channels/' + cid).update({ invites: { [lb.iid]: { as: await A.sealAs(old, cid, lb.iid, new Uint8Array(Buffer.from(lb.secret, 'base64url'))) } } });
    await D.joinPrivate(cid, lb); await E.joinPrivate(cid, l0);
    await read(A, cid); assert.deepEqual([A.rolesOf(cid).s, A.rolesOf(cid).h], [0, undefined], 'the owner\'s page keeps no fingerprint from it');
    let c = await A.sync(cid); A.spy.admins.length = 0; await A.adoptOMeta(c, await A.showMeta(c)); await A.run(cid);
    assert.deepEqual([A.spy.admins.length, (await A.sync(cid)).ometa.iv === c.ometa.iv, A.rolesOf(cid).s], [0, true, 0], 'unsigned: her page seals nothing again and makes no secret');
    assert.equal(await editSave(A, cid, 'History'), '', 'the owner saves the list by hand');
    let o = await plainOf(A, cid, (await A.sync(cid)).ometa); const rt = o.rt;
    assert.deepEqual([rt > 1, typeof o.rs, 'ah' in o], [true, 'string', false], 'signed at a fresh rt, no fingerprint');
    await read(B, cid);
    assert.deepEqual([B.rolesOf(cid).s, B.rolesOf(cid).h, (await roll(B, cid)).wait.map((x) => x.f).sort()], [1, undefined, ['dave', 'erin']], 'Bob\'s page keeps no fingerprint and trusts no `as`: both wait');
    c = await A.sync(cid); const p = await plant(A, cid, c, true);
    A.S.chatDocs.set(cid, { ...c, akeys: p.akeys });   // slipped in before the owner's page opens it
    A.spy.admins.length = 0; await A.rollRun(A.S.chatDocs.get(cid));
    c = await A.sync(cid); o = await plainOf(A, cid, c.ometa);
    const now = keyOf(A, cid, 'a');
    assert.deepEqual([A.spy.admins.length, o.ah, o.admins, o.rt, sameKey(now, p.S), sameKey(now, old)], [1, fp(now, cid), ['bob'], rt, false, false], 'a fresh admin secret, its fingerprint signed with the list at the record\'s own rt');
    assert.equal(b64u(await A.openAs(now, cid, l0.iid, c.invites[l0.iid].as)), l0.secret, 'her old link gets an `as` under it');
    assert.deepEqual([await leakOf(A, p.S, c), (await A.meta(cid)).members], [{}, ['alice', 'bob', 'erin']], 'the server opens nothing; Erin listed in that run, Dave not');
    await read(B, cid);
    assert.ok(sameKey(await B.adminSecret(await B.sync(cid)), now), 'Bob\'s page opens the fresh secret');
    assert.deepEqual([(await roll(B, cid, true)).join.map((x) => x.f), (await roll(B, cid)).wait.map((x) => x.f)], [['erin'], ['dave']], 'and vouches for Erin only');
    await A.run(cid);
    assert.equal(A.spy.admins.length, 1, 'the next open makes no other secret');
  });
});

test('58. the owner\'s change of the admin secret whose signed list is lost (the akeys written): every page refuses the new secret, so an admin\'s link has no `as` and none is shown or vouched for, and a leave carries no link; that device\'s next open, its own last secret still in akeys, makes another and signs it (not from an ometa it can\'t open), after which links carry `as` again; an admin change from a copy older than the record writes no list; an owner device no wrap opens for (one added since) makes none', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), F = await w.page('fay'), D = await w.page('dave');
    await makeChannel(A, cid, ['alice', 'bob', 'fay'], ['bob']);
    await read(A, cid); await read(B, cid);
    const l1 = await linkOf(B, cid), doc = A.S.db.doc, first = (await A.sync(cid)).ometa; let lose = 1;
    assert.equal(typeof (await B.sync(cid)).invites[l1.iid].as, 'string');
    A.S.db.doc = (p) => { const d = doc(p), u = d.update; d.update = (v) => (lose && v && v.ometa ? (lose--, Promise.reject(offline())) : u(v)); return d; };
    await assert.rejects(A.rotateAdmins(cid, ['bob']), (e) => e && e.code === 'offline', 'the list naming the new secret doesn\'t land');
    A.S.db.doc = doc;
    await read(B, cid);
    const l2 = await linkOf(B, cid);
    B.ls.set('hush:inv:' + cid, null);
    assert.deepEqual([(await B.sync(cid)).invites[l2.iid].as, await B.keptLink(await B.sync(cid))], [undefined, null], 'Bob\'s link has no `as`, and none is shown');
    await D.joinPrivate(cid, l1);
    assert.deepEqual((await roll(B, cid)).wait.map((x) => x.f), ['dave'], 'Dave waits');
    await leave(F, cid); await B.run(cid);
    let c = await B.sync(cid);
    assert.deepEqual([c.epoch, Object.keys(c.invites || {})], [1, []], 'the leave carries no link');
    c = await A.sync(cid); A.S.chatDocs.set(cid, { ...c, ometa: { e: c.ometa.e, iv: A.b64(randomBytes(12)), ct: A.b64(randomBytes(64)) } });
    A.spy.admins.length = 0; await A.rollRun(A.S.chatDocs.get(cid));
    assert.equal(A.spy.admins.length, 0, 'served an ometa it can\'t open, the owner\'s page makes no new secret');
    await A.run(cid);
    c = await A.sync(cid); const o = await plainOf(A, cid, c.ometa);
    assert.deepEqual([A.spy.admins.length, o.ah], [1, fp(keyOf(A, cid, 'a'), cid)], 'the owner\'s open: another secret, signed');
    await read(B, cid);
    const l3 = await linkOf(B, cid);
    assert.equal(b64u(await B.openAs(keyOf(A, cid, 'a'), cid, l3.iid, (await B.sync(cid)).invites[l3.iid].as)), l3.secret, 'Bob\'s next link carries `as` again');
    // served a signed ometa older than its record (from before the change), an admin change of the owner's signs no list from it
    c = await A.sync(cid); A.S.chatDocs.set(cid, { ...c, ometa: first }); A.spy.updates.length = 0;
    await assert.rejects(A.rotateAdmins(cid, ['bob']), (e) => e && e.message === 'nokey', 'refused');
    assert.equal(A.spy.updates.flat().includes('ometa'), false, 'served an older ometa, the owner\'s admin change writes no list');
    A.spy.admins.length = 0; await A.run(cid);
    assert.equal(A.spy.admins.length, 1, 'the next open, with the record\'s own copy, makes another');
    // an owner device no admin wrap opens for at all (one added since): nothing to replace from there, so no new secret
    c = await A.sync(cid); const wB = await B.wrapTo(new Uint8Array(randomBytes(32)), B.id.ecdh, B.wrapSalt(cid + '#a', undefined, 'bob'));
    A.S.chatDocs.set(cid, { ...c, akeys: { [LBL]: wB } }); A.spy.admins.length = 0; await A.rollRun(A.S.chatDocs.get(cid));
    assert.equal(A.spy.admins.length, 0, 'an owner device holding no wrap makes no new secret');
  });
});

test('59. an admin\'s page whose roles record is unsigned (a channel from before release 92 its owner hasn\'t signed yet) makes a link with no `as`: it joins as before, its joiner waits for an admin\'s Add; the next leave is not applied by his page (an unsigned record counts no admin: badkey before anything is written) but by the owner\'s, which stops the link', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), F = await w.page('fay'), D = await w.page('dave');
    await makeChannel(A, cid, ['alice', 'bob', 'fay'], ['bob']);
    await pre92(A, cid, ['bob']); await read(B, cid);
    assert.equal(B.rolesOf(cid).s, 0, 'Bob\'s record is unsigned');
    const l = await linkOf(B, cid);
    assert.equal((await B.sync(cid)).invites[l.iid].as, undefined, 'a link with no `as`');
    await D.joinPrivate(cid, l);
    assert.deepEqual([await D.holds(cid, 0), (await roll(B, cid)).wait.map((x) => x.f)], [true, ['dave']], 'it joins; Dave waits');
    await leave(F, cid); assert.equal(await B.run(cid), null, 'his page refuses the key change (badkey): null, so the start\'s pass pauses a second and moves on, not false, a failure that backs off 2, 5, 15 and 30 s (release 93b, item 8)');
    let c = await B.sync(cid);
    assert.deepEqual([c.epoch, Object.keys(c.invites || {}), B.spy.rotate], [0, [l.iid], []], 'nothing written: the key and the link as they were');
    await A.run(cid); c = await B.sync(cid);
    assert.deepEqual([c.epoch, Object.keys(c.invites || {}), await D.holds(cid, 1)], [1, [], false], 'the owner\'s page applies the leave and stops the link; Dave holds no new key');
  });
});
