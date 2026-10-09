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
  src.slice(a, b) + '\nreturn { ls, lsSecret, PLAIN_KEYS, unlockStore, openSealed, sealOn, sealChange, sealOff, forgetEntries, forgetDevice, secSave: () => secSave, SECM: () => SECM, SECK: () => SECK };');

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

test('what stays plain is exactly the lock settings, the theme and the blob', () => {
  const p = page(new FakeStorage());
  assert.deepEqual([...p.PLAIN_KEYS].sort(), ['hush:applock', 'hush:devkey', 'hush:lockAfter', 'hush:lockFails', 'hush:sealed', 'hush:sealed:old', 'hush:theme']);
  for (const k of ['hush:ids', 'hush:ks:alice', 'hush:inv:gX', 'hush:login:alice', 'hush:phone:alice', 'hush:draft:alice:gX', 'hush:read:alice:gX', 'hush:ptr:alice', 'hush:active', 'hush:serverView']) assert.equal(p.lsSecret(k), true, k);
});
