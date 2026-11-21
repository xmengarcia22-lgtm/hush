// Channel member privacy, the server's own rules (SPEC.md 5.3, 5.4, 7.4): in any channel, public or private, only the owner and
// the admins may learn who the subscribers are. A channel's read marks (`reads`, one per reader and epoch, filed under a tag that
// anyone holding the chat key works out from a username) are read only at admin level: below it get, mget, query, a watch and a
// sub answer as if there were none, never `denied`, which a release-92 page takes as an eviction (channel-history-reads.test.js);
// everyone still writes their own, so the owner's and the admins' view counts stay. Below admin level a mark is written whole (set):
// update and delete are refused whether or not one is there, so neither answer tells whether a guessed username read the channel,
// and neither changes anyone's mark. The same goes for everything else under a chat (member cards, reactions and votes, posts, key-
// chain rows...) and for the secured mark: below the level that may read a path, update and delete answer alike, document or none,
// and read nothing stored. The public listing is a query: a filtered sub
// on the channels collection, which would stream the id of every chat record that changes, is refused. And a public channel keeps
// no sealed member list under a key it publishes. Raw protocol clients, standard authorization.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, signup, makeIdentity, createChat, connect, CAPS, cap, label, wrap, sealed, channelDoc, groupDoc } from './helpers.js';
import { SYSTEM } from '../src/store.js';

let S, olga, adam, sam, sue, nora;
before(async () => {
  S = await startServer({ authz: 'standard' });
  [olga, adam, sam, sue, nora] = await Promise.all(['olga', 'adam', 'sam', 'sue', 'nora'].map(async (h) => signup(S.url, await makeIdentity(h))));
});
after(async () => { for (const X of [olga, adam, sam, sue, nora]) await X.close(); await S.stop(); });

const chid = (s) => ('c' + s + '0'.repeat(12)).slice(0, 13);
const TAG = (c) => c.repeat(22);   // a reader's tag, as the page's memTag makes it from the chat, its key and the username
const mark = (ts) => ({ ts, iv: 'aXY=', ct: 'c2ln' });
const ids = (r) => r.docs.map((d) => d.id);
const pubDoc = (over = {}) => channelDoc({ visibility: 'public', name: 'News', desc: '', photo: null, owner: 'olga', admins: [], meta: undefined, openKeys: { 0: 'k'.repeat(44) }, ...over });
const LISTING = { p: 'channels', w: [['visibility', '==', 'public']], l: 100 };

test('a private channel\'s read marks are for its owner and admins: a subscriber gets none by get, mget, query, a sub or a watch, nor any later change, and is never refused; a key change still ends his views, so opened again he watches under the same id; a non-member is refused as before; he still writes his own', async () => {
  const cid = chid('Reads'), { caps } = await createChat(olga, cid, channelDoc());
  await adam.ok('chat.open', { cid, cap: caps.a });
  for (const x of [sam, sue]) await x.ok('chat.open', { cid, cap: caps.m });
  const col = `channels/${cid}/reads`, P = (t) => `${col}/0~${TAG(t)}`;
  await sue.ok('set', { p: P('s'), d: mark(1) });
  for (const x of [olga, adam]) {   // the owner and an admin: every mark, as before
    assert.deepEqual(ids(await x.ok('query', { p: col, l: 100 })), ['0~' + TAG('s')], x === olga ? 'the owner' : 'an admin');
    assert.equal((await x.ok('get', { p: P('s') })).d.ts, 1);
  }
  // Sam, a subscriber holding the key: nothing, and no refusal
  assert.deepEqual((await sam.ok('query', { p: col, l: 100 })).docs, [], 'query: none');
  assert.equal((await sam.ok('get', { p: P('s') })).d, null, 'get: none, even at the tag he worked out from her name');
  assert.deepEqual((await sam.ok('mget', { ps: [P('s')] })).docs.map((x) => x.d), [null], 'mget: none');
  await sam.ok('sub', { s: 'r', p: col, l: 100 });
  await sam.ok('sub', { s: 'w', p: col, ids: ['0~' + TAG('s')] });
  assert.deepEqual((await sam.waitPush((f) => f.s === 'r' && f.t === 'init')).docs, [], 'a sub: an empty start');
  assert.deepEqual((await sam.waitPush((f) => f.s === 'w' && f.t === 'init')).docs, [], 'a watch by id: the same');
  await adam.ok('sub', { s: 'r', p: col, l: 100 });
  assert.equal((await adam.waitPush((f) => f.s === 'r' && f.t === 'init')).docs.length, 1);
  await sue.ok('set', { p: P('s'), d: mark(2) });   // she reads on
  await sam.ok('set', { p: P('m'), d: mark(3) });   // and he writes his own, as before
  const heard = async (t) => (await adam.waitPush((f) => f.s === 'r' && f.t === 'set' && f.id === '0~' + TAG(t))).d.ts;
  assert.deepEqual([await heard('s'), await heard('m')], [2, 3], 'the admin\'s sub hears both');
  assert.ok(await sam.noPush((f) => (f.s === 'r' || f.s === 'w') && f.t !== 'init', 300), 'his sub and his watch hear nothing, not even his own mark');
  assert.deepEqual(ids(await olga.ok('query', { p: col, l: 100 })).sort(), ['0~' + TAG('m'), '0~' + TAG('s')], 'the owner reads his mark too');
  // a key change evicts his views, the empty ones too: opened again he watches again under the same ids, as a page re-sends them
  const k1 = cap();
  await olga.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: k1, meta: sealed(1) });
  await sam.waitPush((f) => f.t === 'evict' && f.cid === cid);
  await sam.ok('chat.open', { cid, cap: k1 });
  await sam.ok('sub', { s: 'r', p: col, l: 100 });
  await sam.ok('sub', { s: 'w', p: col, ids: ['0~' + TAG('s')] });
  const again = async (s) => (await sam.waitPush((f) => f.s === s && f.t === 'init')).docs;
  assert.deepEqual([await again('r'), await again('w')], [[], []], 'no conflict, and still none');
  await sam.ok('unsub', { s: 'w' });
  await sam.ok('unsub', { s: 'r' });
  // Nora holds no key: refused, as before
  for (const [op, f] of [['query', { p: col, l: 100 }], ['get', { p: P('s') }], ['sub', { s: 'n', p: col, l: 100 }], ['sub', { s: 'n2', p: col, ids: ['0~' + TAG('s')] }]]) {
    assert.equal((await nora.call(op, f)).e, 'denied', 'a non-member: ' + op);
  }
});

test('an admin the owner drops reads no marks from then on: the change ends his views, and opened again with the member key he gets none', async () => {
  const cid = chid('Demote'), { caps } = await createChat(olga, cid, channelDoc());
  await adam.ok('chat.open', { cid, cap: caps.a });
  await sue.ok('chat.open', { cid, cap: caps.m });
  const col = `channels/${cid}/reads`;
  await sue.ok('set', { p: `${col}/0~${TAG('s')}`, d: mark(1) });
  await adam.ok('sub', { s: 'd', p: col, l: 100 });
  assert.equal((await adam.waitPush((f) => f.s === 'd' && f.t === 'init')).docs.length, 1, 'as an admin: her mark');
  await olga.ok('chat.admins', { cid, akeys: { [label()]: wrap() }, cap: cap() });   // a fresh admin secret, for no one but the owner
  await adam.waitPush((f) => f.t === 'evict' && f.cid === cid);
  await sue.ok('chat.open', { cid, cap: caps.m });   // the change evicts every connection but the owner's
  await adam.ok('chat.open', { cid, cap: caps.m });
  await adam.ok('sub', { s: 'd', p: col, l: 100 });
  assert.deepEqual((await adam.waitPush((f) => f.s === 'd' && f.t === 'init')).docs, [], 'as a subscriber: none');
  assert.deepEqual((await adam.ok('query', { p: col, l: 100 })).docs, []);
  await sue.ok('set', { p: `${col}/0~${TAG('s')}`, d: mark(2) });
  assert.ok(await adam.noPush((f) => f.s === 'd' && f.t !== 'init', 300), 'and no later change');
  await adam.ok('unsub', { s: 'd' });
});

test('a public channel\'s read marks the same way: an account that never subscribed but opened it with the key it publishes, and a subscriber, get none; the owner and an admin get them all', async () => {
  const cid = chid('PubReads'), caps = CAPS();
  await createChat(olga, cid, pubDoc({ admins: ['adam'] }), caps);
  await adam.ok('chat.open', { cid, cap: caps.a });
  for (const x of [sue, nora]) await x.ok('chat.open', { cid, cap: caps.m });   // the member key, which anyone works out from openKeys (the page's memberCapFrom)
  const col = `channels/${cid}/reads`, P = `${col}/0~${TAG('s')}`;
  await sue.ok('set', { p: P, d: mark(1) });
  for (const x of [olga, adam]) assert.deepEqual(ids(await x.ok('query', { p: col, l: 100 })), ['0~' + TAG('s')], x === olga ? 'the owner' : 'an admin');
  for (const x of [nora, sue]) {
    const who = x === nora ? 'never subscribed' : 'a subscriber';
    assert.deepEqual((await x.ok('query', { p: col, l: 100 })).docs, [], who + ': query');
    assert.equal((await x.ok('get', { p: P })).d, null, who + ': get');
    await x.ok('sub', { s: 'p', p: col, l: 100 });
    assert.deepEqual((await x.waitPush((f) => f.s === 'p' && f.t === 'init')).docs, [], who + ': sub');
  }
  await adam.ok('sub', { s: 'p', p: col, l: 100 });
  await adam.waitPush((f) => f.s === 'p' && f.t === 'init');
  await sue.ok('set', { p: P, d: mark(2) });
  assert.equal((await adam.waitPush((f) => f.s === 'p' && f.t === 'set')).d.ts, 2, 'the admin hears her read on');
  assert.ok(await nora.noPush((f) => f.s === 'p' && f.t !== 'init', 300) && await sue.noPush((f) => f.s === 'p' && f.t !== 'init', 50), 'they hear nothing');
  for (const x of [nora, sue, adam]) await x.ok('unsub', { s: 'p' });
});

test('a group is as before: a member reads every read mark, by query and by sub', async () => {
  const g = 'gReads0000001', { caps } = await createChat(olga, g, groupDoc());
  for (const x of [sam, sue]) await x.ok('chat.open', { cid: g, cap: caps.m });
  const col = `channels/${g}/reads`;
  await sue.ok('set', { p: `${col}/0~${TAG('s')}`, d: mark(1) });
  assert.deepEqual(ids(await sam.ok('query', { p: col, l: 100 })), ['0~' + TAG('s')]);
  await sam.ok('sub', { s: 'g', p: col, l: 100 });
  assert.equal((await sam.waitPush((f) => f.s === 'g' && f.t === 'init')).docs.length, 1);
  await sue.ok('set', { p: `${col}/0~${TAG('s')}`, d: mark(2) });
  assert.equal((await sam.waitPush((f) => f.s === 'g' && f.t === 'set')).d.ts, 2);
  await sam.ok('unsub', { s: 'g' });
});

test('the public listing is a query only: a filtered sub on the channels collection is refused at every level, so no frame tells anyone that some chat record changed; the listing\'s query and the chat watch by ids are as before', async () => {
  const pub = chid('Listed'), priv = chid('Quiet');
  await createChat(olga, pub, pubDoc());
  const { caps } = await createChat(olga, priv, channelDoc());
  await adam.ok('chat.open', { cid: priv, cap: caps.a });
  await sam.ok('chat.open', { cid: priv, cap: caps.m });
  for (const [x, who] of [[nora, 'no level anywhere'], [sam, 'a subscriber'], [adam, 'an admin'], [olga, 'the owner']]) {
    assert.equal((await x.call('sub', { s: 'L', ...LISTING })).e, 'denied', who);
  }
  assert.ok(ids(await nora.ok('query', LISTING)).includes(pub), 'the listing still answers a query');
  await sam.ok('sub', { s: 'W', p: 'channels', ids: [priv] });
  await sam.waitPush((f) => f.s === 'W' && f.t === 'init');
  await adam.ok('update', { p: 'channels/' + priv, d: { meta: { e: 0, iv: 'aXY=', ct: 'bmV3' } } });   // an Add, say
  assert.equal((await sam.waitPush((f) => f.s === 'W' && f.t === 'set')).id, priv, 'the chat watch by ids hears it, as before');
  assert.ok(await nora.noPush((f) => f.s === 'L', 300), 'nothing reaches anyone through the refused sub');
  await sam.ok('unsub', { s: 'W' });
});

test('a public channel keeps no sealed member list under a key it publishes: one left in as it goes public, or written later by update or set, is not stored nor handed out by the listing; going private, the fresh list chat.rotate seals under a key not published stays through other writes and the update that makes the channel private', async () => {
  const cid = chid('GoPub'), { caps } = await createChat(olga, cid, channelDoc({ ometa: sealed(0) }));
  await adam.ok('chat.open', { cid, cap: caps.a });
  const rec = async () => (await olga.ok('get', { p: 'channels/' + cid })).d;
  // a page that leaves the list in place as it makes the channel public (release-90 and release-92 pages send meta: null)
  await olga.ok('update', { p: 'channels/' + cid, d: { visibility: 'public', openKeys: { 0: 'k'.repeat(44) }, name: 'News', owner: 'olga', admins: [] } });
  let r = await rec();
  assert.deepEqual([r.visibility, r.meta, r.ometa], ['public', undefined, undefined], 'going public: no list, and no owner\'s part (as before)');
  assert.equal((await nora.ok('query', LISTING)).docs.find((x) => x.id === cid).d.meta, undefined, 'the listing hands out none');
  await adam.ok('update', { p: 'channels/' + cid, d: { meta: sealed(0) } });
  assert.equal((await rec()).meta, undefined, 'a list an admin writes later, under the published key: not stored');
  await olga.ok('set', { p: 'channels/' + cid, d: { ...(await rec()), meta: sealed(0) } });
  assert.equal((await rec()).meta, undefined, 'nor by set');
  // going private as the page does it: a key change with a fresh list under the new key, which the record does not publish...
  const fresh = { e: 1, iv: 'aXY=', ct: 'ZnJlc2g=' };
  await olga.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: fresh });
  assert.deepEqual((await rec()).meta, fresh, 'chat.rotate is left alone');
  // ...an admin's write meanwhile (a post moves the record's ts)...
  await adam.ok('chat.open', { cid, cap: caps.a });
  await adam.ok('update', { p: 'channels/' + cid, d: { ts: Date.now() } });
  assert.deepEqual((await rec()).meta, fresh, 'kept through another write while the record is still public');
  // ...and the owner's update that makes it private
  await olga.ok('update', { p: 'channels/' + cid, d: { visibility: 'private', name: null, desc: null, photo: null, owner: null, admins: null, invites: {}, ometa: sealed(1) } });
  r = await rec();
  assert.deepEqual([r.visibility, r.meta, r.ometa], ['private', fresh, sealed(1)], 'and by the update that makes it private');
});

// What a connection's update (with a patch that never validates, then with one that does) and delete of a read-mark path answer.
const writes = async (x, p) => {
  const out = [];
  for (const [op, f] of [['update', { p, d: { ts: 'x' } }], ['update', { p, d: { ts: 9 } }], ['delete', { p }]]) { const r = await x.call(op, f); out.push(r.ok ? 'ok' : `${r.e} (${r.m})`); }
  return out;
};
const WHOLE = Array(3).fill('denied (read marks are written whole)'), NOKEY = Array(3).fill('denied (open this chat with its key first)'), UNAUTH = Array(3).fill('unauth (sign in first)');

test('below admin level a channel\'s read marks can\'t be probed by update or delete: a subscriber, and a removed member holding the old key\'s tags, get the same answer for a guessed username\'s mark as for a name with none, and change nothing; the owner and an admin update and delete them as before, and so does a group\'s member', async () => {
  const cid = chid('Probe'), { caps } = await createChat(olga, cid, channelDoc());
  await adam.ok('chat.open', { cid, cap: caps.a });
  for (const x of [sam, sue]) await x.ok('chat.open', { cid, cap: caps.m });
  const P = (t) => `channels/${cid}/reads/0~${TAG(t)}`;
  await sue.ok('set', { p: P('s'), d: mark(1) });
  // Sam, a subscriber: the tag he works out from her name, and one from a name with no mark
  assert.deepEqual([await writes(sam, P('s')), await writes(sam, P('z'))], [WHOLE, WHOLE], 'a subscriber: the same answer, mark or none');
  assert.deepEqual([(await olga.ok('get', { p: P('s') })).d.ts, (await olga.ok('get', { p: P('z') })).d], [1, null], 'her mark is untouched, and none was made');
  await sam.ok('set', { p: P('m'), d: mark(2) });   // he still writes his own, whole
  // the owner and an admin, who read the marks anyway: as before
  assert.deepEqual([(await adam.call('update', { p: P('s'), d: { ts: 'x' } })).e, (await adam.call('update', { p: P('z'), d: { ts: 3 } })).e], ['invalid', 'notfound'], 'an admin\'s answers, as before');
  await adam.ok('update', { p: P('s'), d: { ts: 3 } });
  await olga.ok('delete', { p: P('m') });
  assert.deepEqual([(await olga.ok('get', { p: P('s') })).d.ts, (await olga.ok('get', { p: P('m') })).d], [3, null], 'an admin\'s update and the owner\'s delete, as before');
  // Sam removed: he still holds the old key's tags, and no level
  await olga.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(1) });
  await sam.waitPush((f) => f.t === 'evict' && f.cid === cid);
  assert.deepEqual([await writes(sam, P('s')), await writes(sam, P('z'))], [NOKEY, NOKEY], 'removed: the same answer, mark or none');
  assert.equal((await olga.ok('get', { p: P('s') })).d.ts, 3, 'her mark is untouched');
  // a group's members read every mark, and update and delete them as before
  const g = 'gProbe0000001', gc = await createChat(olga, g, groupDoc());
  for (const x of [sam, sue]) await x.ok('chat.open', { cid: g, cap: gc.caps.m });
  const G = (t) => `channels/${g}/reads/0~${TAG(t)}`;
  await sue.ok('set', { p: G('s'), d: mark(1) });
  assert.deepEqual([(await sam.call('update', { p: G('s'), d: { ts: 'x' } })).e, (await sam.call('update', { p: G('z'), d: { ts: 3 } })).e], ['invalid', 'notfound'], 'a group member\'s answers, as before');
  await sam.ok('delete', { p: G('s') });
  assert.equal((await olga.ok('get', { p: G('s') })).d, null, 'and his delete');
});

test('a public channel\'s read marks the same way: an account signed in that never opened it, with no level, and the same account once it opens it with the key the channel publishes, get the same answer for a guessed username\'s mark as for a name with none, by update and by delete, and change nothing', async () => {
  const cid = chid('PubProbe'), caps = CAPS();
  await createChat(olga, cid, pubDoc(), caps);
  await sue.ok('chat.open', { cid, cap: caps.m });   // a subscriber reading the channel
  const P = (t) => `channels/${cid}/reads/0~${TAG(t)}`;
  await sue.ok('set', { p: P('s'), d: mark(5) });
  assert.deepEqual([await writes(nora, P('s')), await writes(nora, P('z'))], [NOKEY, NOKEY], 'no level: the same answer, mark or none');
  await nora.ok('chat.open', { cid, cap: caps.m });   // the member key, which anyone works out from openKeys (the page's memberCapFrom)
  assert.deepEqual([await writes(nora, P('s')), await writes(nora, P('z'))], [WHOLE, WHOLE], 'opened with the published key: the same answer, mark or none');
  assert.deepEqual([(await olga.ok('get', { p: P('s') })).d.ts, (await olga.ok('get', { p: P('z') })).d], [5, null], 'her mark is untouched, and none was made');
});

test('a connection that never signs in gets the same answer too, sign in first, for a guessed username\'s mark in a public channel as for a name with none, by update and by delete, and changes nothing', async () => {
  const cid = chid('AnonProbe'), caps = CAPS();
  await createChat(olga, cid, pubDoc(), caps);
  await sue.ok('chat.open', { cid, cap: caps.m });
  const P = (t) => `channels/${cid}/reads/0~${TAG(t)}`;
  await sue.ok('set', { p: P('s'), d: mark(5) });
  const anon = await connect(S.url); await anon.hello();
  try { assert.deepEqual([await writes(anon, P('s')), await writes(anon, P('z'))], [UNAUTH, UNAUTH], 'not signed in: the same answer, mark or none'); }
  finally { await anon.close(); }
  assert.deepEqual([(await olga.ok('get', { p: P('s') })).d.ts, (await olga.ok('get', { p: P('z') })).d], [5, null], 'her mark is untouched, and none was made');
});

// Member cards (`roll`) are read at admin level only. A card's tag never changes for a channel and a username, and chat.slots hands an
// admin the tag of any username, so an admin later demoted or removed still holds them.
const ADMIN = Array(3).fill('denied (this needs admin access to the chat)');
test('below admin level nobody can probe a member card by update or delete: an admin later demoted, then removed by a key change, and a connection that never signs in get the same answer for a username\'s card as for a free slot, read nothing stored and change nothing; an admin\'s answers are as before', async () => {
  const cid = chid('Cards'), { caps } = await createChat(olga, cid, channelDoc()), P = (t) => `channels/${cid}/roll/${t}`;
  await adam.ok('chat.open', { cid, cap: caps.a });
  for (const x of [sam, sue]) { await x.ok('chat.open', { cid, cap: caps.m }); await x.ok('chat.card', { cid, e: 0, iv: 'aXY=', ct: Buffer.alloc(528, 7).toString('base64') }); }
  const [m, s, z] = (await adam.ok('chat.slots', { cid, cap: caps.m, hs: ['sam', 'sue', 'zed'] })).tags;   // Zed has no card: a free slot
  // the admin, who reads the cards: as before (a card is never edited; his delete takes Sam's)
  const EDIT = 'denied (cards are written with chat.card or chat.ask)', NONE = 'notfound (no document to update)';
  assert.deepEqual([await writes(adam, P(m)), await writes(adam, P(z))], [[EDIT, EDIT, 'ok'], [NONE, NONE, 'ok']], 'an admin\'s answers, as before');
  assert.equal((await olga.ok('get', { p: P(m) })).d, null, 'and his delete');
  const card = (await olga.ok('get', { p: P(s) })).d;
  // Adam demoted (a fresh admin secret) and opened again with the member key: he still holds the tags
  await olga.ok('chat.admins', { cid, akeys: { [label()]: wrap() }, cap: cap() });
  await adam.waitPush((f) => f.t === 'evict' && f.cid === cid);
  await adam.ok('chat.open', { cid, cap: caps.m });
  const st = S.srv.store, read = st._read; let reads = 0;
  st._read = (p, now) => { if (p.kind === 'roll') reads++; return read.call(st, p, now); };
  try {
    assert.deepEqual([await writes(adam, P(s)), await writes(adam, P(z))], [ADMIN, ADMIN], 'demoted: the same answer, card or none');
    // then removed by a key change: no level
    await olga.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(1) });
    await adam.waitPush((f) => f.t === 'evict' && f.cid === cid);
    assert.deepEqual([await writes(adam, P(s)), await writes(adam, P(z))], [NOKEY, NOKEY], 'removed: the same answer, card or none');
    const anon = await connect(S.url); await anon.hello();
    try { assert.deepEqual([await writes(anon, P(s)), await writes(anon, P(z))], [UNAUTH, UNAUTH], 'not signed in: the same answer, card or none'); }
    finally { await anon.close(); }
    assert.equal(reads, 0, 'every one refused before anything stored was read');
  } finally { st._read = read; }
  assert.deepEqual([(await olga.ok('get', { p: P(s) })).d, (await olga.ok('get', { p: P(z) })).d], [card, null], 'her card is untouched, and none was made');
});

test('nobody can probe the secured mark (secure/<h>, read by the server only) by update or delete: another account and a connection that never signs in get the same answer for an account that has the mark as for one that has none, and change nothing', async () => {
  await sue.ok('set', { p: 'secure/sue', d: { ts: 1 } });
  const SERVER = Array(3).fill('denied (this mark is read by the server only)'), anon = await connect(S.url); await anon.hello();
  try {
    for (const [x, who] of [[nora, 'another account'], [anon, 'not signed in']]) {
      assert.deepEqual([await writes(x, 'secure/sue'), await writes(x, 'secure/zed')], [SERVER, SERVER], who + ': the same answer, mark or none');
    }
  } finally { await anon.close(); }
  assert.deepEqual([S.srv.store.get('secure/sue', SYSTEM).d, S.srv.store.get('secure/zed', SYSTEM).d], [{ ts: 1 }, null], 'her mark is untouched, and none was made');
});

test('nor a channel\'s reactions and votes (acts): an account with no level and a connection that never signs in get the same answer for a guessed username\'s as for a name with none, and change nothing; a group\'s member, who reads them, updates and deletes them as before', async () => {
  const cid = chid('Acts'), { caps } = await createChat(olga, cid, channelDoc()), PID = 'pOsT12345678';
  const A = (c, t) => `channels/${c}/acts/${PID}~${TAG(t)}~like`, act = (ts) => ({ post: PID, kind: 'like', e: 0, iv: 'aXY=', ct: 'c2ln', ts });
  for (const x of [sam, sue]) await x.ok('chat.open', { cid, cap: caps.m });
  S.srv.store.set(A(cid, 's'), act(1), SYSTEM);   // a row from before chat.act (channel-acts.test.js)
  const anon = await connect(S.url); await anon.hello();
  try {
    assert.deepEqual([await writes(nora, A(cid, 's')), await writes(nora, A(cid, 'z'))], [NOKEY, NOKEY], 'no level: the same answer, reaction or none');
    assert.deepEqual([await writes(anon, A(cid, 's')), await writes(anon, A(cid, 'z'))], [UNAUTH, UNAUTH], 'not signed in: the same answer, reaction or none');
  } finally { await anon.close(); }
  assert.deepEqual([S.srv.store.get(A(cid, 's'), SYSTEM).d.ts, S.srv.store.get(A(cid, 'z'), SYSTEM).d], [1, null], 'hers is untouched, and none was made');
  const g = 'gActs00000001', gc = await createChat(olga, g, groupDoc());
  for (const x of [sam, sue]) await x.ok('chat.open', { cid: g, cap: gc.caps.m });
  await sue.ok('set', { p: A(g, 's'), d: act(1) });
  assert.deepEqual([await writes(sam, A(g, 's')), await writes(sam, A(g, 'z'))], [['invalid (act: bad "fields")', 'ok', 'ok'], ['notfound (no document to update)', 'notfound (no document to update)', 'ok']], 'a group member\'s answers, as before');
  assert.equal((await olga.ok('get', { p: A(g, 's') })).d, null, 'and his delete');
});
