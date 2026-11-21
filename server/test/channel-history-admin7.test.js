// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.6 "Key chain"; release 92 fix round 3),
// seventh part; the first is channel-history-admin.test.js. A second tab of hers that still holds her old key after a device
// removal notes no copy of her own list into the roles record the tabs share. On her page, a copy of her list from another device
// of hers whose clock is past the date limit holds her owner changes until it is noted, so none of them is undone by it.
// This file holds tests 88 and 89; 83 to 86 are in channel-history-admin6.test.js, 91 and 92 in channel-history-admin8.test.js.
// The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, lift, mkBuild, pageFor } from './channel-history-kit.js';

const LIMIT = 5 * 60e3;   // the date limit (SPEC.md 5.6 "The date limit")
// `ah` as SPEC.md 5.6 has it: HKDF-SHA-256 of the admin secret, salt "hush-admin-id-v1", info the channel id, 32 bytes, base64url.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));
// Helpers shared with channel-history-admin6.test.js and the other channel-history files, copied as the removal tests do.
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
// B and the server plant the next epoch for X: X's check of it (sealKey), 'badkey' or 'taken' (channel-history-admin5.test.js);
// the planted key is forgotten after, so X can be asked again.
async function plantedBy(B, X, cid) {
  const cur = await X.sync(cid), e = X.epochOf(cur) + 1, Kp = randomBytes(32), row = await B.chainRow(cid, e, Kp, keyOf(X, cid, X.epochOf(cur)));
  await X.loadDir([X.handle], true);
  const planted = { ...cur, epoch: e, keys: { ...cur.keys, [e]: await X.wrapAll(Kp, [X.handle], cid, e) } }, doc = X.S.db.doc;
  X.S.db.doc = (p) => (p === 'channels/' + cid + '/chain/' + e ? { get: async () => ({ exists: true, data: () => row }) } : doc(p));
  X.S.chanKeys.clear();
  try { const k = await X.sealKey(planted, e); return k && sameKey(k.raw, Kp) ? 'taken' : 'other'; } catch (x) { return x.message; } finally { X.S.db.doc = doc; X.ksPut(cid, e, null); X.S.chanKeys.clear(); }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('88. a second tab of hers in the same browser keeps her old key after her first tab removed a lost device (the server keeps showing it her old profile): a list the thief signs with that key after the removal, naming an admin of its own (Mallory), which the server shows that tab, goes into no roles record the tabs share, so her good tab signs nothing of it again under her new key: Fay\'s page refuses Mallory\'s key change and takes Bob\'s', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), F = await w.page('fay', { build: acceptBuild }), M = await w.page('mallory');
    await makeChannel(A, cid, ['alice', 'bob', 'fay'], ['bob']);
    F.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as Fay's page first saw it
    for (const P of [A, B, F]) await read(P, cid);
    const oldId = structuredClone(A.id), A2 = await pageFor(null, 'alice', { id: oldId, store: A.store });   // her second tab: the same store, her old key in memory
    await newKeys(A); A.ls.set('hush:ids', [{ handle: 'alice', sig: A.S.me.sig, kv: A.S.me.kv }]);   // her new key into the store both tabs share, as the removal's keys stage writes it
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members: ['alice', 'bob', 'fay'] }])).rotated, [{ cid, ok: true }]);
    await F.loadDir(['alice'], true); await F.S.acceptKey('alice'); await read(F, cid);
    const o1 = await plainOf(A, cid, (await A.sync(cid)).ometa);
    const x = { name: o1.name, desc: o1.desc, photo: o1.photo, owner: 'alice', admins: ['bob', 'mallory'], rt: Date.now(), ah: fp(new Uint8Array(randomBytes(32)), cid), at: 1 };
    const thief = await lostCopy(oldId.sigPriv, cid, 0, keyOf(A, cid, 0), x);
    await A2.readOMeta({ ...(await A.sync(cid)), ometa: thief }); await A2.rolesQ.get(cid);   // the server shows it to her second tab
    assert.deepEqual([A.rolesOf(cid).a, A.rolesOf(cid).hk === A.S.me.sig.x], [['bob'], true], 'the record both tabs share: as her removal left it');
    await A.S.db.doc('channels/' + cid).update({ ometa: thief });   // and to her good tab, whose chat watch runs adoptOMeta
    const c = await A.sync(cid); await A.adoptOMeta(c, await A.showMeta(c)); await A.rolesQ.get(cid);
    assert.equal((await A.sync(cid)).ometa.iv, thief.iv, 'her good tab signs nothing of it again');
    await read(F, cid);
    assert.deepEqual([F.rolesOf(cid).a, await plantedBy(M, F, cid), await plantedBy(B, F, cid)], [['bob'], 'badkey', 'taken'], 'Fay\'s page: Mallory\'s key change refused, Bob\'s taken');
  });
});

test('89. her laptop, whose clock is five minutes and a second and a half fast, drops Xena as admin: her phone, which notes that copy only once its clock has caught up, makes no owner change of its own meanwhile (Make admin Yuri, Remove admin Xena: nokey, nothing written), while sealing her list again goes ahead there; once the copy is noted her phone shows Xena dropped, and its Make admin (Yuri), dated after the laptop\'s, is taken on Fay\'s page, which has noted the laptop\'s copy by then too: Bob and Yuri on both, and Xena\'s key change refused', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), F = await w.page('fay'), X = await w.page('xena'); await w.page('bob'); await w.page('yuri');
    await makeChannel(A, cid, ['alice', 'bob', 'xena', 'yuri', 'fay'], ['bob', 'xena']);
    for (const P of [A, F, X]) await read(P, cid);
    const L = await pageFor(null, 'alice', { id: A.id, clock: { skew: LIMIT + 1500 } });   // her laptop: the same account key, a fast clock
    L.ksPut(cid, 0, A.ksGet(cid, 0));
    await A.S.db.doc('channels/' + cid).update({ ometa: await L.sealOMeta(cid, 0, keyOf(A, cid, 0), { name: 'History', owner: 'alice', admins: ['bob'], _ah: fp(keyOf(A, cid, 'a'), cid) }) });   // the laptop: Remove admin Xena
    for (const P of [A, F]) await read(P, cid);
    assert.deepEqual([A.rolesOf(cid).a, F.rolesOf(cid).a], [['bob', 'xena'], ['bob', 'xena']], 'not noted at once on her phone nor on Fay\'s page');
    const [c, s] = await A.chatAnd(cid), n = [A.spy.admins.length, A.spy.chain.length, A.spy.updates.length];
    await assert.rejects(A.setAdmins(cid, ['bob', 'xena', 'yuri']), /nokey/, 'her phone: Make admin Yuri waits');
    await assert.rejects(A.setAdmins(cid, ['bob']), /nokey/, 'and Remove admin Xena');
    assert.deepEqual([A.spy.admins.length, A.spy.chain.length, A.spy.updates.length], n, 'nothing written');
    await assert.rejects(A.sealOMetaFor(c, s), /nokey/, 'no copy of her list dated by this clock');
    assert.ok(await A.sealOMetaFor(c, s, true), 'sealing her list again (a key change, a device removal, an adm card) goes ahead');
    await wait(3500); for (const P of [A, F]) await P.rolesQ.get(cid);
    assert.deepEqual([(await A.shown(cid)).admins, F.rolesOf(cid).a], [['bob'], ['bob']], 'noted by itself on both');
    await A.setAdmins(cid, ['bob', 'yuri']); await read(F, cid);
    assert.deepEqual([A.rolesOf(cid).a, F.rolesOf(cid).a, await plantedBy(X, F, cid)], [['bob', 'yuri'], ['bob', 'yuri'], 'badkey'], 'her Make admin, dated after the laptop\'s: taken, and Xena\'s key change refused on Fay\'s page');
  });
});
