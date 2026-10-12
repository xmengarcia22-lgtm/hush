// Release 21 (SPEC.md 14.15): removing a lost device gives the account new keys. The page's side of that is the HUSH
// REKEY block in app/crypto.js and the helpers it changed (the old keys kept as `prev`, a signature checked against a
// key's history, a DM's first secret kept so its history stays readable, the vault's alias for a DM), and in
// app/adapter.js a chat opened with several keys tried in order. The crypto is lifted out of the page and bound to a
// stand-in page; the adapter runs against a real server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';
import { startServer, sleep, makeIdentity, directoryDoc, signText, cap, dmDoc, DMID, CID, PID, appSource } from './helpers.js';

const src = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
function lift(from, to) {   // the file's text from one landmark to the next (excluded), or to its end
  const a = src.indexOf(from);
  assert.ok(a > 0, `app/crypto.js contains ${JSON.stringify(from)}`);
  if (to === undefined) return src.slice(a);
  const b = src.indexOf(to, a + from.length);
  assert.ok(b > a, `app/crypto.js contains ${JSON.stringify(to)} after ${JSON.stringify(from)}`);
  return src.slice(a, b);
}
const line = (from) => lift(from, '\n');
const SRC = [
  line('const enc=new TextEncoder()'),
  line('const b64=buf=>'), line('const unb64=s=>'), line('const b64u=a=>'), line('const unb64u=s=>'), line('const rid=()=>'), line('const hexOf=b=>'),
  line('const EC={name:'),
  lift('async function newIdentity(){', 'const jwk=xy=>'),
  line('const jwk=xy=>'), line('async function pubKey('), line('async function myKey('),
  lift('async function aesKeyFrom(bits,salt){', 'async function aesKey('), line('async function aesKey('),
  lift('const devMsg=(h,d)=>', 'async function devKey('),
  lift('const ksKey=()=>', '/* "Message backup"'),
  lift('async function vaultPath(handle){', 'const backupPaths='),
  lift('const dmIds=new Map();', '/* Key wraps:'),
  line('const rid22='), lift('const devCache=new Map();', 'async function publishDev('),
  lift('const wrapSalt=', 'async function unwrapMine('),
  lift('async function hkdf(ikm,salt,info){', 'async function adminCapFrom('),
  line('async function ownerCap('),
  lift('async function ownTok(cid,pid,k){', 'const ownHash='), line('const ownHash='),
  line('const dirMiss=new Map()'),
  lift('async function senderKeys(h){', 'async function sideOk('),
  lift('async function sideOk(', 'const unsealCache='),
  line('function peerKeys(h){'),
  lift('/* ===== HUSH REKEY BEGIN ===== */', '/* ===== HUSH REKEY END ===== */'),
  line('const PTR_SALT='),
  lift('async function openPointer(d){'),
].join('\n');
const EXPORTS = 'enc,b64,unb64,b64u,EC,DS,newIdentity,OWN_RE,pubKey,devMsg,ensureDev,ksGet,vaultPath,dmIds,dmSecret,dmIdFor,wrapTo,memberCapFrom,ownerCap,ownTok,ownHash,sideOk,'
  + 'wrapKey,wrapAll,verifiedDevs,REKEY_SKEW,REKEY_KEEP_MS,rekeyIdentity,unrekeyIdentity,trimPrev,prevSigsOf,verifyBy,ownTokAs,ownTokFor,vaultPathOf,vaultKeyOf,dmBaseBits,dmBaseCapOld,PTR_SALT,openPointer';
const build = new Function('S', 'ls', 'scheduleBackup', 'loadDir', 'validHandle', 'typeOf', 'dmPeer', 'dmInfo', 'keyChanged', `${SRC}\nreturn {${EXPORTS}};`);

// One page's worth of state, with the few ui.js names the lifted code reaches for standing in.
function page() {
  const m = new Map();
  const ls = { get: (k, d) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : d), set: (k, v) => { if (v == null) m.delete(k); else m.set(k, JSON.parse(JSON.stringify(v))); } };
  const S = { me: null, dir: {}, pins: {}, keys: new Map(), chanKeys: new Map(), prefs: null, contactsReady: false, ids: [], dmPeers: {}, convs: [] };
  const typeOf = (c) => (c && c.type) || 'channel';
  const dmPeer = (c) => (c.members || []).find((h) => h !== S.me.handle) || S.dmPeers[c.id] || S.me.handle;
  const dmInfo = (cid) => (S.prefs && S.prefs.dms && S.prefs.dms[cid]) || null;
  const changed = new Set();   // handles whose directory key differs from the pinned one (the page's keyChanged)
  const pg = build(S, ls, () => {}, async () => {}, (h) => /^[a-z0-9_]{3,20}$/.test(h), typeOf, dmPeer, dmInfo, (h) => changed.has(h));
  return Object.assign(pg, { S, ls, changed });
}
const ident = async (pg, handle) => ({ handle, name: handle, kv: 1, ...(await pg.newIdentity()) });
const KEYS = ['ecdhPriv', 'ecdh', 'sigPriv', 'sig', 'own', 'kv'];
const pick = (id) => Object.fromEntries(KEYS.map((f) => [f, structuredClone(id[f])]));
const sign = async (pg, sigPriv, data) => pg.b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await crypto.subtle.importKey('jwk', sigPriv, pg.DS, false, ['sign']), data));
const forgetKeys = (pg) => { pg.S.keys.clear(); pg.S.chanKeys.clear(); pg.S._vp = null; pg.dmIds.clear(); };   // what the page does once the keys changed: its caches are by handle
const aged = (pg, me) => { me.prev.until = Date.now() - pg.REKEY_KEEP_MS - 1; pg.trimPrev(me); };            // thirty days later

test('rekeyIdentity: new keys and kv+1 in place, the old ones kept under prev', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const old = pick(me), t0 = Date.now();
  const r = await pg.rekeyIdentity(me);
  assert.equal(r, me);
  assert.equal(pg.S.me, me, 'the same object: S.me still is the account');
  assert.equal(me.kv, 2);
  for (const f of ['ecdhPriv', 'ecdh', 'sigPriv', 'sig', 'own']) assert.notDeepEqual(me[f], old[f], f + ' is new');
  assert.match(me.own, pg.OWN_RE);
  assert.equal(me.ecdhPriv.x, me.ecdh.x, 'the new pairs match');
  assert.equal(me.sigPriv.x, me.sig.x);
  assert.ok(me.prev.until >= t0 && me.prev.until <= Date.now());
  assert.deepEqual(pick(me.prev), old, 'prev holds the old private keys, own and kv');
});

test('an account from before `own` existed: prev.own is the signing key\'s d, so its old tokens still come out', async () => {
  const pg = page(), me = await ident(pg, 'alice'); delete me.own; pg.S.me = me;
  const d = me.sigPriv.d, tok = await pg.ownTok(CID, PID, 0);
  await pg.rekeyIdentity(me);
  assert.equal(me.prev.own, d);
  assert.notEqual(me.own, d);
  assert.equal(await pg.ownTokAs({ own: me.prev.own, sigPriv: me.prev.sigPriv }, CID, PID, 0), tok);
  assert.notEqual(await pg.ownTok(CID, PID, 0), tok, 'new messages get tokens from the new secret');
  assert.equal(await pg.ownTokFor(CID, { _id: PID, on: 0, oh: await pg.ownHash(tok) }), tok);
});

test('unrekeyIdentity puts the old keys back exactly and drops prev', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const old = pick(me);
  await pg.rekeyIdentity(me);
  pg.unrekeyIdentity(me);
  assert.deepEqual(pick(me), old);
  assert.equal('prev' in me, false);
});

test('trimPrev forgets the old private parts after 30 days, never the public key and its date', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  await pg.rekeyIdentity(me);
  const sig = { ...me.prev.sig };
  pg.trimPrev(me);
  assert.ok(me.prev.ecdhPriv && me.prev.sigPriv && me.prev.own, 'fresh: everything kept');
  me.prev.until = Date.now() - pg.REKEY_KEEP_MS + 60_000;
  pg.trimPrev(me);
  assert.ok(me.prev.ecdhPriv, 'a minute before the 30 days are up: kept');
  aged(pg, me);
  assert.equal(me.prev.ecdhPriv, undefined);
  assert.equal(me.prev.sigPriv, undefined);
  assert.ok(me.prev.own, 'the old ownership secret stays: messages from before answer to it, and the lost device has it anyway');
  assert.deepEqual(me.prev.sig, sig);
  assert.equal(me.prev.kv, 1);
  assert.equal(typeof me.prev.until, 'number');
  pg.trimPrev({ handle: 'bob' });   // an account whose keys never changed
});

test('this device\'s entry is signed again with the new account key', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const d = await pg.ensureDev(me), oldSig = me.sig, oldS = d.s;
  await pg.rekeyIdentity(me);
  d.by = ''; d.forSig = '';
  await pg.ensureDev(me);
  assert.notEqual(d.s, oldS);
  assert.equal(d.forSig, me.sig.x);
  const verify = async (xy) => crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await pg.pubKey(xy, 's'), pg.unb64(d.s), pg.devMsg('alice', d));
  assert.equal(await verify(me.sig), true, 'under the new key');
  assert.equal(await verify(oldSig), false, 'not under the old one');
  assert.equal(pg.ls.get('hush:ids')[0].dev.s, d.s, 'and saved');
});

test('verifyBy: the current key, or one from the profile\'s history while the thing is dated before that key stopped', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const bobOld = await pg.newIdentity(), bobNew = await pg.newIdentity(), until = Date.now() - 3600e3, ts = until - 1000;
  pg.S.dir.bob = { handle: 'bob', ecdh: bobNew.ecdh, sig: bobNew.sig, kv: 2, prev: [{ sig: bobOld.sig, until }] };
  const parts = [DMID, 'pin', '0', String(ts)], data = pg.enc.encode('hush-svc-v1|' + parts.join('|'));
  const sgNew = await sign(pg, bobNew.sigPriv, data), sgOld = await sign(pg, bobOld.sigPriv, data);
  assert.equal(await pg.verifyBy('bob', sgNew, data), true);
  assert.equal(await pg.verifyBy('bob', sgNew, data, ts, true), true);
  assert.equal(await pg.verifyBy('bob', sgOld, data), false, 'an old signature on its own');
  assert.equal(await pg.verifyBy('bob', sgOld, data, ts, false), false, 'allowPrev not given');
  assert.equal(await pg.verifyBy('bob', sgOld, data, ts, true), 'prev', 'dated before the change: true enough to show, marked as by an old key');
  assert.equal(await pg.verifyBy('bob', sgOld, data, until + pg.REKEY_SKEW, true), 'prev', 'within the clock skew');
  assert.equal(await pg.verifyBy('bob', sgOld, data, until + pg.REKEY_SKEW + 1, true), false, 'dated after the change');
  assert.equal(await pg.verifyBy('bob', sgOld, data, 0, true), false, 'no date');
  assert.equal(await pg.verifyBy('bob', sgOld, data, undefined, true), false);
  assert.equal(await pg.verifyBy('bob', sgOld, data, String(ts), true), false, 'a date that is not a number');
  assert.equal(await pg.verifyBy('bob', sgOld, pg.enc.encode('other'), ts, true), false, 'other data');
  assert.equal(await pg.verifyBy('bob', 'not base64!', data, ts, true), false);
  assert.equal(await pg.verifyBy('bob', '', data, ts, true), false);
  assert.equal(await pg.verifyBy('bob', null, data, ts, true), false);
  assert.equal(await pg.verifyBy('carol', sgOld, data, ts, true), false, 'nobody known');
  pg.S.dir.bob.prev = [{ sig: 'junk', until }, { sig: bobOld.sig, until: 'soon' }, null, { sig: bobOld.sig, until }];
  assert.deepEqual(pg.prevSigsOf('bob'), [{ sig: bobOld.sig, until }], 'malformed history entries are skipped');
  assert.equal(await pg.verifyBy('bob', sgOld, data, ts, true), 'prev');
  // sideOk is the same check over a labelled message; without a date and allowPrev it is the current key only
  assert.equal(await pg.sideOk('bob', sgOld, 'hush-svc-v1', parts, ts, true), 'prev');
  assert.equal(await pg.sideOk('bob', sgOld, 'hush-svc-v1', parts), false);
  assert.equal(await pg.sideOk('bob', sgNew, 'hush-svc-v1', parts), true);
});

test('verifyBy: this device\'s own old key counts too, from S.me.prev, and its public half outlives the private parts', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const data = pg.enc.encode('hello'), sgOld = await sign(pg, me.sigPriv, data);
  await pg.rekeyIdentity(me); forgetKeys(pg);
  const sgNew = await sign(pg, me.sigPriv, data);
  assert.equal(await pg.verifyBy('alice', sgNew, data), true);
  assert.equal(await pg.verifyBy('alice', sgOld, data), false);
  assert.equal(await pg.verifyBy('alice', sgOld, data, me.prev.until, true), 'prev');
  assert.equal(await pg.verifyBy('alice', sgOld, data, me.prev.until + pg.REKEY_SKEW + 1, true), false);
  assert.deepEqual(pg.prevSigsOf('alice'), [{ sig: me.prev.sig, until: me.prev.until }]);
  aged(pg, me);
  assert.equal(await pg.verifyBy('alice', sgOld, data, me.prev.until, true), 'prev');
  pg.S.dir.alice = { handle: 'alice', ecdh: me.ecdh, sig: me.sig, kv: 2, prev: [{ sig: me.prev.sig, until: me.prev.until }] };
  assert.equal(pg.prevSigsOf('alice').length, 2, 'the server\'s history and this device\'s memory, both');
});

test('ownTokFor: a message sealed before the change answers to the old secret, a new one to the new', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const oldTok = await pg.ownTok(CID, PID, 0), oldTok3 = await pg.ownTok(CID, PID, 3);
  await pg.rekeyIdentity(me);
  const newTok = await pg.ownTok(CID, PID, 0);
  assert.notEqual(newTok, oldTok);
  assert.equal(await pg.ownTokAs(me, CID, PID, 0), newTok);
  assert.equal(await pg.ownTokAs({ own: me.prev.own, sigPriv: me.prev.sigPriv }, CID, PID, 0), oldTok);
  assert.equal(await pg.ownTokFor(CID, { _id: PID, on: 0, oh: await pg.ownHash(oldTok) }), oldTok);
  assert.equal(await pg.ownTokFor(CID, { id: PID, on: 0, oh: await pg.ownHash(newTok) }), newTok);
  assert.equal(await pg.ownTokFor(CID, { _id: PID, on: 3, oh: await pg.ownHash(oldTok3) }), oldTok3, 'the use count is part of it');
  assert.equal(await pg.ownTokFor(CID, { _id: PID, on: 0, oh: await pg.ownHash('somebody else\'s') }), newTok, 'neither: the current one');
  assert.equal(await pg.ownTokFor(CID, { _id: PID }), newTok, 'a post without a fingerprint');
  aged(pg, me);
  assert.equal(await pg.ownTokFor(CID, { _id: PID, on: 0, oh: await pg.ownHash(oldTok) }), oldTok, 'after 30 days the old secret still answers: my messages from before stay mine to edit');
});

test('vaultPathOf and vaultKeyOf work for any identity; the current account\'s vault address is what it always was', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  // the derivation as the page has always done it, worked out here by hand
  const priv = await crypto.subtle.importKey('jwk', me.ecdhPriv, pg.EC, false, ['deriveBits']);
  const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: me.ecdh.x, y: me.ecdh.y, ext: true }, pg.EC, true, []);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));
  const want = 'vault/v' + pg.b64u(await crypto.subtle.digest('SHA-256', new Uint8Array([...bits, ...pg.enc.encode('hush-vault-id:alice')]))).slice(0, 32);
  assert.equal(await pg.vaultPathOf(me), want);
  assert.equal(await pg.vaultPath('alice'), want);
  const aad = pg.enc.encode('vault|alice'), iv = new Uint8Array(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await pg.vaultKeyOf(me), pg.enc.encode('{"contacts":[]}'));
  await pg.rekeyIdentity(me); forgetKeys(pg);
  const after = await pg.vaultPathOf(me);
  assert.match(after, /^vault\/v[A-Za-z0-9_-]{32}$/);
  assert.notEqual(after, want, 'new keys, new address');
  assert.equal(await pg.vaultPath('alice'), after);
  const old = { handle: 'alice', ecdhPriv: me.prev.ecdhPriv, ecdh: me.prev.ecdh };
  assert.equal(await pg.vaultPathOf(old), want, 'the old identity still names the old vault');
  assert.equal(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, await pg.vaultKeyOf(old), ct)), '{"contacts":[]}');
  await assert.rejects(crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad }, await pg.vaultKeyOf(me), ct), 'the new key does not open the old vault');
});

test('dmBaseBits keeps a DM\'s first secret in the key store and goes on giving it after either side\'s keys change', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const bob = await pg.newIdentity(); pg.S.dir.bob = { handle: 'bob', ecdh: bob.ecdh, sig: bob.sig, kv: 1 };
  const c = { id: await pg.dmIdFor('bob'), type: 'dm', epoch: 0, members: ['alice', 'bob'] };   // a real DM id: the one its secret gives
  const bits = await pg.dmBaseBits(c);
  assert.deepEqual([...bits], [...(await pg.dmSecret('bob'))]);
  const stored = pg.ksGet(c.id, 'b');
  assert.equal(stored, pg.b64(bits));
  assert.match(stored, /^[A-Za-z0-9+/=]{40,48}$/, 'the shape mergeKeys keeps when backups merge');
  assert.equal(pg.ksGet(DMID, 'b'), null, 'a chat whose id does not derive from the secret keeps nothing: that secret is not the one it began with');
  await pg.dmBaseBits({ ...c, id: DMID });
  assert.equal(pg.ksGet(DMID, 'b'), null);
  assert.equal(pg.ls.get('hush:ks:alice')[c.id].b, stored, 'saved with the other chat keys');
  assert.equal(await pg.dmBaseCapOld(c), null, 'nothing changed yet');
  await pg.rekeyIdentity(me); forgetKeys(pg);
  assert.notDeepEqual([...(await pg.dmSecret('bob'))], [...bits], 'the account keys give another secret now');
  assert.deepEqual([...(await pg.dmBaseBits(c))], [...bits], 'the chat keeps its first one');
  const oldCap = await pg.dmBaseCapOld(c);
  assert.equal(oldCap, await pg.memberCapFrom(c.id, 0, bits));
  assert.notEqual(oldCap, await pg.memberCapFrom(c.id, 0, await pg.dmSecret('bob')));
  // the other side: bob's keys change under alice
  const pg2 = page(), me2 = await ident(pg2, 'alice'); pg2.S.me = me2; pg2.S.dir.bob = { handle: 'bob', ecdh: bob.ecdh, sig: bob.sig, kv: 1 };
  const c2 = { ...c, id: await pg2.dmIdFor('bob') }, b2 = await pg2.dmBaseBits(c2);
  assert.equal(await pg2.dmBaseCapOld(c2), null);
  const bob2 = await pg2.newIdentity(); pg2.S.dir.bob = { handle: 'bob', ecdh: bob2.ecdh, sig: bob2.sig, kv: 2 };
  assert.deepEqual([...(await pg2.dmBaseBits(c2))], [...b2]);
  assert.equal(await pg2.dmBaseCapOld(c2), await pg2.memberCapFrom(c2.id, 0, b2));
  assert.equal(await pg2.dmBaseCapOld({ id: 'd' + 'B'.repeat(22), type: 'dm', members: ['alice', 'bob'] }), null, 'a DM never opened here has no old key');
  assert.equal(await pg.dmBaseBits({ id: 'd' + 'C'.repeat(22), type: 'dm', members: ['alice', 'carol'] }), null, 'no keys for the peer: nothing to keep');
});

test('dmIdFor: the vault\'s alias for a DM, or the chat already listed, wins over the derived address once the vault is in', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const bob = await pg.newIdentity(); pg.S.dir.bob = { handle: 'bob', ecdh: bob.ecdh, sig: bob.sig, kv: 1 };
  const derived = await pg.dmIdFor('bob');
  assert.match(derived, /^d[A-Za-z0-9_-]{22}$/);
  assert.equal(pg.dmIds.has('bob'), false, 'not remembered before the vault is in');
  assert.equal(pg.S.dmPeers[derived], 'bob');
  const alias = 'd' + 'Z'.repeat(22);
  pg.S.prefs = { dms: { [alias]: { peer: 'bob' }, ['d' + 'Y'.repeat(22)]: { peer: 'carol' }, bad: { peer: 'bob' } } };
  assert.equal(await pg.dmIdFor('bob'), derived, 'the vault is not in yet');
  pg.S.contactsReady = true;
  assert.equal(await pg.dmIdFor('bob'), alias);
  assert.equal(pg.dmIds.get('bob'), alias, 'remembered');
  assert.equal(pg.S.dmPeers[alias], 'bob');
  assert.equal(await pg.dmIdFor('dave'), null, 'nobody known, no alias');
  pg.dmIds.clear(); pg.S.prefs = { dms: { bad: { peer: 'bob' } } };
  assert.equal(await pg.dmIdFor('bob'), derived, 'an alias of the wrong shape is ignored');
  const listed = 'd' + 'L'.repeat(22);
  pg.dmIds.clear(); pg.S.convs = [{ id: CID, type: 'group', members: ['alice', 'bob'] }, { id: listed, type: 'dm', members: ['alice', 'bob'] }];
  assert.equal(await pg.dmIdFor('bob'), listed);
  pg.dmIds.clear(); pg.S.convs = []; pg.S.prefs = null;
  const self = await pg.dmIdFor('alice');
  assert.match(self, /^d[A-Za-z0-9_-]{22}$/);
  assert.notEqual(self, derived);
  // after the keys change the derivation would name a chat that does not exist; the alias keeps the one that does
  pg.dmIds.clear(); pg.S.prefs = { dms: { [derived]: { peer: 'bob' } } };
  await pg.rekeyIdentity(me); forgetKeys(pg);
  assert.equal(await pg.dmIdFor('bob'), derived);
  pg.dmIds.clear(); pg.S.prefs = null;
  assert.notEqual(await pg.dmIdFor('bob'), derived, 'without it the derivation moves');
});

test('openPointer: a note sealed to the old key still opens for 30 days', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const note = (o) => pg.wrapTo(pg.enc.encode(JSON.stringify(o)), pg.S.me.ecdh, pg.PTR_SALT('alice'));
  const old = await note({ t: 'dm', cid: DMID, from: 'bob', to: 'alice' }), bad = await note({ t: 'dm', cid: 'nope' });
  assert.equal((await pg.openPointer(old)).cid, DMID);
  await pg.rekeyIdentity(me); forgetKeys(pg);
  const fresh = await note({ t: 'invite', cid: CID, from: 'bob', to: 'alice' });
  assert.equal((await pg.openPointer(fresh)).cid, CID, 'to the new key');
  assert.equal((await pg.openPointer(old)).cid, DMID, 'to the old key: opened with prev');
  await assert.rejects(pg.openPointer(bad), /format/, 'a note that opens but names no chat is still refused');
  await assert.rejects(pg.openPointer(await pg.wrapTo(pg.enc.encode('{}'), (await pg.newIdentity()).ecdh, pg.PTR_SALT('alice'))), 'somebody else\'s note');
  aged(pg, me);
  await assert.rejects(pg.openPointer(old), 'after 30 days the old key is gone');
});

// ---- the adapter: several keys for one chat, and what the sign-in reply says ----
const BEGIN = '/* ===== HUSH ADAPTER BEGIN ===== */', END = '/* ===== HUSH ADAPTER END ===== */';
const html = appSource(), ab = html.indexOf(BEGIN), ae = html.indexOf(END);
assert.ok(ab > 0 && ae > ab, 'adapter markers present in the page\'s files');
const createHushAdapter = new Function(html.slice(ab + BEGIN.length, ae) + '\nreturn createHushAdapter;')();
const proofFor = (id) => ({ h: id.handle, pub: id.sig, dev: '', signDev: null, signAcct: (m) => signText(id.sigKey, m) });

test('the adapter opens a chat with the first of several keys that works, reports the key version it was proven against, and says when a sign-in is refused', async () => {
  const S = await startServer({ authz: 'standard' });
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob');
  const caps = { m: cap() }, sent = [], kvs = [], denied = [];
  class CountingWS extends WebSocket { send(data) { const f = JSON.parse(data); if (f.op === 'chat.open') sent.push(f.cap); return super.send(data); } }
  const owner = createHushAdapter(S.url, { WebSocket, caps: async () => caps.m, onKv: (kv) => kvs.push(kv) });
  let list = [cap(), cap(), caps.m];
  const member = createHushAdapter(S.url, { WebSocket: CountingWS, caps: async () => list });
  const late = createHushAdapter(S.url, { WebSocket, onDenied: (e) => denied.push(e.code) });
  try {
    await Promise.all([owner.ready, member.ready, late.ready]);
    await owner.prove(proofFor(alice)); await owner.doc('directory/alice').set(directoryDoc(alice));
    assert.deepEqual(kvs, [1], 'the prove reply carries kv');
    assert.equal(owner.kv, 1);
    await member.prove(proofFor(bob)); await member.doc('directory/bob').set(directoryDoc(bob));
    await owner.createChat(DMID, dmDoc(), caps);
    const seen = [];
    member.collection(`channels/${DMID}/posts`).orderBy('ts', 'desc').limit(50).onSnapshot((s) => seen.push(s.docs.length), () => seen.push('err'));
    await sleep(300);
    assert.deepEqual(seen, [0]);
    assert.equal(member.chatLevel(DMID), 'member');
    assert.deepEqual(sent, list, 'each key tried in order, the wrong ones refused');
    sent.length = 0;
    await member.doc(`channels/${DMID}/posts/${PID}`).get();
    assert.deepEqual(sent, [], 'the key already held is among those offered: no round trip');
    list = [null, '', caps.m, caps.m, cap()]; sent.length = 0;
    assert.equal(await member.reopen(DMID), true);
    assert.deepEqual(sent, [caps.m], 'blanks and repeats dropped; the right key first: one open');
    list = [cap(), cap()]; sent.length = 0;
    assert.equal(await member.refreshChat(DMID), false);
    assert.equal(member.chatLevel(DMID), null, 'none of them opens it');
    assert.deepEqual(sent, list);
    list = caps.m;
    assert.equal(await member.refreshChat(DMID), true, 'one key as a string, as before');
    list = null;
    assert.equal(await member.refreshChat(DMID), false, 'no key at all');
    // the new calls exist and reach the server (a DM at epoch 0 has nothing to re-base, and no owner)
    await assert.rejects(owner.rebaseChat(DMID, cap()), (e) => e.code === 'denied');
    await assert.rejects(owner.setOwner(DMID, cap()), (e) => e.code === 'denied');
    // a sign-in the server refuses is reported, so the page can look whether the account's keys moved on
    await assert.rejects(late.prove({ h: 'alice', pub: bob.sig, dev: '', signDev: null, signAcct: (m) => signText(bob.sigKey, m) }), (e) => e.code === 'denied');
    assert.deepEqual(denied, ['denied']);
    assert.equal(late.identityError.code, 'denied');
  } finally { owner.close(); member.close(); late.close(); await S.stop(); }
});

test('prevSigsOf: for someone whose key this device pinned, only the keys it pinned before count, never the server\'s history', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const bobOld = await pg.newIdentity(), bobNew = await pg.newIdentity(), other = await pg.newIdentity(), until = Date.now() - 3600e3, ts = until - 1000;
  const parts = [DMID, 'pin', '0', String(ts)], data = pg.enc.encode('hush-svc-v1|' + parts.join('|'));
  const sgOld = await sign(pg, bobOld.sigPriv, data), sgOther = await sign(pg, other.sigPriv, data);
  pg.S.dir.bob = { handle: 'bob', ecdh: bobNew.ecdh, sig: bobNew.sig, kv: 2, prev: [{ sig: other.sig, until }] };   // a server naming a key Bob never had
  pg.S.pins.bob = { ecdh: bobNew.ecdh, sig: bobNew.sig, prev: [{ sig: bobOld.sig, until }] };                        // what this device accepted before
  assert.equal(await pg.verifyBy('bob', sgOld, data, ts, true), 'prev', 'the key pinned before');
  assert.equal(await pg.verifyBy('bob', sgOther, data, ts, true), false, 'the server\'s word alone is not enough for a pinned contact');
  delete pg.S.pins.bob;
  assert.equal(await pg.verifyBy('bob', sgOther, data, ts, true), 'prev', 'for someone never pinned, the profile\'s history is all there is');
});

test('wrapKey: nothing is wrapped to a contact whose key changed and was not accepted here', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me;
  const bob = await pg.newIdentity(), raw = crypto.getRandomValues(new Uint8Array(32));
  pg.S.dir.alice = { handle: 'alice', ecdh: me.ecdh, sig: me.sig, kv: 1 };
  pg.S.dir.bob = { handle: 'bob', ecdh: bob.ecdh, sig: bob.sig, kv: 2 };
  assert.equal(Object.keys(await pg.wrapKey(raw, 'bob', DMID, 0)).length, 1, 'accepted (or never pinned): one wrap, to the account key for a profile without devices');
  pg.changed.add('bob');
  assert.deepEqual(await pg.wrapKey(raw, 'bob', DMID, 0), {}, 'their key changed and the change was not accepted: no wrap, not even to the old key');
  const all = await pg.wrapAll(raw, ['alice', 'bob'], DMID, 0);
  assert.equal(Object.keys(all).length, 1, 'only my own wrap');
  pg.changed.delete('bob');
  assert.equal(Object.keys(await pg.wrapAll(raw, ['alice', 'bob'], DMID, 0)).length, 2, 'accepted: both again');
});

test('dmBaseBits on accepting a contact\'s new key: the secret kept is the one from their old key, the one the chat began with', async () => {
  const pg = page(), me = await ident(pg, 'alice'); pg.S.me = me; pg.S.contactsReady = true;
  const bobOld = await pg.newIdentity(), bobNew = await pg.newIdentity();
  pg.S.pins.bob = { ecdh: bobOld.ecdh, sig: bobOld.sig }; pg.S.dir.bob = { handle: 'bob', ecdh: bobNew.ecdh, sig: bobNew.sig, kv: 2 };   // their key changed, not yet accepted here
  pg.changed.add('bob');
  const c = { id: await pg.dmIdFor('bob'), type: 'dm', epoch: 0, members: ['alice', 'bob'] };   // pins still give the old key: the id the chat has
  const bits = await pg.dmBaseBits(c);
  assert.equal(pg.ksGet(c.id, 'b'), pg.b64(bits), 'kept: the chat\'s id derives from this very secret');
  pg.S.pins.bob = { ecdh: bobNew.ecdh, sig: bobNew.sig }; pg.changed.delete('bob'); forgetKeys(pg);   // accepted
  assert.notDeepEqual([...(await pg.dmSecret('bob'))], [...bits], 'the new key gives another secret');
  assert.deepEqual([...(await pg.dmBaseBits(c))], [...bits], 'the chat keeps the one it began with');
});
