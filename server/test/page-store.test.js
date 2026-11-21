// What the page keeps on the device (SPEC.md 12.2), run with the page's own storage block lifted out of app/ui.js
// against a stand-in localStorage. There is no IndexedDB in Node, so the device key takes the fallback path (the key
// next to the blob), which exercises the same sealing; the password lock is run for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const a = src.indexOf('/* ===== HUSH STORE BEGIN ===== */'), b = src.indexOf('/* ===== HUSH STORE END ===== */');
assert.ok(a > 0 && b > a, 'store markers present in app/ui.js');
const build = new Function('localStorage', 'indexedDB', 'addEventListener', 'enc', 'dec', 'b64u', 'unb64u',
  src.slice(a, b) + '\nreturn { ls, lsSecret, PLAIN_KEYS, unlockStore, openSealed, sealOn, sealChange, sealOff, forgetEntries, forgetDevice, mergeSealed, rekeyPending, secSave: () => secSave, SECM: () => SECM, SECK: () => SECK };');

class FakeStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  dump() { return Object.fromEntries(this.m); }
}
const b64u = (u) => Buffer.from(u).toString('base64url');
const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
// A fresh page over the same storage, as a reload gives.
const page = (storage) => build(storage, undefined, undefined, new TextEncoder(), new TextDecoder(), b64u, unb64u);

const IDS = [{ handle: 'alice', ecdhPriv: { d: 'alice-private' }, sigPriv: { d: 'alice-sign' }, own: 'o'.repeat(43) }];
const PLAIN_BEFORE = {
  'hush:ids': JSON.stringify(IDS), 'hush:ks:alice': JSON.stringify({ gX: { 0: 'raw-key-base64' } }), 'hush:login:alice': JSON.stringify({ login: 'alice@example.com' }),
  'hush:draft:alice:gX': JSON.stringify('a half-written message'), 'hush:ptr:alice': JSON.stringify({ gX: ['bob'] }), 'hush:read:alice:gX': '1700000000000',
  'hush:ks:bob': JSON.stringify({ gY: { 0: 'bobs-key' } }), 'hush:inv:gX': JSON.stringify({ iid: 'iNvItE000001', secret: 'link-secret', h: 'alice' }),
  'hush:theme': '"dark"', 'hush:lockAfter': '60000',
};

test('on first start every hush: entry moves into one sealed blob; only the lock settings and the theme stay plain', async () => {
  const st = new FakeStorage(); for (const [k, v] of Object.entries(PLAIN_BEFORE)) st.setItem(k, v);
  const p = page(st);
  assert.deepEqual(p.ls.get('hush:ids', []), [], 'nothing is readable before the store is open');
  await p.unlockStore();
  const left = Object.keys(st.dump()).sort();
  assert.deepEqual(left, ['hush:devkey', 'hush:lockAfter', 'hush:sealed', 'hush:theme'], 'the plain copies are gone');
  const blob = st.getItem('hush:sealed');
  for (const needle of ['alice-private', 'raw-key-base64', 'alice@example.com', 'half-written', 'link-secret', 'bob']) assert.ok(!blob.includes(needle), needle + ' is not in the clear on disk');
  assert.deepEqual(p.ls.get('hush:ids'), IDS);
  assert.equal(p.ls.get('hush:draft:alice:gX'), 'a half-written message');
  assert.equal(p.ls.get('hush:theme'), 'dark', 'plain entries read as before');
  p.ls.set('hush:draft:alice:gX', 'now longer'); p.ls.set('hush:read:alice:gX', 1700000001000); await p.secSave();
  const again = page(st); await again.unlockStore();
  assert.equal(again.ls.get('hush:draft:alice:gX'), 'now longer', 'a reload reads back what was written, from the blob');
  assert.deepEqual(again.ls.get('hush:ids'), IDS);
  assert.equal(Object.keys(st.dump()).length, 4, 'and writes never add plain entries');
});

test('the password lock re-keys the blob; without the password nothing opens, and turning it off never writes plain copies', async () => {
  const st = new FakeStorage(); for (const [k, v] of Object.entries(PLAIN_BEFORE)) st.setItem(k, v);
  const p = page(st); await p.unlockStore();
  await p.sealOn('correct horse battery');
  assert.equal(JSON.parse(st.getItem('hush:applock')).kind, 'pw');
  const locked = page(st);
  await assert.rejects(locked.unlockStore(), 'the device key no longer opens the blob');
  await assert.rejects(locked.openSealed('wrong password'));
  assert.equal(locked.SECM(), null, 'a wrong password changes nothing');
  await locked.openSealed('correct horse battery');
  assert.deepEqual(locked.ls.get('hush:ids'), IDS);
  await locked.sealChange('correct horse battery', 'another good one');
  const next = page(st); await assert.rejects(next.openSealed('correct horse battery')); await next.openSealed('another good one');
  await next.sealOff('another good one');
  assert.equal(st.getItem('hush:applock'), null);
  assert.ok(!Object.keys(st.dump()).some((k) => k.startsWith('hush:ids') || k.startsWith('hush:ks:')), 'turning the lock off keeps everything sealed');
  const open = page(st); await open.unlockStore();
  assert.deepEqual(open.ls.get('hush:ids'), IDS, 'the device key opens it again');
});

test('logging an account out removes its entries and the invite secrets it made; the last account takes the device key with it', async () => {
  const st = new FakeStorage(); for (const [k, v] of Object.entries(PLAIN_BEFORE)) st.setItem(k, v);
  const p = page(st); await p.unlockStore();
  const ownedBy = (k, h) => k === 'hush:ks:' + h || k.endsWith(':' + h) || k.includes(':' + h + ':');
  const n = p.forgetEntries((k, v) => ownedBy(k, 'alice') || (k.startsWith('hush:inv:') && !!v && v.h === 'alice'));
  assert.equal(n, 6); await p.secSave();
  assert.deepEqual(Object.keys(p.SECM()).sort(), ['hush:ids', 'hush:ks:bob'], 'bob\'s chat keys stay; alice\'s keys, login, draft, marks and invite are gone');
  const again = page(st); await again.unlockStore();
  assert.equal(again.ls.get('hush:ks:alice', null), null);
  await again.forgetDevice();
  assert.deepEqual(Object.keys(st.dump()), ['hush:theme'], 'the blob, the device key and the lock settings are gone');
  await again.unlockStore();
  assert.deepEqual(again.ls.get('hush:ids', []), [], 'and a fresh, empty store is ready for the next sign-up');
  again.ls.set('hush:ids', [{ handle: 'carol' }]); await again.secSave();
  const fresh = page(st); await fresh.unlockStore(); assert.deepEqual(fresh.ls.get('hush:ids'), [{ handle: 'carol' }]);
});

// A stand-in IndexedDB: one database with one 'keys' store in a Map; `broken` makes every open fail, as WebKit does when its
// connection to the IndexedDB server is lost after a relaunch (bug 277615).
function fakeIdb(state = { keys: new Map(), broken: false }) {
  return { state, open() { const req = {}; setTimeout(() => {
    if (state.broken) { req.error = new Error('UnknownError'); return req.onerror && req.onerror(); }
    const tx = { objectStore: () => ({ get: (k) => { const g = {}; setTimeout(() => { g.result = state.keys.get(k); g.onsuccess && g.onsuccess(); setTimeout(() => tx.oncomplete && tx.oncomplete()); }); return g; }, put: (v, k) => state.keys.set(k, v) }) };
    req.result = { createObjectStore() {}, transaction: () => tx, close() {} }; req.onsuccess && req.onsuccess(); }); return req; } };
}
const pageIdb = (storage, idb) => build(storage, idb, undefined, new TextEncoder(), new TextDecoder(), b64u, unb64u);

test('a store under the IndexedDB key: a launch whose IndexedDB fails makes no new key and sets nothing aside, and the next launch opens as before', async () => {
  const st = new FakeStorage(); for (const [k, v] of Object.entries(PLAIN_BEFORE)) st.setItem(k, v);
  const idb = fakeIdb(); const p = pageIdb(st, idb); await p.unlockStore();
  assert.deepEqual(Object.keys(st.dump()).sort(), ['hush:lockAfter', 'hush:sealed', 'hush:theme'], 'the key lives in IndexedDB: nothing beside the blob');
  idb.state.broken = true; const dark = pageIdb(st, idb);
  await assert.rejects(dark.unlockStore(), /store/, 'no key answers: the boot is told and offers a retry');
  assert.equal(st.getItem('hush:sealed:old'), null, 'nothing set aside'); assert.equal(st.getItem('hush:devkey'), null, 'no new key');
  idb.state.broken = false; const again = pageIdb(st, idb); await again.unlockStore();
  assert.deepEqual(again.ls.get('hush:ids'), IDS, 'the same store, as before');
  st.setItem('hush:devkey', b64u(globalThis.crypto.getRandomValues(new Uint8Array(32)))); // a key beside the blob left by an earlier fallback, which opens nothing
  idb.state.broken = true; await assert.rejects(pageIdb(st, idb).unlockStore(), /store/, 'a stale key beside the blob does not turn a failed IndexedDB into a re-key');
  assert.equal(st.getItem('hush:sealed:old'), null, 'still nothing set aside');
  idb.state.broken = false; const clean = pageIdb(st, idb); await clean.unlockStore();
  assert.deepEqual(clean.ls.get('hush:ids'), IDS); assert.equal(st.getItem('hush:devkey'), null, 'the stale key beside the blob is dropped once the store is under the IndexedDB key with nothing set aside');
});

test('a store set aside at an earlier boot is kept, and comes back once its accounts are signed in here again: the chat keys this store lacks, under whichever key opens it', async () => {
  const st = new FakeStorage(); for (const [k, v] of Object.entries(PLAIN_BEFORE)) st.setItem(k, v);
  const idb = fakeIdb(); await pageIdb(st, idb).unlockStore(); // the first store, under the IndexedDB key
  st.setItem('hush:sealed:old', st.getItem('hush:sealed')); st.removeItem('hush:sealed'); // as a boot that re-keyed left it
  const fresh = page(st); await fresh.unlockStore(); // no IndexedDB here: the key beside the blob
  assert.deepEqual(fresh.ls.get('hush:ids', []), [], 'an empty store: the one set aside lists an account not signed in here');
  assert.ok(st.getItem('hush:sealed:old'), 'and it is kept');
  fresh.ls.set('hush:ids', [{ handle: 'alice', kv: 1 }]); fresh.ls.set('hush:ks:alice', { gX: { 1: 'new-epoch' } }); await fresh.secSave(); // signed in again: a new device holding the current epoch only
  const back = pageIdb(st, idb); await back.unlockStore(); // both keys answer now: the blob opens with the one beside it, the set-aside store with the IndexedDB key
  assert.deepEqual(back.ls.get('hush:ks:alice'), { gX: { 1: 'new-epoch', 0: 'raw-key-base64' } }, 'the old epoch is back');
  assert.equal(back.ls.get('hush:draft:alice:gX', null), null, 'account records and chat keys come over, nothing else');
  assert.equal(st.getItem('hush:sealed:old'), null, 'merged and dropped');
  assert.equal(st.getItem('hush:devkey'), null, 'the blob is back under the IndexedDB key, so the key beside it goes: a copy of localStorage alone opens nothing');
  const only = pageIdb(st, idb); await only.unlockStore(); assert.deepEqual(only.ls.get('hush:ks:alice'), { gX: { 1: 'new-epoch', 0: 'raw-key-base64' } }, 'and the IndexedDB key alone opens it');
  const st2 = new FakeStorage(); st2.setItem('hush:sealed:old', 'set-aside-earlier'); st2.setItem('hush:sealed', st.getItem('hush:sealed')); // a blob under a key this device lacks, and one set aside already
  await page(st2).unlockStore();
  assert.equal(st2.getItem('hush:sealed:old'), 'set-aside-earlier', 'the first one set aside is never written over'); assert.equal(st2.getItem('hush:sealed:old2'), st.getItem('hush:sealed'), 'the second goes beside it');
});

test('Settings names a set-aside copy while one is kept, and whether it opens with this device\'s key; nothing is shown otherwise', () => {
  const at = src.indexOf('function settingsAdvanced('), st = src.slice(at, src.indexOf('\nfunction openHow(', at));
  assert.match(st, /const old=\[\];try\{for\(const k of \['hush:sealed:old','hush:sealed:old2'\]\)\{const b=localStorage\.getItem\(k\);if\(b\)old\.push\(b\)\}\}catch\{\}/);
  assert.match(st, /if\(old\.length\)\{const p=el\('p','hint','Set-aside data: checking…'\);/, 'only while a copy is kept');
  assert.match(st, /unsealBlob\(SECK,b\)/, 'tried with the store\'s own key');
  assert.match(st, /' does not open on this device':' opens; accounts: '/);
});

test('what stays plain is exactly the lock settings, the theme, the blob and the device\'s banner choice', () => {
  const p = page(new FakeStorage());
  assert.deepEqual([...p.PLAIN_KEYS].sort(), ['hush:applock', 'hush:devkey', 'hush:lockAfter', 'hush:lockFails', 'hush:msgPushDev', 'hush:sealed', 'hush:sealed:old', 'hush:sealed:old2', 'hush:theme']);
  for (const k of ['hush:ids', 'hush:ks:alice', 'hush:inv:gX', 'hush:login:alice', 'hush:phone:alice', 'hush:draft:alice:gX', 'hush:read:alice:gX', 'hush:ptr:alice', 'hush:active', 'hush:serverView', 'hush:list:alice']) assert.equal(p.lsSecret(k), true, k);
});

test('an account\'s newer keys are never written over by a stale copy; a removal record is read as pending only while it has a stage', async () => {
  const st = new FakeStorage(), p = page(st);
  await p.unlockStore();
  const v1 = { handle: 'alice', kv: 1, sigPriv: { d: 'one' } }, v2 = { handle: 'alice', kv: 2, sigPriv: { d: 'two' } };
  p.ls.set('hush:ids', [v2]);
  const stale = [v1, { handle: 'bob', kv: 1 }];
  p.ls.set('hush:ids', stale);                                                 // a tab that still held the old keys writes its list
  assert.equal(p.ls.get('hush:ids')[0].kv, 2, 'the newer keys stay');
  assert.equal(stale[0].kv, 2, 'and the caller\'s own list now holds them too');
  assert.equal(p.ls.get('hush:ids')[1].handle, 'bob', 'other accounts are written as given');
  assert.equal(p.rekeyPending({ stage: 'rotate', rotated: [] }), true);
  assert.equal(p.rekeyPending({ done: Date.now() }), false, 'a finished record is only a done mark');
  assert.equal(p.rekeyPending(null), false);
  assert.equal(p.rekeyPending({}), false);
});

test('mergeSealed: another tab\'s blob brings newer keys, missing chat keys for the accounts this tab lists, and the later removal record', () => {
  const st = new FakeStorage(), p = page(st);
  const mine = { 'hush:ids': [{ handle: 'alice', kv: 1 }], 'hush:ks:alice': { gX: { 0: 'a' } }, 'hush:ks:carol': { gZ: { 0: 'c' } }, 'hush:rekey:alice': { stage: 'notes', at: 100 } };
  const theirs = { 'hush:ids': [{ handle: 'alice', kv: 2 }, { handle: 'bob', kv: 1 }], 'hush:ks:alice': { gX: { 0: 'other', 1: 'a1' }, gY: { 0: 'b' } }, 'hush:ks:bob': { gB: { 0: 'bob' } }, 'hush:ks:carol': { gZ: { 1: 'c1' } }, 'hush:rekey:alice': { done: 200 } };
  p.mergeSealed(mine, theirs);
  assert.equal(mine['hush:ids'][0].kv, 2, 'the newer keys win');
  assert.equal(mine['hush:ids'].length, 1, 'an account this tab does not list is not added');
  assert.deepEqual(mine['hush:ks:alice'], { gX: { 0: 'a', 1: 'a1' }, gY: { 0: 'b' } }, 'chat keys this tab lacks are added, its own kept');
  assert.equal(mine['hush:ks:bob'], undefined, 'no keys for an account this tab does not have');
  assert.deepEqual(mine['hush:ks:carol'], { gZ: { 0: 'c' } }, 'nor for one it logged out of');
  assert.deepEqual(mine['hush:rekey:alice'], { done: 200 }, 'the later done mark replaces a stale record');
  const again = { 'hush:ids': [{ handle: 'alice', kv: 2 }], 'hush:rekey:alice': { done: 200 } };
  p.mergeSealed(again, { 'hush:ids': [{ handle: 'alice', kv: 2 }], 'hush:rekey:alice': { stage: 'notes', at: 100 } });
  assert.deepEqual(again['hush:rekey:alice'], { done: 200 }, 'an older record never brings a finished removal back');
});

test('logging an account out takes its cached chat list with it: ownedBy picks hush:list:<handle> for that handle alone', () => {
  const line = src.match(/^const ownedBy=.*$/m); assert.ok(line, 'ownedBy in app/ui.js');
  const ownedBy = new Function(line[0] + '\nreturn ownedBy;')();
  assert.equal(ownedBy('hush:list:alice', 'alice'), true);
  assert.equal(ownedBy('hush:list:alice', 'al'), false, 'a handle that is a prefix of another');
  assert.equal(ownedBy('hush:list:alice', 'bob'), false);
  assert.equal(ownedBy('hush:draft:alice:gX', 'alice'), true, 'as the drafts and read marks already are');
});

test('another tab replacing this account\'s keys (a device removal) reloads this tab, which still holds the old ones; a write that keeps them reloads nothing, nor does one while this tab runs a removal itself', async () => {
  const st = new FakeStorage(), on = {}, ids = (x, kv) => [{ handle: 'alice', sig: { x, y: 'y' }, kv }];
  st.setItem('hush:ids', JSON.stringify(ids('old', 1)));
  const p = build(st, undefined, (t, f) => { on[t] = f; }, new TextEncoder(), new TextDecoder(), b64u, unb64u); await p.unlockStore();
  const q = page(st); await q.unlockStore();                                   // the other tab, over the same storage
  let reloads = 0;
  globalThis.S = { me: { handle: 'alice', sig: { x: 'old', y: 'y' }, kv: 1 } }; globalThis.location = { reload: () => { reloads++; } };   // what the handler reads of the page
  const tell = async () => { on.storage({ key: 'hush:sealed', newValue: st.getItem('hush:sealed') }); await new Promise((r) => setTimeout(r, 50)); };
  try {
    q.ls.set('hush:draft:alice:gX', 'hello'); await q.secSave(); await tell();
    assert.equal(reloads, 0, 'a write that keeps this account\'s keys: no reload');
    q.ls.set('hush:ids', ids('new', 2)); await q.secSave();
    globalThis.S.rekeying = true; await tell();
    assert.equal(reloads, 0, 'not while this tab runs a removal itself');
    globalThis.S.rekeying = false; await tell();
    assert.equal(reloads, 1, 'its keys replaced in the other tab: this one reloads into them');
  } finally { delete globalThis.S; delete globalThis.location; }
});
