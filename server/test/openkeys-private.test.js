// Release 107 (server), item 33, the fourth rule: a private channel's record holds no published key (`openKeys`) for its
// current key number or a later one. A private channel's page still reads a record's key for a key number the device holds no
// key of its own for (crypto.js convKey, release 92), and a public channel's owner publishes what she likes; so until this rule
// an owner with a changed client left the key of her private channel in its record by way of a public time: she published the
// new key in the key change, or a key for a key number to come, or made no key change at all, and then made the channel
// private. Now the write that would leave a private channel so is refused (schemas.js `channels`).
// Here the page's own code runs against a real server (channel-history-kit.js): its Make public and Make private as written
// (ui.js setVisibility), with posts, a join by link and a key change between them; and a changed client, which is a call
// through the page's own connection with what the page never sends. The rule's own table is in openkeys-refuse.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { pageFor, world, makeChannel, linkOf, offline } from './channel-history-kit.js';

const AHEAD = /a private channel keeps no published key for its current epoch or a later one/;
const refusedAhead = (e) => e.code === 'invalid' && AHEAD.test(e.message);
const same = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const rnd = (n) => { const A = 'abcdefghijklmnopqrstuvwxyz0123456789'; return Array.from(randomBytes(n), (b) => A[b % 36]).join(''); };
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const rawOf = async (X, c, e) => { const k = await X.convKey(c, e); return k ? k.raw : null; };
const stored = (T, cid) => ({ id: cid, ...T.srv.store._chatDoc(cid).doc });
const at = (T, cid) => { const r = stored(T, cid); return [r.visibility, r.epoch, Object.keys(r.openKeys || {})]; };
const pids = (T, cid) => T.srv.store.db.prepare('SELECT path FROM docs WHERE path LIKE ?').all(`channels/${cid}/posts/%`).map((r) => r.path.split('/').pop());
const rowOf = (T, cid, pid) => JSON.parse(T.srv.store.q.get.get(`channels/${cid}/posts/${pid}`).d);
// X's page sends a post with its own sendBody, from the record as the chat watch would show it; gives the new post's id.
async function send(X, T, cid, text) {
  const c = await X.sync(cid), was = new Set(pids(T, cid));
  X.S.convs = [{ ...(await X.showMeta(c)), id: cid }];
  await X.sendBody(cid, text);
  return pids(T, cid).find((p) => !was.has(p));
}
// What X's page reads of a stored post from the record `rec`: the text, or null when the page has no key that opens it.
async function textOf(X, rec, T, pid) {
  const row = rowOf(T, rec.id, pid), u = await X.unsealPost(rec, { ...row, _id: pid }), ck = await X.convKey(rec, row.e);
  if (!u || !u.ct || !ck) return null;
  try { return Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(u.iv, 'base64') }, ck.key, Buffer.from(u.ct, 'base64'))).toString(); } catch { return null; }
}
// A page of somebody who is in no chat and holds no key (no connection): what it reads, the record alone gave.
const stranger = () => pageFor(null, 'nina');
// Which of the posts in `ids` X's page opens from the record `rec`.
const reads = async (X, rec, T, ids) => { const out = []; for (const [t, pid] of Object.entries(ids)) if (await textOf(X, rec, T, pid) === t) out.push(t); return out; };
const V = (owner, members) => ({ name: 'History', desc: '', photo: null, owner, admins: [], members, banned: [] });
// The changed client's update to private: the description sealed under the key `key` of key number `e`.
const goPrivate = async (O, cid, e, key, v) => O.S.db.doc('channels/' + cid).update({ visibility: 'private', name: null, desc: null, photo: null, owner: null, admins: null, invites: {},
  meta: await O.sealMeta(cid, e, key, v), ometa: await O.sealOMeta(cid, e, key, { ...v, _ah: '' }) });

test('1. guard: the page\'s own Make public, Make private, Make public, Make private on a real server: every step is taken, a private channel\'s record never holds a published key for its current key number, and in between it takes the page\'s other writes (a post, a join by link, a key change)', async () => {
  await world({}, async (w) => {
    const { cid, T } = w, A = await w.page('alice', { owner: true }), C = await w.page('carol'), ids = {};
    await makeChannel(A, cid, ['alice']);
    ids.one = await send(A, T, cid, 'one');
    assert.deepEqual(at(T, cid), ['private', 0, []]);
    await A.shown(cid); await A.setVisibility(cid, 'public');
    ids.two = await send(A, T, cid, 'two');
    assert.deepEqual(at(T, cid), ['public', 0, ['0']], 'public: the key published');
    await A.sync(cid); await A.setVisibility(cid, 'private');
    assert.deepEqual(at(T, cid), ['private', 1, ['0']], 'private: a new key first, the public time\'s stays in the record');
    // a private channel that keeps the key of its public time takes every write
    ids.three = await send(A, T, cid, 'three');
    await C.joinPrivate(cid, await linkOf(A, cid));
    assert.equal(await textOf(C, await C.sync(cid), T, ids.three), 'three', 'a join by link: the joiner\'s page opens the post');
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    ids.four = await send(A, T, cid, 'four');
    assert.deepEqual(at(T, cid), ['private', 2, ['0']], 'a key change in the private channel');
    assert.deepEqual([await reads(A, await A.sync(cid), T, ids), await reads(await stranger(), stored(T, cid), T, ids)], [['one', 'two', 'three', 'four'], ['one', 'two']], 'the owner every post, anyone else the public time\'s');
    await A.sync(cid); await A.setVisibility(cid, 'public');
    ids.five = await send(A, T, cid, 'five');
    assert.deepEqual(at(T, cid), ['public', 2, ['0', '1', '2']], 'public again: every key published');
    assert.deepEqual(await reads(await stranger(), stored(T, cid), T, ids), ['one', 'two', 'three', 'four', 'five'], 'public again: anyone, every post');
    await A.sync(cid); await A.setVisibility(cid, 'private');
    ids.six = await send(A, T, cid, 'six');
    assert.deepEqual(at(T, cid), ['private', 3, ['0', '1', '2']], 'private a second time: every key in the record is from before the current key number');
    assert.deepEqual([await reads(A, await A.sync(cid), T, ids), await reads(await stranger(), stored(T, cid), T, ids)], [['one', 'two', 'three', 'four', 'five', 'six'], ['one', 'two', 'three', 'four', 'five']], 'the post made after it does not open from the record');
  });
});

test('2. guard: the page\'s Make private whose second step fails (the key change went through, the update did not): the channel is still public, its current key is in no record, and the next try makes it private', async () => {
  await world({}, async (w) => {
    const { cid, T } = w, A = await w.page('alice', { owner: true }), ids = {};
    await makeChannel(A, cid, ['alice']);
    await A.shown(cid); await A.setVisibility(cid, 'public');
    ids.one = await send(A, T, cid, 'one');
    const doc = A.S.db.doc; let once = true;   // the update to private is lost once, on its way
    A.S.db.doc = (p) => { const d = doc(p), u = d.update; d.update = (v) => (once && v.visibility === 'private' ? (once = false, Promise.reject(offline())) : u(v)); return d; };
    await A.sync(cid);
    await assert.rejects(A.setVisibility(cid, 'private'), /offline/);
    assert.deepEqual(at(T, cid), ['public', 1, ['0']], 'between the two steps: public, at the new key number, whose key is not published');
    ids.two = await send(A, T, cid, 'two');
    assert.deepEqual(await reads(await stranger(), stored(T, cid), T, ids), ['one'], 'a post made between the steps is not opened from the record');
    await A.sync(cid); await A.setVisibility(cid, 'private');
    assert.deepEqual(at(T, cid), ['private', 2, ['0']], 'the next try: one more key change, then private');
    ids.three = await send(A, T, cid, 'three');
    assert.deepEqual([await reads(A, await A.sync(cid), T, ids), await reads(await stranger(), stored(T, cid), T, ids)], [['one', 'two', 'three'], ['one']]);
  });
});

test('3. a changed client publishes the new key in the key change while the channel is public and then makes it private: the update to private is refused, the channel stays public, and private it gets only with a key that is in no record', async () => {
  await world({}, async (w) => {
    const { cid, T } = w, O = await w.page('olga', { owner: true }), B = await w.page('bob'), J = randomBytes(32), R = randomBytes(32), v = V('olga', ['olga', 'bob']);
    await makeChannel(O, cid, ['olga', 'bob']);
    await O.shown(cid); await O.setVisibility(cid, 'public');
    await O.S.db.rotateChat(cid, { epoch: 1, keys: {}, cap: await O.memberCapFrom(cid, 1, J), openKeys: { 1: O.b64(J) } });   // taken: a public channel's owner publishes the new key
    await assert.rejects(goPrivate(O, cid, 1, J, v), refusedAhead, 'private with the current key in the record');
    assert.deepEqual(at(T, cid), ['public', 1, ['0', '1']], 'still public');
    // the same with no key change at all, from the page's own public channel
    const c2 = 'c' + rnd(12);
    await makeChannel(O, c2, ['olga', 'bob']);
    await O.shown(c2); await O.setVisibility(c2, 'public');
    await assert.rejects(goPrivate(O, c2, 0, keyOf(O, c2, 0), v), refusedAhead, 'private with no key change');
    assert.deepEqual(at(T, c2), ['public', 0, ['0']]);
    // what is left to her: a key change that publishes nothing, then private
    await O.S.db.rotateChat(cid, { epoch: 2, keys: await O.wrapAll(R, ['olga', 'bob'], cid, 2), cap: await O.memberCapFrom(cid, 2, R) });
    await goPrivate(O, cid, 2, R, v);
    const rec = stored(T, cid);
    assert.deepEqual(at(T, cid), ['private', 2, ['0', '1']], 'private, and what the record holds is from before the current key number');
    assert.equal(await (await stranger()).convKey(rec, 2), null, 'a device that is in no chat gets no key for the current key number from the record');
    assert.ok(same(await rawOf(B, await B.sync(cid), 2), R), 'the subscriber\'s page has it from a wrap of his own');
    await assert.rejects(O.S.db.doc('channels/' + cid).update({ openKeys: { 2: O.b64(R) } }), /only a public channel publishes a key/, 'and private, nothing is added');
  });
});

test('4. a changed client publishes a key for a key number to come while the channel is public: the page\'s own Make private is refused at its second step while that key is the current one, and the channel is private only once the key number is past it', async () => {
  await world({}, async (w) => {
    const { cid, T } = w, O = await w.page('olga', { owner: true }), J = randomBytes(32), ids = {};
    await makeChannel(O, cid, ['olga']);
    await O.shown(cid); await O.setVisibility(cid, 'public');
    await O.S.db.doc('channels/' + cid).update({ openKeys: { 1: O.b64(J) } });   // taken: the channel is public
    assert.deepEqual(at(T, cid), ['public', 0, ['0', '1']]);
    await O.sync(cid);
    await assert.rejects(O.setVisibility(cid, 'private'), refusedAhead, 'the page\'s key change goes to key number 1; its update to private is refused');
    assert.deepEqual(at(T, cid), ['public', 1, ['0', '1']], 'still public');
    await O.sync(cid); await O.setVisibility(cid, 'private');
    assert.deepEqual(at(T, cid), ['private', 2, ['0', '1']], 'the next try goes to key number 2: private, the key published ahead is from before it');
    ids.after = await send(O, T, cid, 'after');
    assert.deepEqual([rowOf(T, cid, ids.after).e, await reads(O, await O.sync(cid), T, ids), await reads(await stranger(), stored(T, cid), T, ids)], [2, ['after'], []], 'a post of the private channel opens for its owner, not from the record');
  });
});

test('5. a changed client makes a public channel with a key for key number 1 already in its record, changes the key to that number and makes the channel private: refused', async () => {
  await world({}, async (w) => {
    const { T } = w, O = await w.page('olga', { owner: true }), c2 = 'c' + rnd(12), raw = randomBytes(32), sec = randomBytes(32), J = randomBytes(32), v = V('olga', ['olga']);
    await O.S.db.createChat(c2, { type: 'channel', visibility: 'public', epoch: 0, keys: { 0: {} }, akeys: {}, invites: {}, ts: Date.now(), last: null, openKeys: { 0: O.b64(raw), 1: O.b64(J) }, name: 'News', owner: 'olga', admins: [] },
      { m: await O.memberCapFrom(c2, 0, raw), a: await O.adminCapFrom(c2, sec), o: await O.ownerCap(c2) });
    await assert.rejects(goPrivate(O, c2, 0, raw, v), refusedAhead, 'private at key number 0');
    await O.S.db.rotateChat(c2, { epoch: 1, keys: {}, cap: await O.memberCapFrom(c2, 1, J) });
    await assert.rejects(goPrivate(O, c2, 1, J, v), refusedAhead, 'private at key number 1');
    assert.deepEqual(at(T, c2), ['public', 1, ['0', '1']]);
  });
});

// Every spelling of a key number the server's shape check of `openKeys` lets in beside the number's own (openkeys-refuse.test.js).
const SPELT = [['00', 0], ['-0', 0], ['.0', 0], ['0.0', 0], ['0e0', 0], ['0x0', 0], ['01', 1], ['1.0', 1], ['1.', 1], ['1e0', 1], ['1E0', 1], ['10e-1', 1], ['0x1', 1], ['0b1', 1], ['0o1', 1], ['002', 2], ['0.2e1', 2], ['0x10', 16], ['1e1', 10]];

test('6. guard: another spelling of a key number in a record is dead on the page: convKey reads the entry named by the number itself and no other', async () => {
  const N = await stranger(), J = randomBytes(32);
  const rec = (vis, e, openKeys) => ({ id: 'c' + rnd(12), type: 'channel', visibility: vis, epoch: e, keys: { [e]: {} }, akeys: {}, invites: {}, ts: Date.now(), last: null, openKeys });
  for (const vis of ['public', 'private']) {
    for (const [k, n] of SPELT) assert.equal(await N.convKey(rec(vis, n, { [k]: N.b64(J) }), n), null, vis + ', ' + JSON.stringify(k) + ': not read as key number ' + n);
    for (const n of [0, 1, 2, 10, 16]) assert.ok(same(await rawOf(N, rec(vis, n, { [n]: N.b64(J) }), n), J), vis + ', the number itself: ' + n);
  }
});
