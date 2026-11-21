// Release 92 (page), private channel history: the strict rule (owner decision D1; SPEC.md 5.6 "Key chain"). A device trusts no
// admin list it could not verify under the owner's current key as it holds it: it never signs, seals again, hands an admin secret
// to, or saves such a list by itself, and an unsigned roles record counts no admin for key commits (the owner's own commits, her
// own page and her device removal keep their exemptions); a signed copy that failed is not remembered as read, at first sight too.
// Channels from before release 92 have no signed list: the owner opens each one she owns, checks its admins and saves the list by
// hand (Edit, then Save); until then their members accept no admin's key change, an admin's page there changes no key and backfills
// no chain, and her removal hands the unsigned list no admin secret (from release 93b it replaces the secret with one her own devices
// alone hold, so the removed device's old one opens the channel at admin level no more). Tests 133 to 138, 147 (adoptOMeta's early return) and 150 (a left admin and the owner's one-time save, release 93b item 11). The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, linkOf, lift, mkBuild } from './channel-history-kit.js';

// Helpers shared with channel-history-admin11.test.js, channel-history-roles.test.js, channel-history-golive.test.js and
// channel-history-removal.test.js, copied as the removal tests do.
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));   // `ah` as SPEC.md 5.6 has it
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
async function plainOf(X, cid, m) {   // the plaintext of a channel's ometa, opened with the key X holds for its epoch
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}
async function removal(X, chats) {   // a device removal's rotate stage on X's page, and the new account keys before it
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
// A copy of the owner's part signed with `sigPriv` (a lost device's key of hers) with the time, list and fingerprint given, sealed under epoch e's key.
async function copyBy(sigPriv, cid, e, raw, x) {
  const sk = await crypto.subtle.importKey('jwk', sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const parts = [cid, String(e), String(x.rt), x.owner, [...x.admins].sort().join(',')].concat(x.ah ? [x.ah, String(x.at)] : []);
  const rs = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from('hush-roles-v1|' + parts.join('|')))).toString('base64');
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(JSON.stringify({ ...x, rs })))).toString('base64') };
}
const thiefCopy = async (A, cid, admins, rt) => { const o = await plainOf(A, cid, (await A.sync(cid)).ometa); return copyBy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), { name: o.name, desc: o.desc, photo: o.photo, owner: 'alice', admins, rt: rt(o), ah: fp(new Uint8Array(randomBytes(32)), cid), at: 1 }); };
async function bareMeta(e, raw, x, ad) {   // an ometa as a page from before release 92 sealed it: no rs
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(ad) }, key, Buffer.from(JSON.stringify(x)))).toString('base64') };
}
// A private channel as a page from before release 92 left it: its ometa unsigned, naming no admin secret, read so by everyone in `pages`.
async function pre92(A, cid, members, admins, pages) {
  await makeChannel(A, cid, members, admins);
  await A.S.db.doc('channels/' + cid).update({ ometa: await bareMeta(0, keyOf(A, cid, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins }, 'hush-ometa-v1|' + cid) });
  for (const P of pages) { await read(P, cid); assert.deepEqual([P.rolesOf(cid).s, P.rolesOf(cid).a], [0, admins], P.handle + ': unsigned'); }
}
// B (naming `before` as the key before) and the server plant the next epoch for X: X's check of it (sealKey), 'badkey' or 'taken'.
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
// Save pressed in X's Edit sheet (openEditConv), the record being X's copy of it: the sheet's error line ('' once saved). The owner's manual step.
async function editSave(X, cid, name) {
  X.S.convs = [{ ...(await X.showMeta(X.S.chatDocs.get(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); return at((e) => e.cls === 'err').textContent;
}
const listOf = async (X, cids) => { X.S.convs = await Promise.all(cids.map(async (cid) => ({ ...(await X.shown(cid)), id: cid }))); };   // the chat list as the page holds it
const ometas = (X) => X.spy.updates.filter((k) => k.includes('ometa')).length;
const stamps = (X) => X.ls.get('hush:pass:' + X.handle, {});
const summary = (X, rec) => { X.spy.els.length = 0; X.rekeySummary(rec); return X.spy.els.map((e) => e.textContent).filter(Boolean); };
const freshId = (A) => { const id = { ...A.S.me }; delete id.prev; return id; };   // her device linked after a removal: her new keys, no record, no memory of the key before

test('133. the laundering attempt fails closed: a lost owner device\'s list [bob, mal] under her replaced key, served first to a device of hers linked after the removal, is kept unsigned there; its chat watch seals nothing again and its start\'s pass makes no admin secret, signs and saves nothing (the channel still stamped: nothing was busy); every member keeps [bob] and Mal stays refused and without a secret; once her removal\'s copy reaches the device the record is signed, and the next open finds the secret that copy names and makes none', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: acceptBuild }), G = await w.page('gus'), M = await w.page('mal');
    const members = ['alice', 'bob', 'gus', 'mal'];
    B.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as Bob's page first saw it
    await makeChannel(A, cid, members, ['bob']);
    for (const P of [A, B, G, M]) await read(P, cid);
    const R = A.rolesOf(cid).t; assert.ok(R > 1, 'a release-92 channel: a signed record above rt 1');
    const m1 = (await A.sync(cid)).ometa, T = Date.now();
    const plant = await thiefCopy(A, cid, ['bob', 'mal'], () => T);   // signed with her key as it is now (the lost device holds it)
    await A.S.db.doc('channels/' + cid).update({ ometa: plant });
    for (const P of [B, G, M]) await read(P, cid);
    assert.deepEqual([B.rolesOf(cid).a, G.rolesOf(cid).t], [['bob', 'mal'], T], 'the members take the plant: her key signed it');
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });   // kept from her device
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members }])).rotated, [{ cid, ok: true }]);
    assert.equal(A.rolesOf(cid).hi, 1, 'her removal\'s key change raised the mark (release 93b, the epoch-rollback guard)');
    const keep = (await A.sync(cid)).ometa, ak = JSON.stringify((await A.sync(cid)).akeys), S2 = keyOf(A, cid, 'a');
    await B.loadDir(['alice'], true); await B.S.acceptKey('alice'); await read(B, cid);
    for (const P of [G, M]) { await P.loadDir(['alice'], true); await read(P, cid); }
    assert.deepEqual([B.rolesOf(cid).a, G.rolesOf(cid).a, G.rolesOf(cid).hk === A.S.me.sig.x, G.rolesOf(cid).n], [['bob'], ['bob'], true, 1], 'the keep copy narrowed every member');
    const closed = async () => [await plantedBy(M, G, cid, await curKey(G, cid)), await M.adminSecret(await M.sync(cid)), M.S.db.chatLevel(cid), sameKey(await B.verifiedAdmin(await B.sync(cid)), S2)];
    assert.deepEqual(await closed(), ['badkey', null, 'member', true], 'Mal refused and without a secret; Bob holds the one the removal signed');
    // the dishonest server serves the lost device's copy to her freshly linked device first
    await A.S.db.doc('channels/' + cid).update({ ometa: plant });
    const A2 = await w.page('alice', { owner: true, id: freshId(A) });
    await read(A2, cid);
    assert.deepEqual([A2.rolesOf(cid).s, A2.rolesOf(cid).a, A2.rolesOf(cid).t, A2.rolesOf(cid).h], [0, ['bob', 'mal'], 0, undefined], 'first sight: a copy its key does not verify is kept unsigned, with no fingerprint');
    const c0 = await A2.sync(cid), sh0 = await A2.showMeta(c0); assert.deepEqual([sh0._ometa, !!sh0._odd, !!sh0._stale, sh0._rt], [true, false, false, 0], 'the copy opens and is the record\'s own');
    A2.spy.admins.length = 0; A2.spy.updates.length = 0;
    await A2.adoptOMeta(c0, sh0);   // the chat watch
    await listOf(A2, [cid]); await A2.goLive(A2.S.me);   // the start's pass
    await assert.rejects(A2.rotateAdmins(cid, ['bob', 'mal'], { keep: true }), /nokey/, 'a re-seal by the page itself is refused before anything is written');
    const c1 = await A2.sync(cid);
    assert.deepEqual([A2.spy.admins, ometas(A2), c1.ometa.iv === plant.iv, JSON.stringify(c1.akeys) === ak, A2.rolesOf(cid).s, A2.rolesOf(cid).a, !!stamps(A2)[cid].at], [[], 0, true, true, 0, ['bob', 'mal'], true], 'nothing sealed again, no admin secret made, nothing saved; the record still unsigned; the channel stamped (nothing was busy)');
    for (const P of [B, G, M]) await read(P, cid);
    assert.deepEqual([B.rolesOf(cid).a, G.rolesOf(cid).a, M.rolesOf(cid).a, G.rolesOf(cid).n, ...(await closed())], [['bob'], ['bob'], ['bob'], 1, 'badkey', null, 'member', true], 'every member keeps [bob]; Mal still refused and without a secret; Bob still holds the signed one');
    // her removal's copy reaches the fresh device
    await A.S.db.doc('channels/' + cid).update({ ometa: keep });
    await read(A2, cid);
    assert.deepEqual([A2.rolesOf(cid).s, A2.rolesOf(cid).a, A2.rolesOf(cid).t, A2.rolesOf(cid).hk === A2.S.me.sig.x, A2.rolesOf(cid).h], [1, ['bob'], R, true, fp(S2, cid)], 'signed: her own copy under her current key, naming the removal\'s secret');
    await A2.run(cid);
    assert.deepEqual([A2.spy.admins.length, sameKey(await A2.verifiedAdmin(await A2.sync(cid)), S2), (await A2.sync(cid)).ometa.iv], [0, true, keep.iv], 'the next open: the secret the signed list names opens here, so none is made and nothing is written');
  });
});

test('134. the replay of a genuine release-91 copy (no signature) of a channel the owner has since signed: a fresh device of hers keeps it unsigned, seals nothing again, makes no admin secret and saves nothing, until her signed copy is served to it', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus');
    await pre92(A, cid, ['alice', 'bob', 'gus'], ['bob'], [A, B, G]);
    const m91 = (await A.sync(cid)).ometa;
    assert.equal(await editSave(A, cid, 'History'), '', 'the owner saves the list by hand (Edit, then Save)');
    const m92 = (await A.sync(cid)).ometa, o = await plainOf(A, cid, m92);
    assert.deepEqual([typeof o.rs, o.rt > 1, o.admins, 'ah' in o], ['string', true, ['bob'], false], 'signed at a fresh rt, naming no secret yet');
    for (const P of [B, G]) await read(P, cid);
    assert.deepEqual([B.rolesOf(cid).s, B.rolesOf(cid).t, G.rolesOf(cid).hk === A.S.me.sig.x], [1, o.rt, true], 'the members take it');
    await A.S.db.doc('channels/' + cid).update({ ometa: m91 });   // the server shows her fresh device the release-91 copy again
    const A2 = await w.page('alice', { owner: true, id: A.id });
    const c = await A2.sync(cid), sh = await A2.showMeta(c); await A2.rolesQ.get(cid);
    assert.deepEqual([A2.rolesOf(cid).s, A2.rolesOf(cid).a, sh._rt, sh._ometa, !!sh._odd], [0, ['bob'], 0, true, false], 'first sight: unsigned');
    A2.spy.updates.length = 0; A2.spy.admins.length = 0;
    await A2.adoptOMeta(c, sh);
    await listOf(A2, [cid]); await A2.goLive(A2.S.me);
    assert.equal(await A2.signAdminId(cid), false, 'no admin secret for an unsigned list: nothing to do, no attempt');
    await assert.rejects(A2.rotateAdmins(cid, ['bob'], { keep: true }), /nokey/, 'a re-seal by the page itself: refused before anything is written');
    for (const how of [true, 'next']) await assert.rejects(A2.sealOMetaFor(c, { ...A2.metaOf(sh), _rt: sh._rt }, how), /nokey/, 'sealing the list again (' + (how === true ? 'keep' : how) + ') from an unsigned record: refused');
    assert.deepEqual([ometas(A2), A2.spy.admins, (await A2.sync(cid)).ometa.iv, A2.rolesOf(cid).s, !!stamps(A2)[cid].at], [0, [], m91.iv, 0, true], 'not adopted, signed or saved, no admin secret made; the pass stamped it with nothing to do');
    for (const P of [B, G]) await read(P, cid);
    assert.deepEqual([B.rolesOf(cid).t, B.rolesOf(cid).a, G.rolesOf(cid).a], [o.rt, ['bob'], ['bob']], 'the members: her signed list stands');
    await A.S.db.doc('channels/' + cid).update({ ometa: m92 }); await read(A2, cid);
    assert.deepEqual([A2.rolesOf(cid).s, A2.rolesOf(cid).t, A2.rolesOf(cid).hk === A2.S.me.sig.x], [1, o.rt, true], 'her signed copy, once served: taken');
  });
});

test('135. a channel from before release 92 (its record unsigned on every device): a member accepts no admin\'s key change, the admin\'s own page makes none (badkey before anything is written) and backfills no chain, while the owner\'s page backfills it and makes no admin secret by itself; the owner\'s Edit then Save signs the shown list at a fresh rt, the members take it under her current key, her next open makes the admin secret for it, and a member then accepts the admin\'s key change', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus');
    await pre92(A, cid, ['alice', 'bob', 'gus'], ['bob'], [A, B, G]);
    assert.equal(await plantedBy(B, G, cid, await curKey(G, cid)), 'badkey', 'a member accepts no admin\'s key change');
    await assert.rejects(ownChange(B, cid), /badkey/, 'the admin\'s own page makes none');
    const cB = await B.sync(cid);
    assert.deepEqual([cB.epoch, await B.ensureChain(cB), B.spy.chain], [0, false, []], 'the key unchanged; his page backfills no chain (the head row it would sign counts for nothing)');
    A.spy.admins.length = 0; A.spy.updates.length = 0; A.spy.chain.length = 0;
    const cA = await A.sync(cid);
    assert.deepEqual([await A.ensureChain(cA), A.spy.chain.length], [true, 1], 'the owner\'s page backfills it: her commits count');
    await A.run(cid);
    assert.deepEqual([A.spy.admins, ometas(A), A.rolesOf(cid).s, (await B.shown(cid)).admins], [[], 0, 0, ['bob']], 'her open makes no admin secret and signs nothing by itself');
    // the manual step
    assert.equal(await editSave(A, cid, 'History'), '', 'Edit, then Save');
    const m = (await A.sync(cid)).ometa; let o = await plainOf(A, cid, m); const rt = o.rt;
    assert.deepEqual([typeof o.rs, rt > 1, o.admins, 'ah' in o, A.rolesOf(cid).s, A.rolesOf(cid).t], ['string', true, ['bob'], false, 1, rt], 'the shown list signed at a fresh rt, no secret named yet');
    for (const P of [B, G]) await read(P, cid);
    assert.deepEqual([B.rolesOf(cid).s, G.rolesOf(cid).t, G.rolesOf(cid).hk === A.S.me.sig.x, G.rolesOf(cid).h], [1, rt, true, undefined], 'the members take it under her current key');
    assert.equal(await plantedBy(B, G, cid, await curKey(G, cid)), 'taken', 'Bob counts on a member now');
    await A.run(cid);   // the next open, or the start's pass
    o = await plainOf(A, cid, (await A.sync(cid)).ometa); const S1 = keyOf(A, cid, 'a');
    assert.deepEqual([A.spy.admins.length, o.ah, o.rt, o.admins, A.rolesOf(cid).h], [1, fp(S1, cid), rt, ['bob'], fp(S1, cid)], 'a fresh admin secret, its fingerprint signed at the record\'s time');
    for (const P of [B, G]) await read(P, cid);
    assert.deepEqual([G.rolesOf(cid).h, sameKey(await B.verifiedAdmin(await B.sync(cid)), S1)], [fp(S1, cid), true], 'the members take the fingerprint; Bob holds the secret');
    assert.equal(await ownChange(B, cid), 1, 'and his own page changes the key');
    assert.equal((await G.sealKey(await G.sync(cid), 1)) !== null, true, 'which Gus seals under');
  });
});

test('136. a device removal where the owner\'s record is unsigned (a channel from before release 92 she hasn\'t signed yet): the key changes, the owner key is replaced, and the admin secret is replaced by a fresh one wrapped to her own devices alone (release 93b, owner decision D3), noted as her page\'s own: the removed device\'s old secret opens the channel at no level any more; the unsigned list is handed nothing and no copy of it is sealed, so its admin holds no admin secret and is at member level there until she signs; the summary says what to do; her Edit then Save and the next open give the admin a secret again', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus'), L = await w.page('lost');
    const members = ['alice', 'bob', 'gus'];
    await pre92(A, cid, members, ['bob'], [A, B, G]);
    const before = await A.sync(cid), S0 = keyOf(A, cid, 'a');
    // The level the server gives a connection that shows it the admin key from the removed device's secret: the server ties the
    // admin key to no account, so whoever holds that secret, signed in as any account (L), is an admin for as long as it is the key.
    const lostLevel = async () => { const [sa, mc] = [L.adminSecret, L.memberCap]; L.adminSecret = async () => S0; L.memberCap = async () => null;
      try { await L.S.db.refreshChat(cid); return L.S.db.chatLevel(cid); } finally { L.adminSecret = sa; L.memberCap = mc; } };
    assert.equal(await lostLevel(), 'admin', 'before the removal the old secret is the channel\'s admin key');
    A.spy.admins.length = 0; A.spy.updates.length = 0;
    await newKeys(A);
    const rec = await removal(A, [{ cid, owner: true, admins: ['bob'], members }]);
    const after = await A.sync(cid), F = keyOf(A, cid, 'a');
    assert.deepEqual([rec.rotated, after.epoch, Object.keys(after.akeys).length, sameKey(F, S0), sameKey(await A.adminSecret(after), F), A.rolesOf(cid).p, after.ometa.iv === before.ometa.iv, A.spy.admins, ometas(A), A.rolesOf(cid).s], [[{ cid, ok: true, own: 'unsigned' }], 1, 1, false, true, fp(F, cid), true, [cid], 0, 0], 'the key changed; a fresh admin secret, wrapped once (to her own device) and noted as this page\'s own; the owner\'s part untouched; the record still unsigned');
    assert.equal(await lostLevel(), null, 'the removed device\'s old admin secret opens the channel at no level any more');
    assert.ok(summary(A, rec).includes('Your admins in History can’t post or manage there right now. Open each one, check its admins, then tap Edit and Save. They get access back the next time you open Hush.'), 'the summary says so');
    for (const P of [B, G]) { await P.loadDir(['alice'], true); await read(P, cid); }
    assert.deepEqual([await G.holds(cid, 1), await B.holds(cid, 1), await B.adminSecret(await B.sync(cid)), B.S.db.chatLevel(cid), await plantedBy(B, G, cid, await curKey(G, cid))], [true, true, null, 'member', 'badkey'], 'the members hold the new key; Bob holds no admin secret and is at member level on the server (the cost the owner accepted, D3), and counts nowhere');
    assert.equal(await editSave(A, cid, 'History'), '', 'the owner\'s Edit, then Save');
    A.spy.admins.length = 0;
    await A.run(cid);
    const S1 = keyOf(A, cid, 'a');
    assert.deepEqual([A.spy.admins.length, sameKey(S1, S0), sameKey(S1, F), A.rolesOf(cid).h], [1, false, false, fp(S1, cid)], 'the next open: a fresh admin secret for the signed list, replacing the removal\'s');
    for (const P of [B, G]) await read(P, cid);
    assert.deepEqual([sameKey(await B.verifiedAdmin(await B.sync(cid)), S1), B.S.db.chatLevel(cid), await plantedBy(B, G, cid, await curKey(G, cid)), await lostLevel()], [true, 'admin', 'taken', null], 'Bob holds it, is an admin on the server again and counts again; the removed device\'s old secret still opens nothing');
  });
});

test('137. a signed copy a member\'s device could not check at first sight (the owner\'s directory entry could not be read) is kept unsigned and not remembered as read: the admin it names is refused, and once her entry is there the next read takes the same copy signed', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus');
    await makeChannel(A, cid, ['alice', 'bob', 'gus'], ['bob']);
    await read(A, cid); const R = A.rolesOf(cid).t, iv = (await A.sync(cid)).ometa.iv;
    const doc = G.S.db.doc; G.S.db.doc = (p) => (p === 'directory/alice' ? { get: () => Promise.reject(Object.assign(new Error('offline'), { code: 'offline' })) } : doc(p));   // her entry can't be read on Gus's page
    await read(G, cid);
    assert.deepEqual([G.rolesOf(cid).s, G.rolesOf(cid).a, G.rolesOf(cid).t, G.rolesOf(cid).h, await plantedBy(B, G, cid, await curKey(G, cid))], [0, ['bob'], 0, undefined, 'badkey'], 'first sight with her entry unread: unsigned, no fingerprint, Bob\'s key change refused');
    G.S.db.doc = doc; await G.loadDir(['alice'], true);
    await read(G, cid);
    assert.deepEqual([(await G.sync(cid)).ometa.iv, G.rolesOf(cid).s, G.rolesOf(cid).t, G.rolesOf(cid).hk === A.S.me.sig.x, await plantedBy(B, G, cid, await curKey(G, cid))], [iv, 1, R, true, 'taken'], 'the same copy read again with her entry there: signed, Bob counts');
  });
});

test('138. an admin\'s leave card on a channel whose record the owner\'s page holds unsigned: her open applies the leave (her own key change, the links stopped) but drops no admin and makes no admin secret (no fresh secret for a list she has not verified); after her Edit then Save, which signs the list as it stands, her next open drops the admin who left and makes the secret for the list without them', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus');
    const members = ['alice', 'bob', 'gus'];
    await pre92(A, cid, members, ['bob'], [A, B, G]);
    const m0 = (await A.sync(cid)).ometa, l = await linkOf(A, cid);
    B.S.convs = [{ ...(await B.shown(cid)), id: cid }]; B.S.forgetPointers = () => {}; await B.leaveChat(cid);   // Bob, an admin, leaves: a leave card
    assert.deepEqual(await A.cards(cid), ['bob:leave'], 'his leave card');
    A.spy.admins.length = 0; A.spy.updates.length = 0; A.spy.rotate.length = 0;
    await A.run(cid);
    const c1 = await A.sync(cid), v1 = await A.meta(cid);
    assert.deepEqual([c1.epoch, v1.members, Object.keys(c1.invites || {}), A.spy.admins, ometas(A), c1.ometa.iv === m0.iv, A.rolesOf(cid).a, (await A.shown(cid)).admins], [1, ['alice', 'gus'], [], [], 0, true, ['bob'], ['bob']], 'the leave applied with her key change, the link stopped; no admin secret made, the owner\'s part untouched, Bob still named by the unsigned record');
    assert.equal(await editSave(A, cid, 'History'), '', 'Edit, then Save: the list as it stands, signed');
    assert.deepEqual([(await plainOf(A, cid, (await A.sync(cid)).ometa)).admins, A.rolesOf(cid).s], [['bob'], 1], 'signed naming Bob, who left');
    await A.run(cid);
    const o = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([o.admins, o.ah, A.spy.admins.length, (await A.sync(cid)).epoch], [[], fp(keyOf(A, cid, 'a'), cid), 2, 2], 'her next open: a secret for the signed list, then Bob dropped (the secret replaced again without him, signed), with a key change without him');
    await read(G, cid);
    assert.deepEqual([G.rolesOf(cid).a, G.rolesOf(cid).s, await G.holds(cid, 2)], [[], 1, true], 'Gus takes the signed list without Bob and holds the new key');
  });
});

test('147. adoptOMeta on an unsigned channel record (a channel from before release 92 the owner hasn\'t signed yet) returns before any step (release 93 S3, the early return pinned): the connection\'s level is never asked, nothing is sealed again and the record stays unsigned; sealMeta\'s own refusal (tests 133 and 134) is the layer below this one, so only the count of level reads tells the two apart', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob');
    await pre92(A, cid, ['alice', 'bob'], ['bob'], [A, B]);
    const c = await A.sync(cid), shown = await A.showMeta(c); await A.rolesQ.get(cid);
    assert.deepEqual([A.rolesOf(cid).s, shown._ometa, !!shown._odd, !!shown._stale, !!(await A.adminSecret(c))], [0, true, false, false, true], 'unsigned; the copy opens, is the record\'s own and not stale, and she holds the admin secret: only the strict rule keeps adoptOMeta from going on');
    const real = A.S.db.chatLevel; let asked = 0; A.S.db.chatLevel = (...x) => { asked++; return real(...x); }; A.spy.updates.length = 0;
    try { await A.adoptOMeta(c, shown); } finally { A.S.db.chatLevel = real; }
    assert.deepEqual([asked, ometas(A), (await A.sync(cid)).ometa.iv === c.ometa.iv, A.rolesOf(cid).s], [0, 0, true, 0], 'no step past the early return: the level never asked, no ometa written, the copy and the record as they were');
  });
});

test('150. a left admin is not signed back in by the owner\'s one-time save (release 93b item 11): on a channel whose record her page holds unsigned, admin Bob leaves; her open applies the leave with her key change but keeps his card (she can drop no admin from an unsigned list), and her next open makes no second key change for it; Carl, an admin, adds him back as a subscriber before her save; after her Edit then Save her next open drops him before anything is wrapped: of the admin secrets written in that run none opens for him (Carl opens both), the signed list names Carl alone, Bob holds neither the admin secret nor the new key, and his card is gone', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), C = await w.page('carl'), G = await w.page('gus');
    await pre92(A, cid, ['alice', 'bob', 'carl', 'gus'], ['bob', 'carl'], [A, B, C, G]);
    B.S.convs = [{ ...(await B.shown(cid)), id: cid }]; B.S.forgetPointers = () => {}; await B.leaveChat(cid);   // Bob, an admin, leaves: a leave card
    A.spy.admins.length = 0; A.spy.rotate.length = 0;
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, A.spy.admins, A.rolesOf(cid).s, await A.cards(cid)], [1, ['alice', 'carl', 'gus'], [], 0, ['bob:leave']], 'her open: the leave applied with her key change, no admin dropped and no secret made (unsigned), and his card kept for the drop her save allows');
    await A.run(cid);
    assert.deepEqual([A.spy.rotate.length, (await A.sync(cid)).epoch, await A.cards(cid)], [1, 1, ['bob:leave']], 'her next open: the kept card makes no second key change (the owner\'s any-epoch rule needs a signed record)');
    await C.sync(cid); await C.loadDir(['bob'], true); await C.addSubs(cid, new Set(['bob']));   // another admin adds him back before her save
    assert.deepEqual([[...(await A.meta(cid)).members].sort(), await B.holds(cid, 1)], [['alice', 'bob', 'carl', 'gus'], true], 'Carl added him back: listed and holding the current key');
    const akeys = [], real = A.S.db.setAdmins; A.S.db.setAdmins = async (...a) => { akeys.push(a[1]); return real(...a); };   // every admin secret her page writes from here, as wrapped
    await A.shown(cid);
    assert.equal(await editSave(A, cid, 'History'), '', 'Edit, then Save: the list as it stands, signed');
    assert.deepEqual([(await plainOf(A, cid, (await A.sync(cid)).ometa)).admins, A.rolesOf(cid).s, akeys.length], [['bob', 'carl'], 1, 0], 'signed naming Bob, who left; no secret written yet');
    await A.run(cid);
    const c = await A.sync(cid), o = await plainOf(A, cid, c.ometa), S1 = keyOf(A, cid, 'a');
    assert.deepEqual([o.admins, o.ah, akeys.length, c.epoch, (await A.meta(cid)).members, await A.cards(cid)], [['carl'], fp(S1, cid), 2, 2, ['alice', 'carl', 'gus'], []], 'her next open: a secret for the signed list, then Bob dropped (the secret replaced without him, signed) with a key change without him, and his card gone');
    const opens = async (X, ak) => { const r = await X.adminSecret({ ...(await X.sync(cid)), akeys: ak }); return r ? (sameKey(r, S1) ? 'last' : 'other') : null; };   // whether a wrap in `ak` opens for X, by any key of X's
    assert.deepEqual([await opens(B, akeys[0]), await opens(B, akeys[1]), await opens(C, akeys[0]), await opens(C, akeys[1])], [null, null, 'other', 'last'], 'no admin secret written in that run opens for Bob, at either step; Carl opens both (the first replaced by the last)');
    for (const P of [C, G]) await read(P, cid);
    assert.deepEqual([C.rolesOf(cid).a, G.rolesOf(cid).a, sameKey(await C.verifiedAdmin(await C.sync(cid)), S1), await B.verifiedAdmin(await B.sync(cid)), await B.adminSecret(await B.sync(cid)), await B.holds(cid, 2), await C.holds(cid, 2), await G.holds(cid, 2)], [['carl'], ['carl'], true, null, null, false, true, true], 'Carl and Gus take the signed list without Bob and hold the new key; Bob holds neither the admin secret nor the new key');
  });
});
