// Logging in or linking again on a browser that still holds the account must not leave a second device entry for that
// same browser (the "Login and devices" list showed one phone several times). The page's side is heldBy, replacedDev and
// ensureDev in app/crypto.js, lifted out and bound to a stand-in page as rekey.test.js does. A different browser, or any
// entry this browser can't prove is its own key, is never carried over or named for retiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
function lift(from, to) {   // the file's text from one landmark to the next (excluded)
  const a = src.indexOf(from);
  assert.ok(a > 0, `app/crypto.js contains ${JSON.stringify(from)}`);
  const b = src.indexOf(to, a + from.length);
  assert.ok(b > a, `app/crypto.js contains ${JSON.stringify(to)} after ${JSON.stringify(from)}`);
  return src.slice(a, b);
}
const line = (from) => lift(from, '\n');
const SRC = [
  line('const enc=new TextEncoder()'),
  line('const b64=buf=>'), line('const unb64=s=>'), line('const b64u=a=>'), line('const rid=()=>'),
  line('const EC={name:'),
  lift('async function newIdentity(){', 'const jwk=xy=>'),
  line('const sameKeys=(a,b)=>'),
  lift('const devMsg=(h,d)=>', 'async function devKey('),
].join('\n');
const build = new Function('S', 'ls', `${SRC}\nreturn {newIdentity,ensureDev,heldBy,replacedDev,devEntry};`);

function page() {
  const m = new Map();
  const ls = { get: (k, d) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : d), set: (k, v) => { if (v == null) m.delete(k); else m.set(k, JSON.parse(JSON.stringify(v))); } };
  const S = { me: null, ids: [] };
  return Object.assign(build(S, ls), { S, ls });
}
const ident = async (pg, handle) => ({ handle, name: handle, kv: 1, ...(await pg.newIdentity()) });
const KEYS = ['ecdhPriv', 'ecdh', 'sigPriv', 'sig', 'kv'];
const again = (id) => ({ handle: id.handle, name: id.name, ...structuredClone(Object.fromEntries(KEYS.map((f) => [f, id[f]]))) });   // the same account, as a login or restore hands it back: no device key

test('logging in again where the account still is keeps this browser\'s device key: one device, not two', async () => {
  const pg = page(), me = await ident(pg, 'alice');
  const d = await pg.ensureDev(me);
  me.trust = ['otherdev1'];
  const back = again(me);
  assert.equal(pg.heldBy(back), me);
  const d2 = await pg.ensureDev(back);
  assert.equal(d2.id, d.id, 'the same device id');
  assert.equal(d2.ecdh.x, d.ecdh.x, 'the same device key');
  assert.equal(d2.s, d.s, 'its signature still stands');
  assert.deepEqual(back.trust, ['otherdev1']);
  assert.deepEqual(pg.S.ids, [back], 'one record for the account');
  assert.equal(pg.ls.get('hush:ids')[0].dev.id, d.id, 'and saved');
});

test('a fresh browser, or keys that moved on, still gets a new device', async () => {
  const pg = page(), me = await ident(pg, 'alice');
  const d = await pg.ensureDev(me);
  const other = page(), elsewhere = again(me);
  assert.notEqual((await other.ensureDev(elsewhere)).id, d.id, 'another browser holds nothing to carry');
  const moved = again(me); moved.kv = 2;
  assert.equal(pg.heldBy(moved), null, 'a newer key version: nothing carries');
  const someoneElse = await ident(pg, 'alice');
  assert.equal(pg.heldBy(someoneElse), null, 'different account keys under the same name: nothing carries');
  assert.notEqual((await pg.ensureDev(someoneElse)).id, d.id);
});

test('linked again here: only this browser\'s own entry, with exactly its keys, is named for retiring', async () => {
  const pg = page(), me = await ident(pg, 'alice');
  const old = await pg.ensureDev(me);
  const linked = again(me); linked.dev = await page().ensureDev(again(me));   // the key a link made, in another page's state so this one's record stays
  const devs = { [old.id]: pg.devEntry(old), [linked.dev.id]: pg.devEntry(linked.dev), phone2abcdef: { x: 'a', y: 'b', sx: 'c', sy: 'd', s: 'e', by: '' } };
  assert.equal(pg.replacedDev(me, linked, devs), old.id);
  assert.equal(pg.replacedDev(null, linked, devs), null, 'nothing held here: nothing retired');
  assert.equal(pg.replacedDev(me, linked, { ...devs, [old.id]: { ...devs[old.id], x: 'someone elses key' } }), null, 'an entry under that id with other keys is not this browser\'s');
  assert.equal(pg.replacedDev(me, linked, { ...devs, kid123456: { x: 'a', y: 'b', sx: 'c', sy: 'd', s: 'e', by: old.id } }), null, 'a device added from it would lose its voucher: it stays for Remove');
  assert.equal(pg.replacedDev(me, { ...linked, dev: old }, devs), null, 'the same key carried over: nothing to retire');
  assert.equal(pg.replacedDev({ ...me, handle: 'bob' }, linked, devs), null, 'another account');
});
