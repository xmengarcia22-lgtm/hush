// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.6 "Key chain"; release 92 fix round 3),
// fourth part; the first is channel-history-admin.test.js. A lost owner device holds her account key until she removes it, so
// before then it can sign a valid copy of her list naming an admin secret of its own, with `at` or `rt` ahead of hers (within the
// date limit: one dated further ahead no page takes, channel-history-admin5.test.js). A page keeps
// with the fingerprint the owner key that checked it, and trusts it only while that is still her current key: after the removal
// and Accept, her removal's copy under her new key, at her record's rt, narrows the record whatever rt or `at` the lost device chose
// (only the admins in both lists stay, the removal's secret is taken, the rt stays); a page that has seen her key change but not
// accepted it yet trusts none (fail closed). Her own page signs again, and dates a new one after, only a fingerprint its record
// took under her current key. A second account signed in on the same page notes the roles copies again.
// This file holds tests 70 to 75; 76 and 77 are in channel-history-admin3.test.js. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, lift, mkBuild, pageFor } from './channel-history-kit.js';

// `ah` as SPEC.md 5.6 has it: HKDF-SHA-256 of the admin secret, salt "hush-admin-id-v1", info the channel id, 32 bytes, base64url.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));
// Helpers shared with channel-history-admin3.test.js and the other channel-history files, copied as the removal tests do.
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
async function plainOf(X, cid, m) {   // the plaintext of a channel's ometa, opened with the key X holds for its epoch
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}
const LBL = 'x'.repeat(22);
const AHEAD = 30e3;   // a lost copy's lead over her clock: inside the date limit (five minutes), so the pages it reaches take it
// What the server learns with S from a record: each link whose `as` S opens, and the keys its packet holds.
async function leakOf(X, S, c) {
  const out = {};
  for (const [iid, x] of Object.entries(c.invites || {})) { const s = x && x.as && await X.openAs(S, c.id, iid, x.as); if (!s) continue;
    try { out[iid] = JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: X.unb64(x.iv) }, await X.inviteKey(s, c.id, iid), X.unb64(x.ct))).toString()); } catch { out[iid] = 'its secret'; } }
  return out;
}
// The lost device and the server: a wrap of S for X's account first in akeys; the secret X's page then trusts, and the link it
// makes: what S opens of it.
async function linkUnder(X, cid, S) {
  const c = await X.sync(cid), p = { ...c, akeys: { [LBL]: await X.wrapTo(S, X.id.ecdh, X.wrapSalt(cid + '#a', undefined, X.handle)), ...c.akeys } };
  X.S.chatDocs.set(cid, p); const v = await X.verifiedAdmin(p);
  const i = await X.createInvite(cid), f = await X.freshChan(cid);
  return { v, i, as: f.invites[i.iid].as, leak: await leakOf(X, S, f) };
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
// Alice owns the channel, Bob and Xena are admins whose pages pinned her key. Before she removes a lost device of hers, it signs
// her list naming its own secret St (`lost`: its rt and at, and whether her own page is served it too, else the server shows her
// devices only her own copy). Then the removal, under her new key, and Bob's and Xena's pages accept her new code, no reload
// (`waits`: Bob's page loads it but doesn't accept it).
async function lostThenRemoved(w, lost) {
  const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), X = await w.page('xena', { build: acceptBuild }); await w.page('fay');
  await makeChannel(A, cid, ['alice', 'bob', 'xena', 'fay'], ['bob', 'xena']);
  for (const P of [B, X]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
  for (const P of [A, B, X]) await read(P, cid);
  const m1 = (await A.sync(cid)).ometa, o1 = await plainOf(A, cid, m1), St = new Uint8Array(randomBytes(32));
  const x = { name: o1.name, desc: o1.desc, photo: o1.photo, owner: 'alice', admins: o1.admins, rt: lost.rt(o1), ah: fp(St, cid), at: lost.at(o1) };
  await A.S.db.doc('channels/' + cid).update({ ometa: await lostCopy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), x) });
  for (const P of lost.hers ? [A, B, X] : [B, X]) await read(P, cid);
  if (!lost.hers) await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
  assert.deepEqual([A, B, X].map((P) => P.rolesOf(cid).h === fp(St, cid)), [lost.hers, true, true], 'before the removal, every page it reaches takes it: her key signed it');
  await newKeys(A);
  if (lost.ownFails) { const so = A.S.db.setOwner; A.S.db.setOwner = async () => { A.S.db.setOwner = so; throw Object.assign(new Error('timeout'), { code: 'timeout' }); }; }   // the removal's owner step: its owner-key call gets no answer, once
  assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob', 'xena'], members: ['alice', 'bob', 'xena', 'fay'] }])).rotated, [{ cid, ok: true, ...(lost.ownFails ? { own: 'error' } : {}) }]);
  for (const P of [B, X]) { await P.loadDir(['alice'], true); if (!(lost.waits && P === B)) await P.S.acceptKey('alice'); await read(P, cid); }
  await read(A, cid);
  return { cid, A, B, X, St, S2: keyOf(A, cid, 'a') };
}

for (const [n, what, lost] of [
  ['70', '`at` ahead of hers, served to every page, hers included', { rt: (o) => o.rt, at: () => Date.now() + AHEAD, hers: true }],
  ['71', '`at` ahead of hers, which the server keeps from her devices', { rt: (o) => o.rt, at: () => Date.now() + AHEAD, hers: false }]])
test(`${n}. a lost owner device, before its removal, signs her list at its rt naming an admin secret of its own with ${what}: after the removal and Accept every page takes the removal's new secret (her new key signed it), so a wrap of the lost device's secret seals no \`as\` and the key from after the removal doesn't leak; the next secret her page replaces by itself is taken by every page too`, async () => {
  await world({}, async (w) => {
    const { cid, A, B, X, St, S2 } = await lostThenRemoved(w, lost);
    assert.deepEqual([A, B, X].map((P) => P.rolesOf(cid).h), Array(3).fill(fp(S2, cid)), 'every page: the removal\'s secret');
    assert.ok(sameKey(await A.verifiedAdmin(await A.sync(cid)), S2), 'her page trusts it');
    const l = await linkUnder(B, cid, St);
    assert.deepEqual([l.leak, b64u(await B.openAs(S2, cid, l.i.iid, l.as))], [{}, l.i.secret], 'Bob\'s link: its `as` under the removal\'s secret, nothing under the lost device\'s');
    // her page replaces the secret by itself again (an adm card's step, at the same rt): every page takes it, so S2 seals nothing after
    await A.rotateAdmins(cid, ['bob', 'xena'], { wipe: true, keep: true }); const S3 = keyOf(A, cid, 'a');
    for (const P of [A, B, X]) await read(P, cid);
    assert.deepEqual([A, B, X].map((P) => P.rolesOf(cid).h), Array(3).fill(fp(S3, cid)), 'every page: the next one');
    const l3 = await linkUnder(X, cid, S2);
    assert.deepEqual([l3.leak, b64u(await X.openAs(S3, cid, l3.i.iid, l3.as))], [{}, l3.i.secret], 'Xena\'s link: under the next one, nothing under S2');
  });
});

test('72. a lost owner device, before its removal, signs her list at an rt ahead of hers naming an admin secret of its own, which the server keeps from her devices: the removal\'s copy, at her record\'s rt below it, narrows the admins\' records at once after the removal and Accept (the same list, at the lost device\'s rt, under her new key, naming the removal\'s secret), so a wrap of the lost device\'s secret seals no `as` and their links carry `as` under the removal\'s; her own page trusts the removal\'s too', async () => {
  await world({}, async (w) => {
    const { cid, A, B, X, St, S2 } = await lostThenRemoved(w, { rt: () => Date.now() + AHEAD, at: () => 1, hers: false });
    assert.deepEqual([A.rolesOf(cid).h, sameKey(await A.verifiedAdmin(await A.sync(cid)), S2)], [fp(S2, cid), true], 'her page: the removal\'s secret');
    const R = A.rolesOf(cid).t;
    for (const P of [B, X]) assert.deepEqual([P.rolesOf(cid).h, P.rolesOf(cid).a, P.rolesOf(cid).t > R, P.rolesOf(cid).hk === A.S.me.sig.x, P.rolesOf(cid).n], [fp(S2, cid), ['bob', 'xena'], true, true, 1], P.handle + '\'s page: the removal\'s secret and list at the lost device\'s later rt, under her new key, marked narrowed');
    for (const P of [B, X]) {
      const l = await linkUnder(P, cid, St);
      assert.deepEqual([sameKey(l.v, S2), b64u(await P.openAs(S2, cid, l.i.iid, l.as)), l.leak], [true, l.i.secret, {}], P.handle + '\'s page trusts the removal\'s, the lost device\'s wrap first in akeys: its link\'s `as` is under it, nothing under the lost device\'s');
    }
  });
});

test('73. the lost device\'s copy as in 70 (`at` ahead, served to every page), and the removal\'s admin step fails: her page, sealing her list again under the new key, names no admin secret (the one its record took under her replaced key is not signed again under the new one), so the admins\' pages trust none (fail closed) and a wrap of the lost device\'s secret seals no `as`; her next admin change names a fresh one, which they take', async () => {
  await world({}, async (w) => {
    const { cid, A, B, X, St } = await lostThenRemoved(w, { rt: (o) => o.rt, at: () => Date.now() + AHEAD, hers: true, ownFails: true });
    const c = await A.sync(cid); await A.adoptOMeta(c, await A.showMeta(c));
    const m = (await A.sync(cid)).ometa, o = await plainOf(A, cid, m);
    assert.deepEqual([m.e, 'ah' in o], [1, false], 'sealed again under the new key, naming none');
    for (const P of [B, X]) {
      await read(P, cid); const l = await linkUnder(P, cid, St);
      assert.deepEqual([P.rolesOf(cid).e, l.v, l.as, l.leak], [1, null, undefined, {}], P.handle + '\'s page trusts none: its link has no `as`');
    }
    await A.shown(cid); await A.setAdmins(cid, ['bob']); const S4 = keyOf(A, cid, 'a'); await read(B, cid);
    assert.deepEqual([B.rolesOf(cid).a, B.rolesOf(cid).h], [['bob'], fp(S4, cid)], 'her next admin change: a fresh one, taken');
  });
});

test('74. one page, two accounts: a roles copy the first account read is read again, and noted, for a second account signed in on the same page after it, and for the first again when it signs back in (start empties the cache, so a note the switch away cut short is made then)', async () => {
  assert.match(lift('function start(id){', 'closeConv();setListTitle()'), /metaCache\.clear\(\)/,'start empties the cache at every account switch');
  const P = await pageFor(null, 'nina'), O = await pageFor(null, 'olga');
  const cid = 'cAdminIdSw01', K = randomBytes(32), m = await O.sealOMeta(cid, 0, K, { name: 'R', owner: 'olga', admins: ['yuri'], _ah: 'h0' });
  const see = async () => {
    P.ksPut(cid, 0, P.b64(K)); P.S.dir.olga = { handle: 'olga', ecdh: O.id.ecdh, sig: O.id.sig, kv: 1 };
    assert.ok(await P.readOMeta({ id: cid, type: 'channel', visibility: 'private', epoch: 0, keys: {}, ometa: m }), 'it opens');
    await P.rolesQ.get(cid); const r = P.rolesOf(cid); return r && [r.o, r.a, r.h];
  };
  assert.deepEqual(await see(), ['olga', ['yuri'], 'h0'], 'the first account: noted');
  P.S.me = { handle: 'zara', ...(await P.newIdentity()) };   // a second account signs in on the same page (start)
  assert.deepEqual(await see(), ['olga', ['yuri'], 'h0'], 'the second account: noted in its own record');
});

test('75. the lost device\'s copy as in 70 (`at` ahead, served to every page), then the removal: an admin\'s page that has her new code but hasn\'t accepted it trusts no admin secret (it refuses her signed lists then too), so once another admin who accepted changes the key (Xena removes Fay), Bob\'s page makes no link (it counts Xena\'s key change only once it holds the list under her new key) and a wrap of the lost device\'s secret seals no `as`, so the key from after the removal doesn\'t leak; after his Accept he takes the removal\'s, and his link\'s `as` is under it (the secret from before the removal: test 76)', async () => {
  await world({}, async (w) => {
    const { cid, B, X, St, S2 } = await lostThenRemoved(w, { rt: (o) => o.rt, at: () => Date.now() + AHEAD, hers: true, waits: true });
    assert.deepEqual([B.S.pins.alice.sig.x !== B.S.dir.alice.sig.x, B.rolesOf(cid).h], [true, fp(St, cid)], 'Bob\'s page: her new code, not accepted, and the lost device\'s fingerprint on record');
    await X.kickMember(cid, 'fay', { ban: false }); await read(B, cid);
    assert.deepEqual([B.epochOf(await B.sync(cid)), await B.holds(cid, 2)], [2, true], 'Bob holds the key Xena made after the removal');
    const c = await B.sync(cid), p = { ...c, akeys: { [LBL]: await B.wrapTo(St, B.id.ecdh, B.wrapSalt(cid + '#a', undefined, 'bob')), ...c.akeys } };
    B.S.chatDocs.set(cid, p);
    assert.equal(await B.verifiedAdmin(p), null, 'Bob\'s page trusts none, the lost device\'s wrap first in akeys');
    await assert.rejects(B.createInvite(cid), (e) => !!e && e.message === 'badkey', 'and makes no link: Xena\'s key change isn\'t checked yet');
    assert.deepEqual(await leakOf(B, St, await B.freshChan(cid)), {}, 'nothing leaks');
    await B.S.acceptKey('alice'); await read(B, cid);
    assert.ok(sameKey(await B.verifiedAdmin(await B.sync(cid)), S2), 'after his Accept: the removal\'s');
    const l = await linkUnder(B, cid, St);
    assert.deepEqual([l.leak, b64u(await B.openAs(S2, cid, l.i.iid, l.as))], [{}, l.i.secret], 'and his link: its `as` under it, nothing under the lost device\'s');
  });
});
