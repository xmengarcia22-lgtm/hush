// Release 107 (server), item 33: a published key (`openKeys`, a chat key stored in the chat's record in the clear) belongs to a
// public channel alone. The page reads a record's published key before the key the device holds (crypto.js convKey), so a key
// written into the record of a one-on-one chat, a group or a private channel made that page seal its next messages under a key
// the server stores. Until this release the server took such a key from a member of a one-on-one chat (chat.rotate), from a
// group's or a private channel's owner (chat.rotate, update, set) and from whoever made a record (chat.create). Now no write
// adds or changes one outside a public channel (schemas.js `channels`, which every write of a chat record passes: set, update,
// chat.create, chat.join, chat.rotate); a record that already holds one keeps taking every other write, so a channel made
// private again keeps the keys of its public time. With it: only a channel can be public, and a chat is made only at an address
// of its own kind (d a one-on-one chat, g a group, c a channel).
// A fourth rule, with it: a private channel's record holds no published key for its current key number or a later one. A public
// channel's owner publishes what she likes, also the key of a key change or one for a key number to come, and until this rule
// she then made the channel private with it still in the record (or made it private with no key change at all). The page's own
// way back to private is a key change that publishes nothing and then the update, so what its record holds is below the
// current key number; anything else is refused when the channel is made private, by every kind of write.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { startServer, signup, makeIdentity, cap, label, wrap, sealed, CAPS, groupDoc, channelDoc, dmDoc, createChat } from './helpers.js';
import { validateForKind } from '../src/schemas.js';

const K = 'k'.repeat(44), K2 = 'j'.repeat(44), K3 = 'h'.repeat(44);
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
let n = 0;
const gid = () => 'gOpenK' + String(++n).padStart(7, '0');
const chid = () => 'cOpenK' + String(++n).padStart(7, '0');
const did = () => 'dOpenK' + String(++n).padStart(17, '0');
const pubDoc = (over = {}) => channelDoc({ visibility: 'public', name: 'News', desc: 'd', photo: null, owner: 'alice', admins: [], meta: undefined, openKeys: { 0: K }, ...over });
const PUBLIC = { visibility: 'public', name: 'News', desc: '', photo: null, owner: 'alice', admins: [], meta: null, ometa: null, invites: {} };   // what the page sends with the keys when a channel goes public (ui.js setVisibility)
const PRIVATE = { visibility: 'private', name: null, desc: null, photo: null, owner: null, admins: null, invites: {} };                       // and when it goes private again, after its key change

let S, A, B, C;
before(async () => {
  S = await startServer({ authz: 'standard' });
  const [alice, bob, carol] = await Promise.all(['alice', 'bob', 'carol'].map(makeIdentity));
  A = await signup(S.url, alice); B = await signup(S.url, bob); C = await signup(S.url, carol);
});
after(async () => { await A.close(); await B.close(); await C.close(); await S.stop(); });

const P = (cid) => 'channels/' + cid;
const upd = (c, cid, d) => c.call('update', { p: P(cid), d });
const put = (c, cid, d) => c.call('set', { p: P(cid), d });
const rec = async (c, cid) => (await c.ok('get', { p: P(cid) })).d;
const rot = (c, cid, epoch, extra = {}) => c.call('chat.rotate', { cid, epoch, keys: { [label()]: wrap() }, cap: cap(), ...extra });
const stored = (cid) => S.srv.store._chatDoc(cid).doc;
// Straight into the store, past every rule: a record as an earlier release could have left it.
const plant = (cid, over) => { const st = S.srv.store, { p, doc } = st._chatDoc(cid); st._write(p, { ...doc, ...over }, st.now()); };
const refused = (r, re, what) => { assert.equal(r.ok, false, what + ': refused'); assert.equal(r.e, 'invalid', what + ': ' + r.e + ' ' + r.m); assert.match(r.m, re, what); };
const NOT_PUBLISHED = /only a public channel publishes a key/, NOT_PUBLIC = /only a channel can be public/, WRONG_ADDRESS = /this address is for another kind of chat/;
const mark = (c, cid) => upd(c, cid, { ts: Date.now(), last: { ts: Date.now(), sl: 1 } });   // the latest-message mark every sender writes

// Alice makes the chat and holds it at owner level (a one-on-one chat: at member level); Bob opens it with the member key.
async function make(cid, doc) {
  const m = cap(), caps = doc.type === 'dm' ? { m } : { ...CAPS(), m };
  await createChat(A, cid, doc, caps);
  await B.ok('chat.open', { cid, cap: m });
  return caps;
}

test('a key change (chat.rotate) with a published key is refused in a one-on-one chat (a member), a group (the owner) and a private channel (the owner); the record stays as it was and a key change without one goes through', async () => {
  const dm = did(), g = gid(), c = chid();
  await make(dm, dmDoc()); await make(g, groupDoc()); await make(c, channelDoc());
  refused(await rot(B, dm, 1, { openKeys: { 1: K } }), NOT_PUBLISHED, 'a one-on-one chat, the other member');
  refused(await rot(A, dm, 1, { openKeys: { 1: K } }), NOT_PUBLISHED, 'a one-on-one chat, who made it');
  refused(await rot(A, g, 1, { meta: sealed(1), openKeys: { 1: K } }), NOT_PUBLISHED, 'a group, its owner');
  refused(await rot(A, c, 1, { meta: sealed(1), openKeys: { 1: K } }), NOT_PUBLISHED, 'a private channel, its owner');
  for (const cid of [dm, g, c]) assert.deepEqual([stored(cid).epoch, stored(cid).openKeys], [0, undefined], cid[0] + ': no new key number and no published key');
  assert.equal((await rot(B, dm, 1)).ok, true, 'a one-on-one chat: a key change without one');
  for (const cid of [g, c]) assert.equal((await rot(A, cid, 1, { meta: sealed(1) })).ok, true, cid[0] + ': a key change without one');
});

test('guard: a public channel\'s owner publishes the new key with a key change', async () => {
  const c = chid();
  await make(c, pubDoc());
  assert.equal((await rot(A, c, 1, { openKeys: { 1: K2 } })).ok, true);
  assert.deepEqual(stored(c).openKeys, { 0: K, 1: K2 });
});

test('update and set: a group\'s owner and a private channel\'s owner can neither add a published key nor change one, also not after the channel\'s public time or while making it private', async () => {
  for (const cid of [gid(), chid()]) {
    await make(cid, (cid[0] === 'g' ? groupDoc : channelDoc)());
    refused(await upd(A, cid, { openKeys: { 0: K } }), NOT_PUBLISHED, cid[0] + ': update, the current key number');
    refused(await upd(A, cid, { openKeys: { 1: K }, ttl: 3600 }), NOT_PUBLISHED, cid[0] + ': update, a key number to come, with another field');
    refused(await put(A, cid, { ...(await rec(A, cid)), openKeys: { 0: K } }), NOT_PUBLISHED, cid[0] + ': set');
    assert.equal(stored(cid).openKeys, undefined, cid[0] + ': nothing was written');
    assert.equal(stored(cid).ttl, undefined, cid[0] + ': nor the field sent along');
  }
  // A channel that was public and is private again holds the keys of its public time. Nothing more gets in.
  const c = chid();
  await make(c, channelDoc());
  assert.equal((await upd(A, c, { ...PUBLIC, openKeys: { 0: K } })).ok, true, 'public');
  refused(await upd(A, c, { ...PRIVATE, openKeys: { 0: K2 } }), NOT_PUBLISHED, 'made private in the write that changes a published key');
  refused(await upd(A, c, { ...PRIVATE, openKeys: { 1: K2 } }), NOT_PUBLISHED, 'made private in the write that adds one');
  assert.equal((await rot(A, c, 1, { meta: sealed(1) })).ok, true);
  assert.equal((await upd(A, c, PRIVATE)).ok, true, 'private again');
  refused(await upd(A, c, { openKeys: { 1: K2 } }), NOT_PUBLISHED, 'private again: the current key number');
  refused(await upd(A, c, { openKeys: { 0: K2 } }), NOT_PUBLISHED, 'private again: a key of the public time changed');
  refused(await put(A, c, { ...(await rec(A, c)), openKeys: { 0: K, 1: K2 } }), NOT_PUBLISHED, 'private again: set');
  refused(await rot(A, c, 2, { meta: sealed(2), openKeys: { 2: K2 } }), NOT_PUBLISHED, 'private again: a key change');
  assert.deepEqual([stored(c).visibility, stored(c).epoch, stored(c).openKeys], ['private', 1, { 0: K }], 'the keys of the public time, as they were');
});

test('chat.create with a published key: refused for a one-on-one chat, a group and a private channel, whatever the key number; a public channel is made with its key', async () => {
  const all = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [i + 1, K]));   // every key number a one-on-one chat or a group can reach
  for (const [cid, doc, caps] of [[did(), dmDoc(), { m: cap() }], [gid(), groupDoc(), CAPS()], [chid(), channelDoc(), CAPS()]]) {
    for (const openKeys of [{ 0: K }, { 1: K }, all]) refused(await A.call('chat.create', { cid, d: { ...doc, openKeys }, caps }), NOT_PUBLISHED, cid[0] + ' ' + Object.keys(openKeys).length);
    assert.equal(stored(cid), null, cid[0] + ': no record was made');
    assert.equal((await A.call('chat.create', { cid, d: { ...doc, openKeys: {} }, caps })).ok, true, cid[0] + ': an empty table publishes nothing');
  }
  const c = chid();
  assert.equal((await A.call('chat.create', { cid: c, d: pubDoc(), caps: CAPS() })).ok, true, 'a public channel');
  assert.deepEqual(stored(c).openKeys, { 0: K });
});

test('guard: a channel goes public in one update with its keys, private again after a key change, and public again; a private channel keeps the keys of its public time through every other write', async () => {
  const c = chid();
  await make(c, channelDoc({ ometa: sealed(0) }));
  assert.equal((await upd(A, c, { ...PUBLIC, openKeys: { 0: K } })).ok, true, 'public, as the page sends it');
  assert.equal((await rot(A, c, 1, { meta: sealed(1) })).ok, true, 'the key change that starts the way back');
  assert.equal((await upd(A, c, { ...PRIVATE, ometa: sealed(1) })).ok, true, 'private again');
  assert.deepEqual([stored(c).visibility, stored(c).openKeys], ['private', { 0: K }]);
  const m1 = cap();
  assert.equal((await A.call('chat.rotate', { cid: c, epoch: 2, keys: { [label()]: wrap() }, cap: m1, meta: sealed(2) })).ok, true, 'a key change while private');
  await B.ok('chat.open', { cid: c, cap: m1 });
  assert.equal((await mark(B, c)).ok, true, 'a subscriber\'s write');
  assert.equal((await upd(A, c, { ttl: 3600, pins: [] })).ok, true, 'the owner\'s settings');
  assert.equal((await put(A, c, { ...(await rec(A, c)), ttl: 60 })).ok, true, 'the whole record written back');
  assert.deepEqual(stored(c).openKeys, { 0: K }, 'unchanged');
  assert.equal((await upd(A, c, { ...PUBLIC, openKeys: { 0: K, 1: K2, 2: K3 } })).ok, true, 'public again, every key published');
  assert.deepEqual([stored(c).visibility, stored(c).openKeys], ['public', { 0: K, 1: K2, 2: K3 }]);
  assert.equal((await upd(A, c, { openKeys: { 1: K3 } })).ok, true, 'a public channel\'s owner still changes one');
  assert.equal((await rot(A, c, 3, { meta: sealed(3) })).ok, true, 'the key change that starts the second way back');
  assert.equal((await upd(A, c, { ...PRIVATE, ometa: sealed(3) })).ok, true, 'private a second time');
  assert.deepEqual([stored(c).visibility, stored(c).epoch, stored(c).openKeys], ['private', 3, { 0: K, 1: K3, 2: K3 }], 'every key it holds is from before its current key number');
});

// Records as an earlier release could have left them: a published key in a one-on-one chat (at a key number to come), a group
// (at the current one) and a private channel (below the current one, where a public time leaves it; one at the current key
// number is the fourth rule's own test), written straight into the store.
async function holding() {
  const dm = did(), g = gid(), c = chid(), inv = {}, link = (cid) => ({ iNvItE000001: { iv: 'aXY=', ct: 'Y3Q=', ph: sha(inv[cid] = cap()), ts: Date.now() } });
  await make(dm, dmDoc()); await make(g, groupDoc({ invites: link(g) })); await make(c, channelDoc());
  const m1 = cap();
  assert.equal((await A.call('chat.rotate', { cid: c, epoch: 1, keys: { [label()]: wrap() }, cap: m1, meta: sealed(1) })).ok, true);
  await B.ok('chat.open', { cid: c, cap: m1 });
  plant(dm, { openKeys: { 1: K, 2: K } }); plant(g, { openKeys: { 0: K } }); plant(c, { openKeys: { 0: K }, invites: link(c) });
  return { dm, g, c, inv };
}

test('guard: a record that already holds a published key keeps taking every other write (the latest-message mark, a join, set, a key change without one), and its owner can take the key out', async () => {
  const { dm, g, c, inv } = await holding();
  assert.equal((await mark(B, dm)).ok, true, 'one-on-one: the mark');
  assert.equal((await upd(B, dm, { ttl: 3600 })).ok, true, 'one-on-one: the timer');
  assert.equal((await rot(B, dm, 1)).ok, true, 'one-on-one: a key change without one');
  assert.deepEqual(stored(dm).openKeys, { 1: K, 2: K }, 'one-on-one: the record keeps what it held');
  for (const cid of [g, c]) {
    const e = stored(cid).epoch;
    assert.equal((await mark(B, cid)).ok, true, cid[0] + ': the mark');
    assert.equal((await C.call('chat.join', { cid, iid: 'iNvItE000001', proof: inv[cid], wraps: { [e]: { [label()]: wrap() } } })).ok, true, cid[0] + ': a join by link');
    assert.equal((await upd(A, cid, { ttl: 3600 })).ok, true, cid[0] + ': the owner\'s settings');
    assert.equal((await put(A, cid, { ...(await rec(A, cid)), ttl: 60 })).ok, true, cid[0] + ': the whole record written back');
    assert.equal((await rot(A, cid, e + 1, { meta: sealed(e + 1) })).ok, true, cid[0] + ': a key change without one');
    assert.deepEqual([stored(cid).epoch, stored(cid).openKeys], [e + 1, { 0: K }], cid[0] + ': the record keeps what it held');
    assert.equal((await upd(A, cid, { openKeys: { 0: null } })).ok, true, cid[0] + ': the entry taken out');
    assert.deepEqual(stored(cid).openKeys, {});
    plant(cid, { openKeys: { 0: K } });
    assert.equal((await upd(A, cid, { openKeys: null })).ok, true, cid[0] + ': the table taken out');
    assert.equal(stored(cid).openKeys, undefined);
  }
});

test('a record that already holds a published key: the key cannot be changed and none can be added, by update, set or a key change', async () => {
  const { dm, g, c } = await holding();
  refused(await rot(B, dm, 1, { openKeys: { 1: K2 } }), NOT_PUBLISHED, 'one-on-one: a key change that changes the one planted for its key number');
  for (const cid of [g, c]) {
    const e = stored(cid).epoch;
    refused(await upd(A, cid, { openKeys: { 0: K2 } }), NOT_PUBLISHED, cid[0] + ': update, changed');
    refused(await upd(A, cid, { openKeys: { 1: K2 } }), NOT_PUBLISHED, cid[0] + ': update, added');
    refused(await put(A, cid, { ...(await rec(A, cid)), openKeys: { 0: K2 } }), NOT_PUBLISHED, cid[0] + ': set, changed');
    refused(await put(A, cid, { ...(await rec(A, cid)), openKeys: { 0: K, 1: K2 } }), NOT_PUBLISHED, cid[0] + ': set, added');
    refused(await rot(A, cid, e + 1, { meta: sealed(e + 1), openKeys: { [e + 1]: K2 } }), NOT_PUBLISHED, cid[0] + ': a key change');
    assert.deepEqual([stored(cid).epoch, stored(cid).openKeys], [e, { 0: K }], cid[0] + ': as it was');
  }
  assert.deepEqual([stored(dm).epoch, stored(dm).openKeys], [0, { 1: K, 2: K }], 'one-on-one: as it was');
});

test('guard: the short copy of a public channel, read by an account that is not in it, still carries its key', async () => {
  const c = chid();
  await make(c, pubDoc());
  const d = await rec(C, c);
  assert.deepEqual([d.type, d.visibility, d.openKeys, d.name], ['channel', 'public', { 0: K }, 'News']);
  assert.equal(d.invites, undefined, 'the short copy, not the record');
});

test('only a channel can be public: a group or a one-on-one chat is neither made public nor marked public; a chat is made only at an address of its own kind', async () => {
  const pub = { visibility: 'public', name: 'Club', owner: 'alice', admins: [], meta: undefined };
  const g0 = gid(), d0 = did();
  refused(await A.call('chat.create', { cid: g0, d: groupDoc(pub), caps: CAPS() }), NOT_PUBLIC, 'a group made public');
  refused(await A.call('chat.create', { cid: g0, d: groupDoc({ ...pub, openKeys: { 0: K } }), caps: CAPS() }), NOT_PUBLIC, 'a group made public with a published key');
  refused(await A.call('chat.create', { cid: d0, d: dmDoc({ visibility: 'public' }), caps: { m: cap() } }), NOT_PUBLIC, 'a one-on-one chat made public');
  assert.deepEqual([stored(g0), stored(d0)], [null, null], 'no record was made');
  const g = gid();
  await make(g, groupDoc());
  refused(await upd(A, g, { visibility: 'public', meta: null, name: 'Club', owner: 'alice', admins: [] }), NOT_PUBLIC, 'a group marked public by its owner, update');
  refused(await upd(A, g, { visibility: 'public' }), NOT_PUBLIC, 'the mark alone');
  const { meta: _m, ...whole } = await rec(A, g);
  refused(await put(A, g, { ...whole, visibility: 'public', name: 'Club' }), NOT_PUBLIC, 'set');
  assert.equal(stored(g).visibility, 'private');
  // A group that an earlier release let its owner mark public takes no published key either.
  plant(g, { visibility: 'public', name: 'Club', owner: 'alice', admins: [] });
  refused(await upd(A, g, { openKeys: { 0: K } }), NOT_PUBLISHED, 'a group already marked public: a published key');
  refused(await rot(A, g, 1, { openKeys: { 1: K } }), NOT_PUBLISHED, 'a group already marked public: a key change with one');

  const chan = () => channelDoc(), group = () => groupDoc(), dm = () => dmDoc();
  for (const [cid, doc, caps, what] of [
    [did(), pubDoc(), CAPS(), 'a one-on-one address made as a public channel'], [did(), chan(), CAPS(), 'a one-on-one address made as a private channel'], [did(), group(), CAPS(), 'a one-on-one address made as a group'],
    [gid(), pubDoc(), CAPS(), 'a group address made as a public channel'], [gid(), chan(), CAPS(), 'a group address made as a private channel'], [gid(), dm(), { m: cap() }, 'a group address made as a one-on-one chat'],
    [chid(), group(), CAPS(), 'a channel address made as a group'], [chid(), dm(), { m: cap() }, 'a channel address made as a one-on-one chat']]) {
    refused(await A.call('chat.create', { cid, d: doc, caps }), WRONG_ADDRESS, what);
    assert.equal(stored(cid), null, what + ': no record was made');
  }
  for (const [cid, doc, caps] of [[did(), dm(), { m: cap() }], [gid(), group(), CAPS()], [chid(), chan(), CAPS()], [chid(), pubDoc(), CAPS()]]) assert.equal((await A.call('chat.create', { cid, d: doc, caps })).ok, true, cid[0] + ' ' + doc.type);
});

test('the address rule goes by the address the store passes (ctx.id) and only when a record is made', () => {
  const ctx = (id, prev = null) => ({ id, now: Date.now(), op: 'set', prev });
  const code = (fn) => { try { fn(); return 'ok'; } catch (e) { return e.code + ': ' + e.message; } };
  const D = 'd' + 'A'.repeat(22), G = 'g' + 'A'.repeat(12), CH = 'c' + 'A'.repeat(12);
  for (const [id, type] of [[D, 'dm'], [G, 'group'], [CH, 'channel']]) {
    assert.equal(code(() => validateForKind('channels', ctx(id), { type })), 'ok', id[0] + ' ' + type);
    for (const other of ['dm', 'group', 'channel'].filter((t) => t !== type)) {
      assert.match(code(() => validateForKind('channels', ctx(id), { type: other })), WRONG_ADDRESS, id[0] + ' made as ' + other);
      assert.equal(code(() => validateForKind('channels', ctx(id, { type: other }), { type: other, ts: 1 })), 'ok', id[0] + ' ' + other + ', a record that exists');
    }
  }
  assert.match(code(() => validateForKind('channels', { now: Date.now(), op: 'set', prev: null }, { type: 'channel' })), WRONG_ADDRESS, 'no address: nothing is made');
});

test('guard: a group that an earlier release let its owner mark public, and a record whose kind is not its address\'s, keep taking writes', async () => {
  const g = gid();
  await make(g, groupDoc());
  plant(g, { visibility: 'public', name: 'Club', owner: 'alice', admins: [] });
  assert.equal((await mark(B, g)).ok, true, 'the mark');
  assert.equal((await upd(A, g, { name: 'Club 2', ttl: 3600 })).ok, true, 'its owner\'s fields');
  assert.equal((await put(A, g, { ...(await rec(A, g)), ttl: 60 })).ok, true, 'the whole record written back');
  assert.equal((await rot(A, g, 1)).ok, true, 'a key change');
  assert.deepEqual([stored(g).visibility, stored(g).epoch, stored(g).name], ['public', 1, 'Club 2']);
  assert.equal((await upd(A, g, { visibility: 'private', name: null, owner: null, admins: null })).ok, true, 'and its owner makes it private');

  const x = gid();   // a group's address whose record says channel
  await make(x, groupDoc());
  plant(x, { type: 'channel' });
  S.srv.store.db.prepare('UPDATE chats SET type = ? WHERE cid = ?').run('channel', x);
  assert.equal((await mark(B, x)).ok, true, 'the mark');
  assert.equal((await upd(A, x, { ttl: 3600 })).ok, true, 'its owner\'s settings');
  assert.equal((await rot(A, x, 1, { meta: sealed(1) })).ok, true, 'a key change');
});

// ---- the fourth rule: a private channel's record holds no published key for its current key number or a later one ----

const AHEAD = /a private channel keeps no published key for its current epoch or a later one/;
const priv = (e) => ({ ...PRIVATE, meta: sealed(e) });   // the update that makes a channel private, its description sealed under key number e
const state = (cid) => [stored(cid).visibility, stored(cid).epoch, Object.keys(stored(cid).openKeys || {})];
// The whole record as its owner reads it, without the names a private record may not carry: what `set` writes to make it private.
const bare = async (cid, e) => { const { name: _n, desc: _d, photo: _p, owner: _o, admins: _a, ...d } = await rec(A, cid); return { ...d, visibility: 'private', meta: sealed(e) }; };

test('a channel is not made private while its record holds a published key for its current key number: with no key change at all, and after a key change that published the new key; by update, by set, and by taking the visibility field out', async () => {
  const c = chid();
  await make(c, pubDoc());
  refused(await upd(A, c, priv(0)), AHEAD, 'private with no key change at all');
  refused(await upd(A, c, { ...priv(0), visibility: null }), AHEAD, 'the visibility field taken out (a record without it is private)');
  refused(await put(A, c, await bare(c, 0)), AHEAD, 'set');
  assert.equal((await rot(A, c, 1, { meta: sealed(1), openKeys: { 1: K2 } })).ok, true, 'while public: a key change that publishes the new key');
  refused(await upd(A, c, priv(1)), AHEAD, 'private after it');
  refused(await put(A, c, await bare(c, 1)), AHEAD, 'set after it');
  assert.deepEqual(state(c), ['public', 1, ['0', '1']], 'it is still public, and nothing else was written');
  assert.equal((await rot(A, c, 2, { meta: sealed(2) })).ok, true, 'the page\'s own first step: a key change that publishes nothing');
  assert.equal((await upd(A, c, priv(2))).ok, true, 'and then private');
  assert.deepEqual(state(c), ['private', 2, ['0', '1']], 'what the record holds is from before its current key number');
});

test('a key published ahead while the channel is public (by update, or when the channel is made) is never in the record at the current key number or above once the channel is private', async () => {
  const c = chid();
  await make(c, pubDoc());
  assert.equal((await upd(A, c, { openKeys: { 1: K2, 5: K3 } })).ok, true, 'while public its owner publishes what she likes, also for key numbers to come');
  refused(await upd(A, c, priv(0)), AHEAD, 'private at key number 0');
  assert.equal((await rot(A, c, 1, { meta: sealed(1) })).ok, true, 'the key change to the number published ahead, with no key in the call');
  refused(await upd(A, c, priv(1)), AHEAD, 'private at key number 1, whose key is in the record');
  assert.equal((await rot(A, c, 2, { meta: sealed(2) })).ok, true);
  refused(await upd(A, c, priv(2)), AHEAD, 'private at key number 2: one for key number 5 is in the record');
  refused(await put(A, c, await bare(c, 2)), AHEAD, 'set');
  assert.deepEqual(state(c), ['public', 2, ['0', '1', '5']]);
  assert.equal((await upd(A, c, { openKeys: { 5: null } })).ok, true, 'its owner takes that one out');
  assert.equal((await upd(A, c, priv(2))).ok, true, 'private');
  assert.deepEqual(state(c), ['private', 2, ['0', '1']], 'what is left is from before the current key number');
  // Private, it stays so: no write adds one (the rule before this one), and a key change only moves further from what it holds.
  refused(await upd(A, c, { openKeys: { 2: K3 } }), NOT_PUBLISHED, 'private: one for the current key number');
  refused(await upd(A, c, { openKeys: { 3: K3 } }), NOT_PUBLISHED, 'private: one for a key number to come');
  refused(await rot(A, c, 3, { meta: sealed(3), openKeys: { 3: K3 } }), NOT_PUBLISHED, 'private: a key change with one');
  assert.equal((await rot(A, c, 3, { meta: sealed(3) })).ok, true, 'a key change while private');
  assert.deepEqual(state(c), ['private', 3, ['0', '1']]);

  const c2 = chid();
  assert.equal((await A.call('chat.create', { cid: c2, d: pubDoc({ openKeys: { 0: K, 1: K2 } }), caps: CAPS() })).ok, true, 'a public channel made with a key for key number 1');
  refused(await upd(A, c2, priv(0)), AHEAD, 'made so: private at key number 0');
  assert.equal((await rot(A, c2, 1, { meta: sealed(1) })).ok, true);
  refused(await upd(A, c2, priv(1)), AHEAD, 'made so: private at key number 1');
  assert.equal((await rot(A, c2, 2, { meta: sealed(2) })).ok, true);
  assert.equal((await upd(A, c2, priv(2))).ok, true, 'made so: private once the key number is past it');
  assert.deepEqual(state(c2), ['private', 2, ['0', '1']]);

  const c3 = chid();   // made at a key number of the maker's choosing: the rule goes by the record's own
  assert.equal((await A.call('chat.create', { cid: c3, d: pubDoc({ epoch: 3, keys: { 3: { [label()]: wrap() } }, openKeys: { 0: K, 3: K2 } }), caps: CAPS() })).ok, true, 'a public channel made at key number 3');
  refused(await upd(A, c3, priv(3)), AHEAD, 'made at 3: private at key number 3');
  assert.equal((await rot(A, c3, 4, { meta: sealed(4) })).ok, true);
  assert.equal((await upd(A, c3, priv(4))).ok, true, 'made at 3: private at key number 4');
});

// Every spelling of a key number that gets as far as the shape check of `openKeys` (the document's name rule lets letters,
// digits and . _ ~ - through, so no space, no sign but a minus and no empty name), with the number the server reads it as.
const SPELT = [['00', 0], ['-0', 0], ['.0', 0], ['0.0', 0], ['0e0', 0], ['0x0', 0], ['01', 1], ['1.0', 1], ['1.', 1], ['1e0', 1], ['1E0', 1], ['10e-1', 1], ['0x1', 1], ['0b1', 1], ['0o1', 1], ['002', 2], ['0.2e1', 2], ['0x10', 16], ['1e1', 10]];

test('the fourth rule reads the record as it will be stored: its kind, its visibility, its key number (none reads as 0), and each published key by its number, however the number is spelt', () => {
  const CH = 'c' + 'A'.repeat(12), G = 'g' + 'A'.repeat(12), D = 'd' + 'A'.repeat(22);
  // the same record before and after, so the rule before this one has nothing to say (nothing is added or changed)
  const code = (id, d, op = 'update') => { try { validateForKind('channels', { id, now: Date.now(), op, prev: d }, d); return 'ok'; } catch (e) { return e.code + ': ' + e.message; } };
  const ch = (epoch, openKeys, over = {}) => ({ type: 'channel', visibility: 'private', ...(epoch === undefined ? {} : { epoch }), openKeys, ...over });
  for (const op of ['update', 'set']) {
    assert.equal(code(CH, ch(1, { 0: K }), op), 'ok', op + ': the key before the current one');
    assert.equal(code(CH, ch(5, { 0: K, 2: K, 4: K }), op), 'ok', op + ': every key before the current one');
    assert.equal(code(CH, ch(3, {}), op), 'ok', op + ': an empty table');
    assert.match(code(CH, ch(0, { 0: K }), op), AHEAD, op + ': the current one, key number 0');
    assert.match(code(CH, ch(undefined, { 0: K }), op), AHEAD, op + ': a record with no key number is at key number 0');
    assert.match(code(CH, ch(1, { 0: K, 1: K }), op), AHEAD, op + ': the current one among earlier ones');
    assert.match(code(CH, ch(1, { 7: K }), op), AHEAD, op + ': a later one');
    assert.match(code(CH, ch(1, { 0: K, 2147483647: K }), op), AHEAD, op + ': the last key number there is');
    const { visibility: _v, ...none } = ch(1, { 1: K });
    assert.match(code(CH, none, op), AHEAD, op + ': a record with no visibility field is private');
    assert.equal(code(CH, ch(1, { 1: K, 9: K }, { visibility: 'public' }), op), 'ok', op + ': a public channel is not held by it');
    // not a channel: such a record already holding one keeps taking writes, as before (the page reads none there, release 108)
    assert.equal(code(G, { type: 'group', visibility: 'private', epoch: 0, openKeys: { 0: K, 3: K } }, op), 'ok', op + ': a group');
    assert.equal(code(D, { type: 'dm', epoch: 1, openKeys: { 1: K, 2: K } }, op), 'ok', op + ': a one-on-one chat');
  }
  for (const [k, n] of SPELT) {
    assert.equal(Number(k) === n && k !== String(n), true, JSON.stringify(k) + ' is another spelling of ' + n);
    assert.equal(code(CH, ch(n, { [k]: K }, { visibility: 'public' })), 'ok', JSON.stringify(k) + ': the shape check lets it into a public channel');
    assert.match(code(CH, ch(n, { [k]: K })), AHEAD, JSON.stringify(k) + ': counted as key number ' + n + ', the current one');
    if (n > 0) assert.match(code(CH, ch(n - 1, { [k]: K })), AHEAD, JSON.stringify(k) + ': a later one');
    assert.equal(code(CH, ch(n + 1, { [k]: K })), 'ok', JSON.stringify(k) + ': below the current key number ' + (n + 1));
  }
  for (const k of ['x', '1.5', '-1', '1e99', '0x', '1_0', '2147483648']) assert.match(code(CH, ch(0, { [k]: K }, { visibility: 'public' })), /invalid: chat: bad "openKeys"/, JSON.stringify(k) + ' is no key number');
});

test('another spelling of a key number, through the server\'s own writes: taken while public, counted by its number when the channel is made private; an empty name and one with a space never get as far', async () => {
  const c = chid();
  await make(c, pubDoc());
  assert.equal((await rot(A, c, 1, { meta: sealed(1) })).ok, true);
  for (const k of ['', ' 1', '+1']) { const r = await upd(A, c, { openKeys: { [k]: K2 } }); assert.deepEqual([r.ok, r.e], [false, 'invalid'], JSON.stringify(k)); assert.match(r.m, /bad field name/, JSON.stringify(k) + ': the document\'s name rule'); }
  for (const [k, n] of SPELT.filter((x) => x[1] === 1)) {
    assert.equal((await upd(A, c, { openKeys: { [k]: K2 } })).ok, true, JSON.stringify(k) + ': taken while public');
    refused(await upd(A, c, priv(1)), AHEAD, JSON.stringify(k) + ': private at key number ' + n);
    assert.equal((await upd(A, c, { openKeys: { [k]: null } })).ok, true);
  }
  assert.equal((await upd(A, c, { openKeys: { '00': K2, '-0': K2 } })).ok, true, 'two other spellings of key number 0');
  assert.equal((await upd(A, c, priv(1))).ok, true, 'private at key number 1: they are from before it');
  assert.deepEqual(state(c), ['private', 1, ['0', '00', '-0']]);
});

test('a private channel whose record already holds a published key at its current key number or later (written into the store, as before this rule) takes no write that leaves it there; a key change that passes it, or its owner taking it out, mends the record', async () => {
  // at the current key number
  const c = chid(), secret = cap(), link = { iNvItE000001: { iv: 'aXY=', ct: 'Y3Q=', ph: sha(secret), ts: Date.now() } };
  await make(c, channelDoc({ invites: link }));
  plant(c, { openKeys: { 0: K } });
  const was = JSON.stringify(stored(c));
  refused(await mark(B, c), AHEAD, 'the latest-message mark');
  refused(await C.call('chat.join', { cid: c, iid: 'iNvItE000001', proof: secret, wraps: { 0: { [label()]: wrap() } } }), AHEAD, 'a join by link');
  refused(await upd(A, c, { ttl: 3600 }), AHEAD, 'the owner\'s settings');
  refused(await put(A, c, { ...(await rec(A, c)), ttl: 60 }), AHEAD, 'the whole record written back');
  refused(await upd(A, c, { openKeys: { 0: K2 } }), NOT_PUBLISHED, 'the key changed (the rule before this one answers first)');
  assert.equal(JSON.stringify(stored(c)), was, 'nothing was written');
  const m1 = cap();
  assert.equal((await A.call('chat.rotate', { cid: c, epoch: 1, keys: { [label()]: wrap() }, cap: m1, meta: sealed(1) })).ok, true, 'a key change: the key it holds is then from before the current key number');
  await B.ok('chat.open', { cid: c, cap: m1 });
  assert.deepEqual(state(c), ['private', 1, ['0']]);
  assert.equal((await mark(B, c)).ok, true, 'mended: the mark');
  assert.equal((await upd(A, c, { ttl: 3600 })).ok, true, 'mended: the owner\'s settings');
  assert.equal((await put(A, c, { ...(await rec(A, c)), ttl: 60 })).ok, true, 'mended: the whole record written back');

  // at a later key number: a key change does not pass it
  const c2 = chid(), secret2 = cap();
  await make(c2, channelDoc({ invites: { iNvItE000001: { iv: 'aXY=', ct: 'Y3Q=', ph: sha(secret2), ts: Date.now() } } }));
  plant(c2, { openKeys: { 3: K } });
  refused(await mark(B, c2), AHEAD, 'later: the mark');
  refused(await rot(A, c2, 1, { meta: sealed(1) }), AHEAD, 'later: a key change that does not pass it');
  refused(await C.call('chat.join', { cid: c2, iid: 'iNvItE000001', proof: secret2, wraps: { 0: { [label()]: wrap() } } }), AHEAD, 'later: a join by link');
  assert.deepEqual(state(c2), ['private', 0, ['3']]);
  assert.equal((await upd(A, c2, { openKeys: { 3: null } })).ok, true, 'its owner takes the key out');
  assert.equal((await mark(B, c2)).ok, true, 'mended: the mark');
  assert.equal((await C.call('chat.join', { cid: c2, iid: 'iNvItE000001', proof: secret2, wraps: { 0: { [label()]: wrap() } } })).ok, true, 'mended: a join by link');
  assert.equal((await rot(A, c2, 1, { meta: sealed(1) })).ok, true, 'mended: a key change');

  // and its owner can make such a record public (then it is a public channel's published key, as any)
  const c3 = chid();
  await make(c3, channelDoc());
  plant(c3, { openKeys: { 0: K, 2: K2 } });
  assert.equal((await upd(A, c3, { ...PUBLIC, openKeys: { 0: K, 2: K2 } })).ok, true, 'made public');
});
