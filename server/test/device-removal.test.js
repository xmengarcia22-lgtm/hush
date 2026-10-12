// Device removal by account-key replacement (SPEC.md 14.15, release 21), the server's part: the key history `prev`
// kept on the directory record, the 4401 close of every other connection of an account whose kv rose, a DM's base
// key and a group's owner key being replaced, and a person's own chat-list notes staying out of the drops bucket.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { SYSTEM } from '../src/store.js';
import { NOTE_BYTES } from '../src/schemas.js';
import { startServer, connect, connectAs, signup, makeIdentity, makeDevice, signText, sessionMsg, directoryDoc, createChat, cap, label, wrap, groupDoc, dmDoc } from './helpers.js';

let S;
before(async () => { S = await startServer({ authz: 'standard', limits: { proveFailsPer10Min: 100, dropsPerHour: 2 } }); });
after(async () => { await S.stop(); });

// New account keys for `id`: the identity holding them, and the patch that publishes them under `kv`.
async function rekey(id, kv) {
  const next = await makeIdentity(id.handle);
  return { id: { ...id, sigKey: next.sigKey, sig: next.sig, ecdh: next.ecdh }, patch: { ecdh: next.ecdh, sig: next.sig, kv } };
}
const sigsOf = (dir) => dir.prev.map((e) => e.sig);

test('rekey: one update publishes the new keys and drops the other devices; the old signing key goes into prev', async () => {
  const alice = await makeIdentity('alice');
  const A = await signup(S.url, alice);
  const d1 = await makeDevice(alice);
  await A.ok('update', { p: 'directory/alice', d: { devs: { [d1.id]: d1.entry } } });
  await (await connectAs(S.url, alice, { dev: d1 })).close();
  const { id: next, patch } = await rekey(alice, 2);
  const d2 = await makeDevice(next);                                                   // this device's entry, re-signed by the new account key
  await A.ok('update', { p: 'directory/alice', d: { ...patch, devs: { [d1.id]: null, [d2.id]: d2.entry } } });
  await assert.rejects(connectAs(S.url, next, { dev: d1 }), /denied/, 'the removed device is locked out');
  await assert.rejects(connectAs(S.url, alice), /denied/, 'and so is the old account key');
  const c = await connect(S.url);
  const hello = await c.hello();
  const r = await c.call('prove', { h: 'alice', sig: await signText(next.sigKey, sessionMsg(hello.nonce, 'alice')) });
  assert.equal(r.via, 'account');
  assert.equal(r.kv, 2, 'the reply says which key version was proven');
  const dir = (await c.ok('get', { p: 'directory/alice' })).d;
  assert.deepEqual(sigsOf(dir), [alice.sig], 'the old signing key is kept, so old messages still check out');
  assert.equal(typeof dir.prev[0].until, 'number');
  assert.deepEqual(Object.keys(dir.devs), [d2.id]);
  const viaD2 = await connectAs(S.url, next, { dev: d2 });
  assert.equal(viaD2.via, 'device');
  await viaD2.close(); await c.close(); await A.close();
});

test('history: prev is written by the server alone, carried through whole-document writes, and holds at most 8 keys', async () => {
  let carol = await makeIdentity('carol');
  const C = await signup(S.url, carol);
  assert.equal((await C.call('update', { p: 'directory/carol', d: { prev: [] } })).e, 'denied', 'a patch may not name it');
  assert.equal((await C.call('set', { p: 'directory/carol', d: { ...directoryDoc(carol), prev: [] } })).e, 'denied', 'nor may a write invent one');
  const k0 = carol.sig;
  let patch;
  ({ id: carol, patch } = await rekey(carol, 2));
  await C.ok('set', { p: 'directory/carol', d: { ...directoryDoc(carol), kv: 2 } });
  const stored = (await C.ok('get', { p: 'directory/carol' })).d;
  assert.deepEqual(sigsOf(stored), [k0]);
  assert.equal((await C.call('update', { p: 'directory/carol', d: { prev: null } })).e, 'denied', 'nor remove it');
  assert.equal((await C.call('set', { p: 'directory/carol', d: { ...directoryDoc(carol), kv: 2, prev: [{ sig: carol.sig, until: 1 }] } })).e, 'denied', 'nor replace it');
  await C.ok('set', { p: 'directory/carol', d: { ...directoryDoc(carol), kv: 2, bio: 'hi' } });
  assert.deepEqual((await C.ok('get', { p: 'directory/carol' })).d.prev, stored.prev, 'a write that leaves it out keeps the stored one');
  await C.ok('set', { p: 'directory/carol', d: { ...directoryDoc(carol), kv: 2, prev: stored.prev } });   // echoing it is fine
  assert.deepEqual((await C.ok('get', { p: 'directory/carol' })).d.prev, stored.prev);
  const sigs = [carol.sig];
  for (let kv = 3; kv <= 10; kv++) {
    ({ id: carol, patch } = await rekey(carol, kv));
    await C.ok('update', { p: 'directory/carol', d: patch });
    sigs.push(carol.sig);
  }
  const prev = (await C.ok('get', { p: 'directory/carol' })).d.prev;
  assert.equal(prev.length, 8);
  assert.deepEqual(sigsOf({ prev }), sigs.slice(0, 8), 'the eight newest old keys, oldest first; the first key is gone');
  assert.ok(prev.every((e, i) => i === 0 || e.until >= prev[i - 1].until));
  await C.close();
});

test('close: a kv rise closes every other connection of the account with 4401; the writer stays and keeps writing', async () => {
  const dave = await makeIdentity('dave');
  const W = await signup(S.url, dave);
  const d1 = await makeDevice(dave);
  await W.ok('update', { p: 'directory/dave', d: { devs: { [d1.id]: d1.entry } } });
  const viaDev = await connectAs(S.url, dave, { dev: d1 }), viaOld = await connectAs(S.url, dave);
  const other = await signup(S.url, await makeIdentity('bob'));
  const { patch } = await rekey(dave, 2);
  await W.ok('update', { p: 'directory/dave', d: { ...patch, devs: { [d1.id]: null } } });
  const late = viaOld.call('set', { p: 'presence/dave', d: { ts: 4401 } });   // sent after the change, before the close reached the client
  assert.deepEqual(await viaDev.closed, { code: 4401, reason: 'keys changed' });
  assert.deepEqual(await viaOld.closed, { code: 4401, reason: 'keys changed' });
  assert.equal((await late).e, 'closed');
  assert.equal(S.srv.store.get('presence/dave', SYSTEM).d, null, 'a frame from a closed connection is not applied');
  await W.ok('set', { p: 'vault/v' + 'd'.repeat(32), d: { iv: 'aXY=', ct: 'Y3Q=', ts: 1 } });
  assert.equal((await other.call('ping')).ok, true, 'other accounts are untouched');
  await other.close(); await W.close();
});

test('rebase: a DM’s base key is replaced only by a connection holding its current member key, once it has one', async () => {
  const E = await signup(S.url, await makeIdentity('erin')), fred = await makeIdentity('fred'), F = await signup(S.url, fred);
  const X = cap(), Y = cap(), Z = cap(), DM = 'd' + 'R'.repeat(22);
  await createChat(E, DM, dmDoc(), { m: X });
  await F.ok('chat.open', { cid: DM, cap: X });
  assert.equal((await E.call('chat.rebase', { cid: DM, cap: Z })).e, 'denied', 'at epoch 0 the base key is the member key');
  assert.equal((await E.call('chat.rebase', { cid: DM, cap: 'short' })).e, 'invalid');
  assert.equal((await E.call('chat.rebase', { cid: 'd' + 'Q'.repeat(22), cap: Z })).e, 'notfound');
  await E.ok('chat.rotate', { cid: DM, epoch: 1, keys: { [label()]: wrap() }, cap: Y });
  assert.equal((await F.call('chat.rebase', { cid: DM, cap: Z })).e, 'denied', 'evicted by the rotation: no level any more');
  await E.ok('chat.rebase', { cid: DM, cap: Z });
  const fresh = await connectAs(S.url, fred);
  assert.equal((await fresh.call('chat.open', { cid: DM, cap: X })).e, 'denied', 'the old base key is dead');
  assert.equal((await fresh.ok('chat.open', { cid: DM, cap: Z })).level, 'member');
  assert.equal((await fresh.call('chat.rebase', { cid: DM, cap: cap() })).e, 'denied', 'the base key is not the current member key');
  assert.equal((await fresh.ok('chat.open', { cid: DM, cap: Y })).level, 'member');
  const G = 'g' + 'R'.repeat(12);
  await createChat(E, G, groupDoc());
  assert.equal((await E.call('chat.rebase', { cid: G, cap: cap() })).e, 'denied', 'only a DM has a base key');
  await E.close(); await F.close(); await fresh.close();
});

test('owner: the owner replaces the owner key; an admin can’t; a DM has none', async () => {
  const gina = await makeIdentity('gina'), G = await signup(S.url, gina), H = await signup(S.url, await makeIdentity('hal'));
  const id = 'g' + 'O'.repeat(12), { caps } = await createChat(G, id, groupDoc());
  await H.ok('chat.open', { cid: id, cap: caps.a });
  assert.equal((await H.call('chat.owner', { cid: id, cap: cap() })).e, 'denied', 'an admin is not the owner');
  const O2 = cap();
  await G.ok('chat.owner', { cid: id, cap: O2 });
  await H.waitPush((f) => f.t === 'evict' && f.cid === id);
  const fresh = await connectAs(S.url, gina);
  assert.equal((await fresh.call('chat.open', { cid: id, cap: caps.o })).e, 'denied', 'the old owner key is dead');
  assert.equal((await fresh.ok('chat.open', { cid: id, cap: O2 })).level, 'owner');
  assert.equal((await H.ok('chat.open', { cid: id, cap: caps.a })).level, 'admin', 'the admin key still works');
  const DM = 'd' + 'O'.repeat(22);
  await createChat(G, DM, dmDoc(), { m: cap() });
  assert.equal((await G.call('chat.owner', { cid: DM, cap: cap() })).e, 'denied', 'a DM has no owner');
  assert.equal((await G.call('chat.owner', { cid: 'gNoSuchChat01', cap: cap() })).e, 'notfound');
  await G.close(); await H.close(); await fresh.close();
});

test('drops: notes to yourself (own: 1) are not charged to the drops bucket; other notes still are', async () => {
  const I = await signup(S.url, await makeIdentity('ivan'));
  const note = (own) => ({ epk: { x: 'x'.repeat(43), y: 'y'.repeat(43) }, iv: 'aXY=', ct: Buffer.alloc(NOTE_BYTES, 7).toString('base64'), ts: Date.now(), ...(own ? { own: 1 } : {}) });
  const id = (c, i) => c + String(i).padStart(11, '0');
  for (let i = 0; i < 101; i++) await I.ok('set', { p: 'inbox/ivan/c/' + id('n', i), d: note(true) });   // more than an hour's bucket, no ratelimit
  assert.equal(S.srv.store.noteCount('inbox/ivan/c'), 101);
  for (let i = 0; i < 2; i++) await I.ok('set', { p: 'inbox/ivan/c/' + id('p', i), d: note(false) });     // dropsPerHour is 2 here
  assert.equal((await I.call('set', { p: 'inbox/ivan/c/' + id('p', 2), d: note(false) })).e, 'ratelimit', 'a plain note still counts');
  await I.ok('set', { p: 'inbox/ivan/c/' + id('n', 101), d: note(true) });   // and a note to yourself still passes
  await I.close();
});

// A sign-up proof is a reservation, not an account: once someone else creates the profile under that name, the
// reserving connection is closed, and the key-change rule binds a change to the key the connection signed in with.
test('squatter: a sign-up proof for a name that someone else then creates is closed with 4401; a key change needs the key on record', async () => {
  const M = await connectAs(S.url, await makeIdentity('zoe'), { pub: true });            // 'zoe' is free: proven via sign-up, never created
  assert.equal(M.via, 'signup');
  const zoe = await makeIdentity('zoe'), Z = await signup(S.url, zoe);                   // the real Zoe creates the profile
  const gone = await M.closed;
  assert.equal(gone.code, 4401);
  assert.equal(gone.reason, 'username taken');
  await Z.ok('set', { p: 'presence/zoe', d: { ts: Date.now() } });                       // the creator's connection is untouched
  // The rule itself, for a connection that somehow outlived the close: the key it proved with must be the stored one.
  const { createAuthz } = await import('../src/authz.js'), { parseDocPath } = await import('../src/paths.js');
  const authz = createAuthz('standard'), p = parseDocPath('directory/zoe'), prev = directoryDoc(zoe), next = await makeIdentity('zoe');
  const d = { ...prev, ecdh: next.ecdh, sig: next.sig, kv: 2 }, patch = { ecdh: next.ecdh, sig: next.sig, kv: 2 };
  const actor = (pub) => ({ handle: 'zoe', viaAccountKey: true, mayCreate: null, pub, chats: new Map(), conn: null });
  assert.throws(() => authz.check(actor(next.sig), 'update', p, { d, prev, patch }), /changed since this connection signed in/, 'a key that is not the one on record');
  assert.doesNotThrow(() => authz.check(actor(zoe.sig), 'update', p, { d, prev, patch }), 'the key on record');
  assert.throws(() => authz.check(actor(zoe.sig), 'update', p, { d: { ...d, kv: 3 }, prev, patch: { ...patch, kv: 3 } }), /raises kv by one/, 'kv must rise by exactly one');
  assert.throws(() => authz.check(actor(zoe.sig), 'update', p, { d: { ...prev, kv: 2 }, prev, patch: { kv: 2 } }), /new signing key/, 'kv may not rise without a new signing key');
  await Z.close();
});

test('history: a profile may not be created with a key history', async () => {
  const yuri = await makeIdentity('yuri'), Y = await connectAs(S.url, yuri, { pub: true });
  const { salt, bits } = await Y.ok('signup.pow');
  const { solveSignup } = await import('./helpers.js');
  assert.equal((await Y.call('set', { p: 'directory/yuri', d: { ...directoryDoc(yuri), prev: [] }, pow: solveSignup(salt, bits) })).e, 'denied');
  await Y.ok('set', { p: 'directory/yuri', d: directoryDoc(yuri), pow: solveSignup(salt, bits) });
  assert.equal((await Y.ok('get', { p: 'directory/yuri' })).d.prev, undefined);
  await Y.close();
});

test('posts: an edit keeps the message\'s time; only a scheduled message sent early moves it, to now', async () => {
  const { createHash } = await import('node:crypto');
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const W = await signup(S.url, await makeIdentity('wanda'));
  const id = 'g' + 'T'.repeat(12);
  await createChat(W, id, groupDoc());
  const now = Date.now(), post = (ts, t) => ({ sl: 1, ts, e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: sha(t), on: 0 });
  await W.ok('set', { p: `channels/${id}/posts/pAaAaAaAaAa1`, d: post(now - 120e3, 't0') });   // two minutes old: past the minute of grace a just-sent scheduled message gets
  assert.equal((await W.call('update', { p: `channels/${id}/posts/pAaAaAaAaAa1`, d: { ts: now - 86400e3, ot: 't0', on: 1, oh: sha('t1') } })).e, 'invalid', 'a message is not moved back in time');
  await W.ok('update', { p: `channels/${id}/posts/pAaAaAaAaAa1`, d: { d: 'bmV3', ot: 't0', on: 1, oh: sha('t1') } });   // an edit without a time keeps it
  await W.ok('set', { p: `channels/${id}/posts/pAaAaAaAaAa2`, d: post(now + 3600e3, 's0') });                           // scheduled for later
  assert.equal((await W.call('update', { p: `channels/${id}/posts/pAaAaAaAaAa2`, d: { ts: now - 40 * 86400e3, ot: 's0', on: 1, oh: sha('s1') } })).e, 'invalid', 'nor to long ago');
  await W.ok('update', { p: `channels/${id}/posts/pAaAaAaAaAa2`, d: { ts: Date.now(), ot: 's0', on: 1, oh: sha('s1') } });   // sent now
  await W.close();
});

// The proof is checked asynchronously: what the entry says afterwards is what counts.
test('prove: the entry is read again after the check; a key change or a name taken in between is refused', async () => {
  const proto = Object.getPrototypeOf(globalThis.crypto.subtle), orig = proto.verify;
  let during = null;   // runs once, right after the next signature check, before the server looks at the entry again
  proto.verify = async function (...a) { const r = await orig.apply(this, a); if (during) { const w = during; during = null; await w(); } return r; };
  try {
    const kim = await makeIdentity('kim'), K = await signup(S.url, kim);
    const c = await connect(S.url), hello = await c.hello(), { patch } = await rekey(kim, 2);
    during = () => K.ok('update', { p: 'directory/kim', d: patch });
    const r = await c.call('prove', { h: 'kim', sig: await signText(kim.sigKey, sessionMsg(hello.nonce, 'kim')) });
    assert.equal(r.e, 'denied'); assert.match(r.m, /changed while signing in/);
    assert.equal((await c.call('set', { p: 'presence/kim', d: { ts: 1 } })).ok, false, 'and the connection is not signed in');
    const lee = await makeIdentity('lee'), c2 = await connect(S.url), h2 = await c2.hello();
    during = async () => { const L = await signup(S.url, await makeIdentity('lee')); await L.close(); };
    const r2 = await c2.call('prove', { h: 'lee', pub: lee.sig, sig: await signText(lee.sigKey, sessionMsg(h2.nonce, 'lee')) });
    assert.equal(r2.e, 'denied'); assert.match(r2.m, /just taken/);
    await c.close(); await c2.close(); await K.close();
  } finally { proto.verify = orig; }
});
