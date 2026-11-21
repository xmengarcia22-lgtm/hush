// Release 108 (page), item 33: the page reads a published key (`openKeys`, a chat key kept in the chat's record in the clear)
// in a channel alone. Until this release convKey (app/crypto.js) read the record's key before the key the device holds itself
// in every chat but a private channel (and a one-on-one chat's key number 0), so a key written into the record of a one-on-one
// chat or a group, by the other person, by the group's owner or by whoever writes the database, was the key the page sealed
// its next messages under. Now "channel" means the record says so and the chat's address starts with `c`: a one-on-one chat
// (`d`) and a group (`g`) never read the field, at any key number, whatever the record says it is. A public channel still reads
// its published key first; a private channel still reads one only for a key number the device holds no key of its own for.
// The page's own code runs here against a real server (channel-history-kit.js). A key planted in a record is written straight
// into the store, or handed to the page in a made-up record, so that no test leans on the server's rule of release 107
// (openkeys-refuse.test.js). Harness liberties: a one-on-one chat's starting secret is a random value handed to both pages
// (the kit works out no second person), and the page's repair (healKeys) runs as written with the page's own dmPeer and a
// device entry put in by hand, since the kit's pages carry neither.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { lift, mkBuild, pageFor, world, makeChannel } from './channel-history-kit.js';

const same = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const rnd = (n) => { const A = 'abcdefghijklmnopqrstuvwxyz0123456789'; return Array.from(randomBytes(n), (b) => A[b % 36]).join(''); };
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const rawOf = async (X, c, e) => { const k = await X.convKey(c, e); return k ? k.raw : null; };
const stored = (T, cid) => ({ id: cid, ...T.srv.store._chatDoc(cid).doc });
// A record as it could be before release 107, which no write makes any more: straight into the store.
const plant = (T, cid, over) => { const st = T.srv.store, { p, doc } = st._chatDoc(cid); st._write(p, { ...doc, ...over }, st.now()); };
// The write the server made until release 107 for a key change that publishes its key (store.js rotateChat's own statements,
// without the record check that now refuses it): the next key number, no wraps, the key in the record, its member key.
function oldRotate(T, cid, epoch, cap, k64) {
  const st = T.srv.store, { p, doc } = st._chatDoc(cid);
  st._tx(() => { st._write(p, { ...doc, epoch, keys: { ...(doc.keys || {}), [epoch]: {} }, invites: {}, openKeys: { ...(doc.openKeys || {}), [epoch]: k64 } }, st.now());
    st.q.chatRotate.run(epoch, createHash('sha256').update(cap, 'utf8').digest('hex'), cid); });
}
const pids = (T, cid) => T.srv.store.db.prepare('SELECT path FROM docs WHERE path LIKE ?').all(`channels/${cid}/posts/%`).map((r) => r.path.split('/').pop());
const rowOf = (T, cid, pid) => JSON.parse(T.srv.store.q.get.get(`channels/${cid}/posts/${pid}`).d);
// X's page sends a message with its own sendBody, from the record as the chat watch would show it; gives the new post's id.
async function send(X, T, cid, text) {
  const c = await X.sync(cid), was = new Set(pids(T, cid));
  X.S.convs = [c.type === 'dm' ? c : { ...(await X.showMeta(c)), id: cid }];
  await X.sendBody(cid, text);
  return pids(T, cid).find((p) => !was.has(p));
}
// What someone holding only what the server stores reads of a post: the record's published key for the post's key number, and the row.
async function serverReads(T, cid, pid) {
  const { doc } = T.srv.store._chatDoc(cid), row = rowOf(T, cid, pid), k64 = doc.openKeys && doc.openKeys[row.e];
  if (!k64) return null;
  try {
    const key = await crypto.subtle.importKey('raw', Buffer.from(k64, 'base64'), 'AES-GCM', false, ['decrypt']);
    const inner = JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(row.n, 'base64'), additionalData: Buffer.from('hush-env-v1|' + cid + '|' + pid) }, key, Buffer.from(row.d, 'base64'))).toString());
    return Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(inner.i, 'base64') }, key, Buffer.from(inner.c, 'base64'))).toString();
  } catch { return null; }
}
// What X's page reads of a stored post from the record `rec`: the text, or null when the page has no key that opens it.
async function textOf(X, rec, T, pid) {
  const row = rowOf(T, rec.id, pid), u = await X.unsealPost(rec, { ...row, _id: pid }), ck = await X.convKey(rec, row.e);
  if (!u || !u.ct || !ck) return null;
  try { return Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(u.iv, 'base64') }, ck.key, Buffer.from(u.ct, 'base64'))).toString(); } catch { return null; }
}
// A page of somebody who is in no chat and holds no key (no connection): what it reads, the record alone gave.
const stranger = () => pageFor(null, 'nina');

// The page's repair for a one-on-one chat it holds no key for (ui.js healKeys), as written, with the page's own dmPeer.
const HEAL = `{${lift('const dmPeer=', '\n')}\n${lift('const healed=', 'async function resendKeys(')}\nspy.healKeys=healKeys}`;
const healBuild = mkBuild(HEAL);

// A one-on-one chat of alice and bob after its honest first key change (ensureDmEpoch's call): key number 1, alice's, wrapped
// to both. The starting secret is handed to both pages, in the key store where the page keeps it after a key change ('b').
async function dmOf(A, B, before) {
  const dm = 'd' + rnd(22), base = randomBytes(32), baseCap = await A.memberCapFrom(dm, 0, base);
  for (const X of [A, B]) {
    await X.loadDir(['alice', 'bob'], true); X.ksPut(dm, 'b', X.b64(base));
    // the page's capsFor for a one-on-one chat: the current key's member key, then the starting one (ui.js capsFor)
    X.spy.capsFor = async (cid) => { const s = await X.S.db.preview(cid); if (!s.exists) return null; const c = { id: cid, ...s.data() }, e = X.epochOf(c);
      return [e > 0 ? await X.memberCap(c, e).catch(() => null) : null, baseCap].filter(Boolean); };
  }
  await A.S.db.createChat(dm, { type: 'dm', epoch: 0, ts: Date.now(), last: null }, { m: baseCap });
  if (before) await before(dm);
  await A.rotateTo(await A.sync(dm), { members: ['alice', 'bob'] });
  return dm;
}

test('1. one-on-one: a key in the record is never read, from key number 1 on: with a key of this device\'s own in its store, with one in a wrap of its own, and with none', async () => {
  await world({}, async (w) => {
    const A = await w.page('alice'), B = await w.page('bob'), dm = await dmOf(A, B), J = randomBytes(32);
    const rec = await A.sync(dm), K1 = keyOf(A, dm, 1), planted = { ...rec, openKeys: { 1: A.b64(J) } };
    assert.ok(same(await rawOf(A, planted, 1), K1), 'alice holds key number 1 in her store: her own key, not the record\'s');
    assert.ok(same(await rawOf(A, { ...planted, keys: {} }, 1), K1), 'the same with no wrap left in the record');
    assert.equal(B.ksGet(dm, 1), null, 'bob has not opened key number 1 yet');
    assert.ok(same(await rawOf(B, planted, 1), K1), 'bob holds it in a wrap of his own: the wrap\'s key, not the record\'s');
    for (let e = 2; e <= 31; e++) {
      const next = { ...rec, epoch: e, openKeys: { [e]: A.b64(J) } };
      assert.equal(await A.convKey(next, e), null, `key number ${e}, no key of her own: none, not the record's`);
      assert.equal(await A.convKey({ ...next, keys: { ...rec.keys, [e]: {} } }, e), null, `key number ${e} with an empty wrap table, as a key change with no wraps leaves it`);
    }
    assert.equal(await A.convKey({ ...rec, epoch: 2, visibility: 'public', openKeys: { 2: A.b64(J) } }, 2), null, 'marked public: none');
    // the record's type alone decides too: a one-on-one record at a channel's address, as one made before release 107 could be
    assert.equal(await A.convKey({ ...rec, id: 'c' + rnd(12), epoch: 2, visibility: 'public', openKeys: { 2: A.b64(J) } }, 2), null, 'at a channel\'s address, marked public: none');
    await assert.rejects(A.sealPost({ ...rec, epoch: 2, openKeys: { 2: A.b64(J) } }, 'hello'), /nokey/, 'and the page seals no message under it');
  });
});

test('2. guard: one-on-one, key number 0 is the fixed key the chat began with, whatever the record holds', async () => {
  await world({}, async (w) => {
    const A = await w.page('alice'), B = await w.page('bob'), dm = await dmOf(A, B), J = randomBytes(32);
    const rec = await A.sync(dm), k = await A.convKey({ ...rec, openKeys: { 0: A.b64(J) } }, 0), kb = await B.convKey(await B.sync(dm), 0);
    assert.ok(k && kb, 'both pages have key number 0');
    assert.equal(k.raw, null, 'the fixed key, which is never a record\'s');
    const iv = randomBytes(12), ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k.key, Buffer.from('from before'));
    assert.equal(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kb.key, ct)).toString(), 'from before', 'bob\'s fixed key opens what alice sealed under hers');
    const jk = await crypto.subtle.importKey('raw', J, 'AES-GCM', false, ['decrypt']);
    await assert.rejects(crypto.subtle.decrypt({ name: 'AES-GCM', iv }, jk, ct), 'the record\'s key does not');
  });
});

test('3. group: a key in the record is never read, at the current key number and at a new one, marked public or not', async () => {
  await world({}, async (w) => {
    const O = await w.page('olga', { owner: true }), B = await w.page('bob'), g = 'g' + rnd(12), J = randomBytes(32);
    await makeChannel(O, g, ['olga', 'bob'], [], 'group');
    const rec = await B.sync(g), G0 = keyOf(O, g, 0);
    let F = B;
    for (const [what, mark] of [['private', {}], ['marked public', { visibility: 'public' }]]) {
      const planted = { ...rec, ...mark, openKeys: { 0: B.b64(J) } };
      F.store.delete('hush:ks:bob');
      F = await w.reload(F);   // a page of bob's that has not opened the key yet: a wrap of his own
      assert.equal(F.ksGet(g, 0), null);
      assert.ok(same(await rawOf(F, planted, 0), G0), what + ': the key from bob\'s own wrap, not the record\'s');
      assert.ok(same(await rawOf(F, planted, 0), G0) && F.ksGet(g, 0) === F.b64(G0), what + ': and then from his store');
      assert.ok(same(await rawOf(O, planted, 0), G0), what + ': the owner\'s page too');
      const next = { ...rec, ...mark, epoch: 1, keys: { ...rec.keys, 1: {} }, openKeys: { 1: B.b64(J) } };
      assert.equal(await F.convKey(next, 1), null, what + ': a new key number with a key in the record and no wrap: none');
      assert.equal(await F.convKey({ ...next, id: 'c' + g.slice(1) }, 1), null, what + ': the same for a group\'s record at a channel\'s address, as one made before release 107 could be');
      await assert.rejects(F.sealPost(next, 'hello'), /nokey/, what + ': and no message is sealed under it');
    }
  });
});

test('4. a one-on-one address whose record says "public channel", or says no type at all: the record\'s key is not read', async () => {
  await world({}, async (w) => {
    const A = await w.page('alice'), raw = randomBytes(32), d1 = 'd' + rnd(22);
    const rec = { id: d1, type: 'channel', visibility: 'public', epoch: 0, keys: { 0: {} }, akeys: {}, invites: {}, ts: Date.now(), last: null, openKeys: { 0: A.b64(raw) }, name: 'News', owner: 'bob', admins: [] };
    assert.equal(await A.convKey(rec, 0), null, 'public channel');
    assert.equal(await A.convKey({ ...rec, visibility: 'private' }, 0), null, 'private channel');
    const { type: _t, ...noType } = rec;
    assert.equal(await A.convKey(noType, 0), null, 'no type (the page takes that for a channel)');
    assert.equal(await A.convKey({ ...rec, epoch: 1, keys: { 0: {}, 1: {} }, openKeys: { 1: A.b64(raw) } }, 1), null, 'at key number 1');
    await assert.rejects(A.sealPost(rec, 'hello'), /nokey/, 'no message is sealed under it');
  });
});

test('5. a group address whose record says "public channel", or says no type at all: the record\'s key is not read, the device\'s own key is', async () => {
  await world({}, async (w) => {
    const O = await w.page('olga', { owner: true }), B = await w.page('bob'), g = 'g' + rnd(12), J = randomBytes(32);
    await makeChannel(O, g, ['olga', 'bob'], [], 'group');
    const rec = await B.sync(g), G0 = keyOf(O, g, 0), { type: _t, ...noType } = rec;
    assert.ok(same(await rawOf(B, { ...rec, type: 'channel', visibility: 'public', openKeys: { 0: B.b64(J) } }, 0), G0), 'relabelled a public channel');
    assert.ok(same(await rawOf(B, { ...noType, visibility: 'public', openKeys: { 0: B.b64(J) } }, 0), G0), 'no type and marked public');
    assert.ok(same(await rawOf(B, { ...rec, type: 'channel', visibility: 'private', openKeys: { 0: B.b64(J) } }, 0), G0), 'relabelled a private channel');
    const N = await stranger();
    assert.equal(await N.convKey({ ...rec, type: 'channel', visibility: 'public', openKeys: { 0: B.b64(J) } }, 0), null, 'a page with no key of its own takes none from it');
    assert.equal(await B.convKey({ ...rec, type: 'channel', visibility: 'public', epoch: 1, keys: { ...rec.keys, 1: {} }, openKeys: { 1: B.b64(J) } }, 1), null, 'nor at a new key number');
  });
});

test('6. guard: a public channel\'s published key is read first, by its owner, a subscriber and anyone the record reaches', async () => {
  await world({}, async (w) => {
    const { cid, T } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), J = randomBytes(32);
    await makeChannel(A, cid, ['alice', 'bob']);
    const K0 = keyOf(A, cid, 0);
    await A.shown(cid); await A.setVisibility(cid, 'public');
    const rec = await B.sync(cid);
    assert.deepEqual(rec.openKeys, { 0: A.b64(K0) }, 'the page published the channel\'s key');
    const N = await stranger();
    for (const [who, X] of [['owner', A], ['subscriber', B], ['anyone', N]]) {
      assert.ok(same(await rawOf(X, rec, 0), K0), who + ': the published key');
      assert.ok(same(await rawOf(X, { ...rec, openKeys: { 0: A.b64(J) } }, 0), J), who + ': the record\'s key comes before a key of the device\'s own');
    }
    const pid = await send(A, T, cid, 'news');
    assert.equal(await textOf(N, stored(T, cid), T, pid), 'news', 'a post of a public channel opens from the record alone');
  });
});

test('7. guard: a private channel after a public time: a key of the device\'s own comes first, and the posts of the public time still open from the record', async () => {
  await world({}, async (w) => {
    const { cid, T } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), J = randomBytes(32);
    await makeChannel(A, cid, ['alice', 'bob']);
    const K0 = keyOf(A, cid, 0);
    await A.shown(cid); await A.setVisibility(cid, 'public');
    const pub = await send(A, T, cid, 'while public');
    await A.sync(cid); await A.setVisibility(cid, 'private');
    const priv = await send(A, T, cid, 'private again'), rec = stored(T, cid);
    assert.deepEqual([rec.visibility, rec.epoch, rec.openKeys], ['private', 1, { 0: A.b64(K0) }], 'private at key number 1, the public time\'s key still in the record');
    const planted = { ...rec, openKeys: { 0: A.b64(J), 1: A.b64(J) } };
    assert.ok(same(await rawOf(A, planted, 0), K0) && same(await rawOf(A, planted, 1), keyOf(A, cid, 1)), 'the owner\'s stored keys win over the record\'s');
    assert.ok(same(await rawOf(await w.reload(B), planted, 0), K0), 'so does a wrap of bob\'s own');
    const N = await stranger();   // a device with no key of its own for the public time
    assert.equal(await textOf(N, rec, T, pub), 'while public', 'the public time\'s post opens from the record');
    assert.equal(await textOf(N, rec, T, priv), null, 'the post made after it does not');
    assert.equal(await textOf(A, await A.sync(cid), T, pub), 'while public'); assert.equal(await textOf(A, await A.sync(cid), T, priv), 'private again');
  });
});

test('8. guard: a channel made public, private and public again through the page\'s own setVisibility, on a real server: every write is taken and every post opens at each stage', async () => {
  await world({}, async (w) => {
    const { cid, T } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), ids = {};
    await makeChannel(A, cid, ['alice', 'bob']);
    const reads = async (X, rec) => { const out = {}; for (const [t, pid] of Object.entries(ids)) out[t] = await textOf(X, rec, T, pid); return Object.keys(out).filter((t) => out[t] === t); };
    ids.one = await send(A, T, cid, 'one');
    assert.deepEqual([await reads(A, await A.sync(cid)), await reads(B, await B.sync(cid)), await reads(await stranger(), stored(T, cid))], [['one'], ['one'], []], 'private: the owner and the subscriber, nobody else');
    await A.shown(cid); await A.setVisibility(cid, 'public');
    ids.two = await send(A, T, cid, 'two');
    assert.deepEqual([stored(T, cid).visibility, Object.keys(stored(T, cid).openKeys)], ['public', ['0']]);
    assert.deepEqual([await reads(A, await A.sync(cid)), await reads(B, await B.sync(cid)), await reads(await stranger(), stored(T, cid))], [['one', 'two'], ['one', 'two'], ['one', 'two']], 'public: anyone');
    await A.sync(cid); await A.setVisibility(cid, 'private');
    ids.three = await send(A, T, cid, 'three');
    assert.deepEqual([stored(T, cid).visibility, stored(T, cid).epoch, Object.keys(stored(T, cid).openKeys)], ['private', 1, ['0']], 'private again: a new key, the public time\'s stays in the record');
    assert.deepEqual([await reads(A, await A.sync(cid)), await reads(await stranger(), stored(T, cid))], [['one', 'two', 'three'], ['one', 'two']], 'private again: the owner all, anyone else the public time\'s');
    await A.sync(cid); await A.setVisibility(cid, 'public');
    ids.four = await send(A, T, cid, 'four');
    assert.deepEqual([stored(T, cid).visibility, Object.keys(stored(T, cid).openKeys)], ['public', ['0', '1']], 'public again: both keys published');
    assert.deepEqual([await reads(A, await A.sync(cid)), await reads(B, await B.sync(cid)), await reads(await stranger(), stored(T, cid))], [['one', 'two', 'three', 'four'], ['one', 'two', 'three', 'four'], ['one', 'two', 'three', 'four']], 'public again: anyone, every post');
  });
});

test('9. the attack, the key written straight into the store: a planted key at the next key number of a one-on-one chat; the page does not seal under it, the chat repairs itself with a key of its own, and the next message cannot be read from what the server stores', async () => {
  await world({}, async (w) => {
    const { T } = w, A = await w.page('alice', { build: healBuild }), B = await w.page('bob'), dm = await dmOf(A, B), J = randomBytes(32);
    const before = await send(A, T, dm, 'before');
    assert.equal(await serverReads(T, dm, before), null, 'honest start: the server reads nothing');
    oldRotate(T, dm, 2, await B.memberCapFrom(dm, 2, J), B.b64(J));   // bob's changed client, as the server took it until release 107
    const c = await A.sync(dm);
    assert.deepEqual([c.epoch, c.openKeys], [2, { 2: B.b64(J) }], 'alice\'s page is shown the record with the planted key');
    assert.equal(A.S.db.chatLevel(dm), 'member', 'and still opens the chat, with the key it began with');
    assert.equal(await A.convKey(c, 2), null, 'her page takes no key from the record');
    const n = pids(T, dm).length;
    await assert.rejects(send(A, T, dm, 'sealed under the planted key?'), /nokey/, 'and seals nothing under it');
    assert.equal(pids(T, dm).length, n, 'nothing was stored');
    // the repair (ui.js healKeys): a one-on-one chat above key number 0 whose current key this device does not hold gets a fresh one
    A.S.me.dev = { id: 'devalice1', ecdh: A.S.me.ecdh, sig: A.S.me.sig, by: '', s: 'set up', ts: Date.now() };
    await A.spy.healKeys({ ...c, members: ['alice', 'bob'] });
    const c3 = await A.sync(dm), K3 = keyOf(A, dm, 3);
    assert.deepEqual([c3.epoch, Object.keys(c3.openKeys)], [3, ['2']], 'key number 3, made by alice\'s page; the record holds no key for it');
    assert.ok(same(await rawOf(A, c3, 3), K3) && same(await rawOf(B, await B.sync(dm), 3), K3), 'both pages hold it, bob\'s from his own wrap');
    const after = await send(A, T, dm, 'after');
    assert.equal(rowOf(T, dm, after).e, 3);
    assert.equal(await serverReads(T, dm, after), null, 'the next message is not read from what the server stores');
    assert.equal(await textOf(B, await B.sync(dm), T, after), 'after', 'bob reads it');
    assert.equal(await serverReads(T, dm, before), null); assert.equal(await textOf(B, await B.sync(dm), T, before), 'before', 'the message from before stays readable to the two, and to nobody else');
  });
});

test('10. the same with a key planted for every key number to come (1 to 31) before the first key change: the page keeps its own keys', async () => {
  await world({}, async (w) => {
    const { T } = w, A = await w.page('alice'), B = await w.page('bob'), J = randomBytes(32), all = {};
    for (let e = 1; e <= 31; e++) all[e] = A.b64(J);
    const dm = await dmOf(A, B, (id) => plant(T, id, { openKeys: all }));   // in the record before alice's first key change
    const c = await A.sync(dm), K1 = keyOf(A, dm, 1);
    assert.equal(Object.keys(c.openKeys).length, 31, 'the record holds 31 planted keys');
    assert.ok(same(await rawOf(A, c, 1), K1) && !same(K1, J), 'alice made key number 1 herself and her page uses it');
    assert.ok(same(await rawOf(B, await B.sync(dm), 1), K1), 'bob\'s page opens it from his own wrap');
    const pid = await send(A, T, dm, 'alice made this key herself');
    assert.equal(await serverReads(T, dm, pid), null, 'her message is not read from what the server stores');
    assert.equal(await textOf(B, await B.sync(dm), T, pid), 'alice made this key herself');
    for (let e = 2; e <= 31; e++) assert.equal(await A.convKey({ ...c, epoch: e }, e), null, `key number ${e}: no key from the record`);
  });
});

test('11. the line itself, as written: convKey reads the record\'s key only where the record says channel and the address starts with c, and nothing else in crypto.js reads the field', () => {
  const src = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8'), lines = src.split('\n').filter((l) => /\.openKeys/.test(l));
  assert.deepEqual(lines.map((l) => l.trim()), ["const o=typeOf(c)==='channel'&&String(c.id)[0]==='c'&&c.openKeys&&c.openKeys[e],pv=!!o&&typeOf(c)==='channel'&&c.visibility!=='public',st=ksGet(c.id,e);"]);
});
