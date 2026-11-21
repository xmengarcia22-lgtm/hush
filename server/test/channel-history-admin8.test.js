// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.6 "Key chain"; release 92 fix round 3),
// eighth part; the first is channel-history-admin.test.js. A copy the date limit kept waiting is noted only after the page has
// loaded the owner's profile again, so a lost owner device's list dated up to ten minutes ahead is never noted under her old key
// after her device removal. An admin's own device removal counts the record's admins whatever key the record was taken under
// (the device's own removal is the one check excepted), so his key change lands even while his page hasn't accepted her new code;
// his adm card then has the owner's page replace the admin secret alone.
// This file holds tests 91 and 92; 88 and 89 are in channel-history-admin7.test.js. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, lift, mkBuild, pageFor } from './channel-history-kit.js';

// `ah` as SPEC.md 5.6 has it: HKDF-SHA-256 of the admin secret, salt "hush-admin-id-v1", info the channel id, 32 bytes, base64url.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));
// Helpers shared with channel-history-admin6.test.js and -admin7.test.js, copied as the removal tests do.
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
// B and the server plant the next epoch for X: X's check of it (sealKey), 'badkey' or 'taken'; the planted key is forgotten after.
async function plantedBy(B, X, cid) {
  const cur = await X.sync(cid), e = X.epochOf(cur) + 1, Kp = randomBytes(32), row = await B.chainRow(cid, e, Kp, keyOf(X, cid, X.epochOf(cur)));
  await X.loadDir([X.handle], true);
  const planted = { ...cur, epoch: e, keys: { ...cur.keys, [e]: await X.wrapAll(Kp, [X.handle], cid, e) } }, doc = X.S.db.doc;
  X.S.db.doc = (p) => (p === 'channels/' + cid + '/chain/' + e ? { get: async () => ({ exists: true, data: () => row }) } : doc(p));
  X.S.chanKeys.clear();
  try { const k = await X.sealKey(planted, e); return k && sameKey(k.raw, Kp) ? 'taken' : 'other'; } catch (x) { return x.message; } finally { X.S.db.doc = doc; X.ksPut(cid, e, null); X.S.chanKeys.clear(); }
}

test('91. a lost owner device, before its removal, signs her list naming Mal dated nine minutes ahead, which every page reads and waits on (the date limit); her removal follows, and the waits end (about four minutes on) on Fay\'s page, which pinned her key, and on Gus\'s, which didn\'t, before their directory refresh brings her new key: each loads her profile again first, so neither notes that list; once Fay accepts her new code, Bob\'s key change is taken on both pages and Mal\'s refused', async () => {
  const caught = [], realST = globalThis.setTimeout;   // the date limit's waits, fired below by hand as if four minutes had passed
  globalThis.setTimeout = (fn, ms, ...a) => (ms > 60e3 && ms < 11 * 60e3 && /rolesLater\.delete/.test(String(fn)) ? (caught.push(fn), 0) : realST(fn, ms, ...a));
  try {
    await world({}, async (w) => {
      const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), F = await w.page('fay', { build: acceptBuild }), G = await w.page('gus'), M = await w.page('mal');
      const members = ['alice', 'bob', 'fay', 'gus', 'mal'];
      await makeChannel(A, cid, members, ['bob']);
      F.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as Fay's page first saw it
      for (const P of [A, F, G]) await read(P, cid);
      const o1 = await plainOf(A, cid, (await A.sync(cid)).ometa), R = o1.rt;
      const x = { name: o1.name, desc: o1.desc, photo: o1.photo, owner: 'alice', admins: ['bob', 'mal'], rt: Date.now() + 9 * 60e3, ah: fp(new Uint8Array(randomBytes(32)), cid), at: 1 };
      await A.S.db.doc('channels/' + cid).update({ ometa: await lostCopy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), x) });
      for (const P of [A, F, G]) await read(P, cid);
      assert.deepEqual([caught.length, ...[A, F, G].map((P) => P.rolesOf(cid).t === R)], [3, true, true, true], 'nine minutes ahead: noted nowhere at once, each page waits on it');
      await newKeys(A);
      assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true }]);
      for (const P of [A, F, G]) P.clock.skew = 4 * 60e3 + 5e3;
      await Promise.all(caught.splice(0).map((fn) => fn()));
      for (const P of [A, F, G]) await P.rolesQ.get(cid);
      assert.deepEqual([A, F, G].map((P) => [P.rolesOf(cid).t === R, P.rolesOf(cid).a]), [[true, ['bob']], [true, ['bob']], [true, ['bob']]], 'the waits ended after the removal: her profile loaded again first, so the list is noted nowhere');
      await F.S.acceptKey('alice');
      for (const P of [F, G]) await read(P, cid);
      assert.deepEqual([F, G].map((P) => P.rolesOf(cid).hk === A.S.me.sig.x), [true, true], 'her removal\'s copy, under her new key: taken on both');
      assert.deepEqual([await plantedBy(B, F, cid), await plantedBy(M, F, cid), await plantedBy(B, G, cid), await plantedBy(M, G, cid)], ['taken', 'badkey', 'taken', 'badkey'], 'Bob\'s key change taken on both pages, Mal\'s refused');
    });
  } finally { globalThis.setTimeout = realST; }
});

test('92. Alice removes a lost device; Carol, an admin who accepted her new code, then changes the key; Bob, an admin whose page hasn\'t accepted it yet (so it counts no admin outside a removal of its own), loses his phone and removes it: his own key change lands (the device\'s own removal counts Carol\'s commit), with no wrap for her until he accepts her new code and his page wraps the keys to her again; his adm card then asks her page, which replaces the admin secret alone, with no second key change (Bob, Carol and Fay hold his new key, the phone doesn\'t); when Carol then removes a device of hers, likewise', async () => {
  await world({ limits: { framesPerMin: 1000 } }, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), C = await w.page('carol', { build: acceptBuild }), F = await w.page('fay');
    const members = ['alice', 'bob', 'carol', 'fay'], admins = ['bob', 'carol'];
    await makeChannel(A, cid, members, admins);
    for (const P of [B, C, F]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, C, F]) await read(P, cid);
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins, members }])).rotated, [{ cid, ok: true }]);
    await C.loadDir(['alice'], true); await C.S.acceptKey('alice'); await read(C, cid);
    const e1 = await C.rotateTo(await C.sync(cid), C.metaOf(await C.shown(cid)));   // Carol's key change, as an admin's
    await B.loadDir(['alice'], true); await read(B, cid);   // Bob's page has seen her new code, not accepted it
    assert.equal(await plantedBy(C, B, cid), 'badkey', 'outside a removal, Bob\'s page counts Carol for no key change');
    const lost = await pageFor(null, 'bob', { id: B.id }), reads = async () => { const c = await A.sync(cid); return !!(await lost.convKey(c, A.epochOf(c))); };
    assert.deepEqual([A.epochOf(await A.sync(cid)), await reads()], [e1, true], 'his phone, lost next, holds the current key');
    await newKeys(B);
    assert.deepEqual((await removal(B, [{ cid, admin: true, admins, members }])).rotated, [{ cid, ok: true, card: 'adm' }], 'his own removal counts her: its key change lands, and an adm card');
    assert.deepEqual([A.epochOf(await A.sync(cid)), await reads(), await A.holds(cid, e1 + 1)], [e1 + 1, false, false], 'the key changed without his lost phone, and with no wrap for her: her new code isn\'t accepted on his page (wrapKey), as at any key change of his then');
    await B.S.acceptKey('alice'); await B.resendKeys(cid, 'alice');   // his Accept: his page wraps the keys to her devices again (rewrapFor)
    await A.loadDir(['bob'], true);   // his new key, as the directory refresh brings it
    assert.deepEqual([await A.holds(cid, e1 + 1), (await A.cards(cid)).includes('bob:adm')], [true, true], 'she holds his key now, and his card is there');
    const n = [A.spy.rotate.length, A.spy.admins.length];
    await A.run(cid); await A.run(cid);
    assert.deepEqual([A.epochOf(await A.sync(cid)), A.spy.rotate.length - n[0], A.spy.admins.length - n[1], await A.cards(cid)], [e1 + 1, 0, 1, []], 'her page: a new admin secret, no second key change; the card is gone');
    assert.deepEqual([await B.holds(cid, e1 + 1), await C.holds(cid, e1 + 1), await F.holds(cid, e1 + 1)], [true, true, true], 'Bob, Carol and Fay hold it');
    // Carol's removal: likewise
    await newKeys(C);
    assert.deepEqual((await removal(C, [{ cid, admin: true, admins, members }])).rotated, [{ cid, ok: true, card: 'adm' }]);
    await A.loadDir(['carol'], true);   // her new key, as the directory refresh brings it
    const m = [A.spy.rotate.length, A.spy.admins.length];
    await A.run(cid); await A.run(cid);
    assert.deepEqual([A.epochOf(await A.sync(cid)), A.spy.rotate.length - m[0], A.spy.admins.length - m[1], await A.cards(cid)], [e1 + 2, 0, 1, []], 'her own key change stands: a new admin secret, no second key change');
  });
});
