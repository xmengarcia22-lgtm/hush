// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.6 "Key chain"; release 92 fix round 3),
// ninth part; the first is channel-history-admin.test.js. Who counts for a key commit is decided at every check and never kept
// (headOk, rolesPass): an admin counts only from a record taken under the owner's key as the page holds it now, so a page that
// loads her changed key refuses, from that moment, every admin of a record taken under the key before, with nothing cleared and
// no reload (fail closed), and reads the channel's owner part once more by itself before refusing, so her removal's copy, not
// noted when it was first read, is noted on demand. A server that withholds that copy leaves every admin refused there until
// a copy of hers under the new key arrives; a copy at rt 1 (a re-seal by a device of hers with no signed record, served a lost
// device's list first) narrows no record above rt 1.
// This file holds tests 94 to 97; 98 to 101 are in channel-history-admin10.test.js, 102 to 107 in channel-history-admin11.test.js.
// The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, lift, mkBuild } from './channel-history-kit.js';

// `ah` as SPEC.md 5.6 has it: HKDF-SHA-256 of the admin secret, salt "hush-admin-id-v1", info the channel id, 32 bytes, base64url.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));
// Helpers shared with channel-history-admin5.test.js and the other channel-history files, copied as the removal tests do.
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
// A lost device's copy of A's list naming `admins` at `rt(o)`, from the owner's part as the server has it (A still holds the key it signs with).
const thiefCopy = async (A, cid, admins, rt) => { const o = await plainOf(A, cid, (await A.sync(cid)).ometa); return lostCopy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), { name: o.name, desc: o.desc, photo: o.photo, owner: 'alice', admins, rt: rt(o), ah: fp(new Uint8Array(randomBytes(32)), cid), at: 1 }); };
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
// The same, kept in place: check() seals under the planted key again with nothing cleared in between, as X's page does at each seal; undo() restores.
async function plantKeep(B, X, cid) {
  const cur = await X.sync(cid), e = X.epochOf(cur) + 1, Kp = randomBytes(32), row = await B.chainRow(cid, e, Kp, keyOf(X, cid, X.epochOf(cur)));
  const planted = { ...cur, epoch: e, keys: { ...cur.keys, [e]: await X.wrapAll(Kp, [X.handle], cid, e) } }, doc = X.S.db.doc;
  X.S.db.doc = (p) => (p === 'channels/' + cid + '/chain/' + e ? { get: async () => ({ exists: true, data: () => row }) } : doc(p));
  const check = async () => { try { const k = await X.sealKey(planted, e); return k && sameKey(k.raw, Kp) ? 'taken' : 'other'; } catch (x) { return x.message; } };
  return { check, undo: () => { X.S.db.doc = doc; X.ksPut(cid, e, null); X.S.chanKeys.clear(); } };
}
const curKey = async (X, cid) => keyOf(X, cid, X.epochOf(await X.sync(cid)));
const ownChange = (X, cid) => X.shown(cid).then((s) => X.rotateTo(X.S.chatDocs.get(cid), X.metaOf(s)));   // a key change of X's own, from its record
const seal = async (X, cid) => { const c = await X.sync(cid); try { return (await X.sealKey(c, X.epochOf(c))) ? 'ok' : 'none'; } catch (e) { return e.message; } };   // X's check of the current key, caches as they are

test('94. test 81\'s attack (a lost owner device\'s list at her record\'s rt plus one naming Mal, a subscriber), and the server withholds her removal\'s copy from the members, showing them the lost device\'s again: after the removal, with her new key accepted (Bob, Fay) or loaded (Gus), her own commit (the removal\'s) seals everywhere and every admin, Mal and Bob alike, is refused on the members\' pages (fail closed, no leak); Bob\'s own page still makes a key change, which they refuse too; her next admin change, dated by her clock past the lost device\'s rt, is taken everywhere: Mal gone, Bob counts, the current commit (his) seals', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), F = await w.page('fay', { build: acceptBuild }), G = await w.page('gus'), M = await w.page('mal');
    const members = ['alice', 'bob', 'fay', 'gus', 'mal'];
    await makeChannel(A, cid, members, ['bob']);
    for (const P of [B, F]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, F, G, M]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, o1 = await plainOf(A, cid, m1), oldX = A.id.sig.x;
    const thief = await thiefCopy(A, cid, ['bob', 'mal'], (o) => o.rt + 1);
    await A.S.db.doc('channels/' + cid).update({ ometa: thief });
    for (const P of [B, F, G]) await read(P, cid);
    assert.deepEqual([B, F, G].map((P) => P.rolesOf(cid).a), [['bob', 'mal'], ['bob', 'mal'], ['bob', 'mal']], 'the members took the lost device\'s list');
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true }]);
    await read(A, cid); const keep = (await A.sync(cid)).ometa;
    assert.deepEqual([A.rolesOf(cid).a, A.rolesOf(cid).t, A.rolesOf(cid).hk === oldX], [['bob'], o1.rt, false], 'her record: her list, under her new key');
    await A.S.db.doc('channels/' + cid).update({ ometa: thief });   // what the members are served: the lost device's copy, her removal's withheld from them
    for (const P of [B, F]) { await P.loadDir(['alice'], true); await P.S.acceptKey('alice'); await read(P, cid); }
    await G.loadDir(['alice'], true); await read(G, cid);
    // per member: the record's list, whether it is under her replaced key, whether the current key's commit seals here, and Mal's and Bob's key changes
    const state = async () => { const out = []; for (const P of [B, F, G]) { await P.rolesQ.get(cid); const r = P.rolesOf(cid); out.push([r.a, r.hk === oldX, await seal(P, cid), await plantedBy(M, P, cid, await curKey(P, cid)), P === B ? 'n/a' : await plantedBy(B, P, cid, await curKey(P, cid))]); } return out; };
    assert.deepEqual(await state(), [[['bob', 'mal'], true, 'ok', 'badkey', 'n/a'], [['bob', 'mal'], true, 'ok', 'badkey', 'badkey'], [['bob', 'mal'], true, 'ok', 'badkey', 'badkey']], 'withheld: the records stay under her replaced key, her own commit seals, every admin is refused');
    assert.equal(await ownChange(B, cid), 2, 'Bob\'s own page makes a key change: the commit it checks is hers');
    assert.deepEqual((await state()).map((s) => s.slice(2)), [['ok', 'badkey', 'n/a'], ['badkey', 'badkey', 'badkey'], ['badkey', 'badkey', 'badkey']], 'his key passes on his page alone (one it made); Fay and Gus refuse it, and any further change of his, until a copy of hers under the new key');
    await A.S.db.doc('channels/' + cid).update({ ometa: keep });   // her own pages see her copy: the server kept it from the members only
    await A.shown(cid); await A.setAdmins(cid, ['bob']);   // her next admin change, dated by her clock: past the lost device's rt
    for (const P of [B, F, G]) await read(P, cid);
    assert.deepEqual(await state(), [[['bob'], false, 'ok', 'badkey', 'n/a'], [['bob'], false, 'ok', 'badkey', 'taken'], [['bob'], false, 'ok', 'badkey', 'taken']], 'her change: taken everywhere, Mal gone, Bob counts, the current commit (his) seals');
  });
});

test('95. test 81\'s attack, and before their directory refresh brings her new key, the server shows Fay (who pinned her key) and Gus (who didn\'t) a key change Mal signed, which their pages check and take (a page kept from her new key can\'t tell); the refresh brings it, nothing is cleared, no code is accepted, no reload: the same planted key, checked again, is refused on both (who counts is decided at every check)', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), F = await w.page('fay', { build: acceptBuild }), G = await w.page('gus'), M = await w.page('mal');
    const members = ['alice', 'bob', 'fay', 'gus', 'mal'];
    await makeChannel(A, cid, members, ['bob']);
    for (const P of [B, F]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, F, G, M]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa;
    await A.S.db.doc('channels/' + cid).update({ ometa: await thiefCopy(A, cid, ['bob', 'mal'], (o) => o.rt + 1) });
    for (const P of [B, F, G]) await read(P, cid);
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true }]);
    const pf = await plantKeep(M, F, cid), pg = await plantKeep(M, G, cid);
    assert.deepEqual([await pf.check(), await pg.check()], ['taken', 'taken'], 'before the refresh: taken on both (their pages hold her old key alone)');
    for (const P of [F, G]) await P.loadDir(['alice'], true);   // the refresh: her new key, nothing cleared, no Accept
    assert.deepEqual([await pf.check(), await pg.check()], ['badkey', 'badkey'], 'the same key, checked again: refused on both');
    pf.undo(); pg.undo();
  });
});

test('96. an ordinary device removal, on pages that didn\'t pin her key (Gus\'s and Hal\'s): both read her removal\'s copy before their directory refresh brings her new key, so it doesn\'t check out there yet and is not remembered as read; after the refresh, with no read since, Gus\'s first check of a key change Bob makes reads the copy again by itself and takes the key (the record moves to her new key); a read on Hal\'s page notes it too', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus'), H = await w.page('hal');
    const members = ['alice', 'bob', 'gus', 'hal'];
    await makeChannel(A, cid, members, ['bob']);
    for (const P of [A, B, G, H]) await read(P, cid);
    const oldX = A.id.sig.x;
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true }]);
    for (const P of [G, H]) await read(P, cid);   // her removal's copy, read before their directory has her new key: it doesn't check out here yet
    assert.deepEqual([G.rolesOf(cid).hk === oldX, await plantedBy(B, G, cid, await curKey(G, cid))], [true, 'taken'], 'before the refresh: the record under the key held here, still her old one, so Bob counts as before');
    for (const P of [G, H]) await P.loadDir(['alice'], true);
    assert.deepEqual([await plantedBy(B, G, cid, await curKey(G, cid)), G.rolesOf(cid).hk === A.S.me.sig.x, G.rolesOf(cid).n], ['taken', true, 1], 'Gus, no read since: the check read her copy again by itself and took it');
    await read(H, cid);
    assert.deepEqual([H.rolesOf(cid).hk === A.S.me.sig.x, await plantedBy(B, H, cid, await curKey(H, cid))], [true, 'taken'], 'Hal: a read notes it');
  });
});

test('97. test 81\'s attack with her removal\'s copy withheld from the members (fail closed: Mal and Bob refused); her freshly linked device (her new keys, no record) is served the lost device\'s copy first: an unsigned first sight, which it keeps unsigned and seals nothing of again (owner decision D1): the members\' records stay under her replaced key and refuse every admin still, until a copy of hers arrives', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), F = await w.page('fay', { build: acceptBuild }), G0 = await w.page('gus'), M = await w.page('mal');
    const members = ['alice', 'bob', 'fay', 'gus', 'mal'];
    await makeChannel(A, cid, members, ['bob']);
    for (const P of [B, F]) P.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as their pages first saw it
    for (const P of [A, B, F, G0, M]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, o1 = await plainOf(A, cid, m1), oldX = A.id.sig.x;
    const thief = await thiefCopy(A, cid, ['bob', 'mal'], (o) => o.rt + 1);
    await A.S.db.doc('channels/' + cid).update({ ometa: thief }); for (const P of [B, F, G0]) await read(P, cid);
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true }]);
    await A.S.db.doc('channels/' + cid).update({ ometa: thief });   // withheld: the server keeps showing the lost device's copy
    for (const P of [B, F]) { await P.loadDir(['alice'], true); await P.S.acceptKey('alice'); await read(P, cid); }
    await G0.loadDir(['alice'], true); const G = await w.reload(G0); await read(G, cid);   // Gus's page reloaded since: fresh caches change nothing below
    const state = async () => { const out = []; for (const P of [B, F, G]) { await P.rolesQ.get(cid); const r = P.rolesOf(cid); out.push([r.a, r.t === o1.rt + 1, r.hk === oldX, await plantedBy(M, P, cid, await curKey(P, cid)), P === B ? 'n/a' : await plantedBy(B, P, cid, await curKey(P, cid))]); } return out; };
    const closed = [[['bob', 'mal'], true, true, 'badkey', 'n/a'], [['bob', 'mal'], true, true, 'badkey', 'badkey'], [['bob', 'mal'], true, true, 'badkey', 'badkey']];
    assert.deepEqual(await state(), closed, 'withheld: the records under her replaced key, Mal refused, and Bob too (fail closed)');
    const fresh = { ...A.S.me }; delete fresh.prev;   // her device linked after the removal: her new keys, no record, no memory of the key before
    const A2 = await w.page('alice', { owner: true, id: fresh });
    const c = await A2.sync(cid), shown = await A2.showMeta(c); await A2.rolesQ.get(cid);
    assert.deepEqual([A2.rolesOf(cid).s, A2.rolesOf(cid).a], [0, ['bob', 'mal']], 'the fresh device: an unsigned first sight of the lost device\'s list (signed with a key it does not hold as hers)');
    A2.spy.updates.length = 0; await A2.adoptOMeta(c, shown);
    assert.deepEqual([(await A2.sync(cid)).ometa.iv === thief.iv, A2.spy.updates, A2.rolesOf(cid).s], [true, [], 0], 'it seals nothing again: a list it could not verify stays unsigned there');
    for (const P of [B, F, G]) await read(P, cid);
    assert.deepEqual(await state(), closed, 'the members: unchanged, still fail closed');
  });
});
