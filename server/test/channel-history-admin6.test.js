// Release 92 (page), private channel history: the admin secret is the owner's (SPEC.md 5.6 "Key chain"; release 92 fix round 3),
// sixth part; the first is channel-history-admin.test.js. The date limit notes a copy dated more than five minutes ahead of the
// page's clock by itself once that clock has caught up (when that is at most another five minutes away), and a change of the
// roles record has the page check its channel's key commits again at once: whether an admin counts is decided at every check,
// never kept, so a page that loads her changed signing key from the directory refuses, from that moment, every admin of a record
// taken under the key before, with no Accept, nothing cleared and no reload; and a copy of hers that did not check out when it
// was read (her removal's, read before the directory brought her new key) is not remembered as read, so the next read notes it.
// This file holds tests 83 to 86; 79 to 82 are in channel-history-admin5.test.js, 88 and 89 in channel-history-admin7.test.js, 91
// and 92 in channel-history-admin8.test.js. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, lift, mkBuild, pageFor } from './channel-history-kit.js';

const LIMIT = 5 * 60e3;   // the date limit (SPEC.md 5.6 "The date limit")
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
// The page's own Accept new code (acceptKey), directory load (loadDir, here dirLoad: the harness keeps its stub under that name,
// which the page's other code calls) and post check (openPost); rewrapFor, dmInfo, indexMsg and noteWake answer for nothing.
const pageBuild = mkBuild([lift('async function acceptKey(', 'async function rewrapFor('),
  lift('async function loadDir(', 'let dirBusy=').replace('async function loadDir(', 'async function dirLoad('), lift('function openPost(', 'async function freshChan('),
  'const rewrapFor=async()=>{},dmInfo=()=>null,indexMsg=()=>{},noteWake=()=>{};Object.assign(S,{acceptKey,dirLoad,openPost,cache:new Map(),warned:new Set(),verified:{}});'].join('\n'));
// The lost device's own copy of the owner's part: sealed under epoch e's key, signed with the account key it still holds.
async function lostCopy(sigPriv, cid, e, raw, x) {
  const sk = await crypto.subtle.importKey('jwk', sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const parts = [cid, String(e), String(x.rt), x.owner, [...x.admins].sort().join(','), x.ah, String(x.at)];
  const rs = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from('hush-roles-v1|' + parts.join('|')))).toString('base64');
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(JSON.stringify({ ...x, rs })))).toString('base64') };
}
const curKey = async (X, cid) => keyOf(X, cid, X.epochOf(await X.sync(cid)));
// B and the server plant the next epoch for X, kept in place: a check of it (sealKey) as X's page makes at each seal, with what it
// keeps checked (S.chanKeys) left as it is, 'badkey' or 'taken'
async function plant(B, X, cid) {
  const cur = await X.sync(cid), e = X.epochOf(cur) + 1, Kp = randomBytes(32), row = await B.chainRow(cid, e, Kp, await curKey(X, cid));
  await X.loadDir([X.handle], true);
  const planted = { ...cur, epoch: e, keys: { ...cur.keys, [e]: await X.wrapAll(Kp, [X.handle], cid, e) } }, doc = X.S.db.doc;
  X.S.db.doc = (p) => (p === 'channels/' + cid + '/chain/' + e ? { get: async () => ({ exists: true, data: () => row }) } : doc(p));
  return async () => { try { const k = await X.sealKey(planted, e); return k && sameKey(k.raw, Kp) ? 'taken' : 'other'; } catch (x) { return x.message; } };
}
// The same, asked once from a clean slate (channel-history-admin5.test.js): the planted key is forgotten after.
async function plantedBy(B, X, cid) {
  const doc = X.S.db.doc, e = X.epochOf(await X.sync(cid)) + 1; X.S.chanKeys.clear();
  try { return await (await plant(B, X, cid))(); } finally { X.S.db.doc = doc; X.ksPut(cid, e, null); X.S.chanKeys.clear(); }
}
const ownChange = (X, cid) => X.shown(cid).then((s) => X.rotateTo(X.S.chatDocs.get(cid), X.metaOf(s)));   // a key change of X's own, from its record
const seal = async (X, cid) => { const c = await X.sync(cid); try { return (await X.sealKey(c, X.epochOf(c))) ? 'ok' : 'none'; } catch (e) { return e.message; } };   // X's check of the current key
// A post P makes under epoch e's key (what the server can show for P, under a key from before the removal).
async function postBy(P, cid, e, text) {
  const k = await crypto.subtle.importKey('raw', keyOf(P, cid, e), 'AES-GCM', false, ['encrypt']), iv = randomBytes(12);
  const p = { from: P.handle, ts: Date.now(), e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, Buffer.from(text))).toString('base64') };
  const sk = await crypto.subtle.importKey('jwk', P.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  p.sig = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from([cid, p.from, p.ts, p.iv, p.ct, p.e].join('|')))).toString('base64');
  return p;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('83. the date limit, by itself: a copy of her list from her other device, whose clock is five minutes and a second and a half fast, is not noted at once, and is noted by itself once this page\'s clock has caught up, with no read again', async () => {
  const O = await pageFor(null, 'olga'), F = await pageFor(null, 'olga', { id: O.id, clock: { skew: LIMIT + 1500 } }), N = await pageFor(null, 'nina');
  const cid = 'cRolesLater01', K = randomBytes(32), rec = (m) => ({ id: cid, type: 'channel', visibility: 'private', epoch: 0, keys: {}, ometa: m });
  N.ksPut(cid, 0, N.b64(K)); N.S.dir.olga = { handle: 'olga', ecdh: O.id.ecdh, sig: O.id.sig, kv: 1 };
  const now = () => { const r = N.rolesOf(cid); return r && [r.a, r.h]; };
  assert.ok(await N.readOMeta(rec(await O.sealOMeta(cid, 0, K, { name: 'R', owner: 'olga', admins: ['yuri'], _ah: 'h0' })))); await N.rolesQ.get(cid);
  assert.deepEqual(now(), [['yuri'], 'h0'], 'her copy, dated by a clock like this one: noted');
  assert.ok(await N.readOMeta(rec(await F.sealOMeta(cid, 0, K, { name: 'R', owner: 'olga', admins: ['yuri', 'zara'], _ah: 'h1' })))); await N.rolesQ.get(cid);
  assert.deepEqual(now(), [['yuri'], 'h0'], 'just over five minutes ahead of this clock: not noted at once');
  await wait(3500); await N.rolesQ.get(cid);
  assert.deepEqual(now(), [['yuri', 'zara'], 'h1'], 'noted by itself once this clock has caught up');
});

test('84. a page whose clock is five minutes and a second and a half slow (Fay\'s): her Make admin (Xena) waits there, and a key change Xena makes meanwhile is refused there; once that clock has caught up her list is noted by itself, and Xena\'s key is taken there with no reload', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), F = await w.page('fay');
    await makeChannel(A, cid, ['alice', 'xena', 'fay'], []);
    for (const P of [A, X, F]) await read(P, cid);
    F.clock.skew = -(LIMIT + 1500);
    await A.shown(cid); await A.setAdmins(cid, ['xena']);
    for (const P of [X, F]) await read(P, cid);
    assert.deepEqual([X.rolesOf(cid).a, F.rolesOf(cid).a], [['xena'], []], 'noted on Xena\'s page, not yet on Fay\'s');
    await ownChange(X, cid);
    assert.equal(await seal(F, cid), 'badkey', 'Xena\'s key change: refused on Fay\'s page meanwhile');
    await wait(3500); await F.rolesQ.get(cid);
    assert.deepEqual(F.rolesOf(cid).a, ['xena'], 'her list: noted by itself once Fay\'s clock has caught up');
    assert.equal(await seal(F, cid), 'ok', 'and Xena\'s key: taken there, with no reload');
  });
});

test('85. a lost owner device, before its removal, signs her list at her record\'s rt plus one naming an outsider (Mallory), which the server shows Fay (who pinned her key) and Gus (who didn\'t) and keeps from her devices: after the removal, a key change Mallory makes, checked on their pages before their directory refresh brings her new key, is taken there (a page kept from her new key can\'t tell); once the page\'s own directory load brings it, both refuse that same key, with nothing cleared, no Accept and no reload', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), F = await w.page('fay', { build: pageBuild }), G = await w.page('gus', { build: pageBuild }), M = await w.page('mallory'); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob', 'fay', 'gus'], ['bob']);
    F.S.pins = { alice: { ecdh: A.id.ecdh, sig: A.id.sig } };   // pinAll: her key as Fay's page first saw it
    for (const P of [A, F, G]) await read(P, cid);
    const m1 = (await A.sync(cid)).ometa, o1 = await plainOf(A, cid, m1);
    const x = { name: o1.name, desc: o1.desc, photo: o1.photo, owner: 'alice', admins: ['bob', 'mallory'], rt: o1.rt + 1, ah: fp(new Uint8Array(randomBytes(32)), cid), at: 1 };
    await A.S.db.doc('channels/' + cid).update({ ometa: await lostCopy(A.S.me.sigPriv, cid, 0, keyOf(A, cid, 0), x) });
    for (const P of [F, G]) await read(P, cid);
    await A.S.db.doc('channels/' + cid).update({ ometa: m1 });
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members: ['alice', 'bob', 'fay', 'gus'] }])).rotated, [{ cid, ok: true }]);
    const checks = [];
    for (const P of [F, G]) { await read(P, cid); checks.push(await plant(M, P, cid)); }
    assert.deepEqual(await Promise.all(checks.map((c) => c())), ['taken', 'taken'], 'before the refresh: taken on both pages');
    for (const P of [F, G]) await P.S.dirLoad(['alice'], true);
    assert.deepEqual(await Promise.all(checks.map((c) => c())), ['badkey', 'badkey'], 'once it has brought her new key: refused on both');
  });
});

test('86. an ordinary device removal, on a page that didn\'t pin her key (Gus\'s): it reads her removal\'s copy, under her new key, before its directory refresh brings that key, so the copy doesn\'t check out there yet; once the page\'s own directory load has brought it, the next read takes it with no reload: Bob\'s key change is taken there, Bob is shown as an admin and his post checks out', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus', { build: pageBuild });
    await makeChannel(A, cid, ['alice', 'bob', 'gus'], ['bob']);
    for (const P of [A, B, G]) await read(P, cid);
    await newKeys(A);
    assert.deepEqual((await removal(A, [{ cid, owner: true, admins: ['bob'], members: ['alice', 'bob', 'gus'] }])).rotated, [{ cid, ok: true }]);
    await read(G, cid);
    assert.equal(G.rolesOf(cid).hk === A.S.me.sig.x, false, 'read before the refresh: not taken');
    await G.S.dirLoad(['alice'], true); await read(G, cid);
    assert.deepEqual([G.rolesOf(cid).a, G.rolesOf(cid).hk === A.S.me.sig.x], [['bob'], true], 'read after it: taken');
    assert.equal(await plantedBy(B, G, cid), 'taken', 'Bob\'s key change: taken');
    const s = await G.shown(cid);
    assert.deepEqual([s.admins, (await G.S.openPost(s, await postBy(B, cid, 0, 'news'))).verified], [['bob'], true], 'Bob shown as an admin, and his post checks out');
  });
});
