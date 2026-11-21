// Channel member privacy, the server's core rule (SPEC.md 5.3, 5.5, 7.4): in any channel, public or private, only the owner and the
// admins may learn who the subscribers are. A private channel's record carries its member and blocked lists (`meta`) sealed under the
// chat key every subscriber holds, so the server hands that part to no connection below admin level: a subscriber's connection gets
// the rest of the record (the key wraps, the owner's part, the epoch) by get, mget, a watch's first answer and every change after,
// and is never refused; a connection with no level gets the preview, and its watch is refused, both as before. The level that counts
// is the one a connection holds as each change goes out, not when its watch began, and the one its key proved: an owner or admin
// whose account isn't secured opens at member level, its tools waiting (SPEC.md 4.6), and still reads the lists. The public listing,
// anyone's to read, hands out none. A group's members see each other, as before. A private channel's record may also carry `n`, how
// many subscribers it has, which the owner's and the admins' pages keep (release 95): a number and no name, so it comes with the rest;
// a public channel's record carries none (until Phase 3). Raw protocol clients, standard authorization.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, signup, makeIdentity, createChat, CAPS, cap, label, wrap, sealed, channelDoc, groupDoc, dmDoc, DMID } from './helpers.js';
import { validateForKind } from '../src/schemas.js';

let S, olga, adam, sam, nora, hank;
before(async () => {
  S = await startServer({ authz: 'standard' });
  [olga, adam, sam, nora, hank] = await Promise.all(['olga', 'adam', 'sam', 'nora', 'hank'].map(async (h) => signup(S.url, await makeIdentity(h))));
});
after(async () => { for (const X of [olga, adam, sam, nora, hank]) await X.close(); await S.stop(); });

const chid = (s) => ('c' + s + '0'.repeat(12)).slice(0, 13);
// The lists as a page seals them ({ members, banned } with the rest, under the epoch's chat key): the server sees only e, iv and ct.
const LISTS = (s, e = 0) => ({ e, iv: 'aXY=', ct: Buffer.from('lists: ' + s).toString('base64') });
const PREVIEW = ['akeys', 'epoch', 'keys', 'type', 'visibility'];
const rec = async (x, cid) => (await x.ok('get', { p: 'channels/' + cid })).d;
const noLists = (d) => { const { meta, ...rest } = d; return rest; };
const LISTING = { p: 'channels', w: [['visibility', '==', 'public']], l: 100 };

test('the owner\'s rule: a private channel\'s member and blocked lists reach only its owner and its admins; a subscriber and a non-member get none by get, mget, a watch\'s first answer or a live change after an admin\'s Add; the subscriber still gets the rest of the record (the key wraps, the owner\'s part, the epoch) and is never refused; the non-member gets the preview and its watch is refused, as before', async () => {
  const cid = chid('Owner'), P = 'channels/' + cid, { caps } = await createChat(olga, cid, channelDoc({ meta: LISTS('olga adam sam'), ometa: sealed(0) }));
  await adam.ok('chat.open', { cid, cap: caps.a });
  await sam.ok('chat.open', { cid, cap: caps.m });
  const whole = await rec(olga, cid), staff = [[olga, 'the owner'], [adam, 'an admin']];
  assert.deepEqual(whole.meta, LISTS('olga adam sam'));
  // get and mget
  for (const [x, who] of staff) {
    assert.deepEqual(await rec(x, cid), whole, who + ': get, the whole record');
    assert.deepEqual((await x.ok('mget', { ps: [P] })).docs[0].d, whole, who + ': mget, the same');
  }
  const mine = await rec(sam, cid);
  assert.equal(mine.meta, undefined, 'a subscriber: get, no lists');
  assert.deepEqual(mine, noLists(whole), 'everything else as the owner reads it');
  assert.deepEqual([mine.epoch, mine.ometa, Object.keys(mine.keys)], [0, sealed(0), ['0']], 'the epoch, the owner\'s part, the key wraps');
  assert.deepEqual((await sam.ok('mget', { ps: [P] })).docs[0].d, noLists(whole), 'mget: the same, no lists');
  assert.deepEqual(Object.keys(await rec(nora, cid)).sort(), PREVIEW, 'a non-member: get, the preview, as before');
  assert.deepEqual(Object.keys((await nora.ok('mget', { ps: [P] })).docs[0].d).sort(), PREVIEW, 'mget: the same');
  // a watch's first answer
  for (const x of [olga, adam, sam]) await x.ok('sub', { s: 'L', p: 'channels', ids: [cid] });
  const first = async (x) => (await x.waitPush((f) => f.s === 'L' && f.t === 'init')).docs[0].d;
  for (const [x, who] of staff) assert.deepEqual(await first(x), whole, who + ': the watch starts with the whole record');
  assert.deepEqual(await first(sam), noLists(whole), 'the subscriber\'s watch: accepted, and it starts with no lists');
  assert.equal((await nora.call('sub', { s: 'L', p: 'channels', ids: [cid] })).e, 'denied', 'a non-member\'s watch: refused, as before');
  // a live change: an admin adds someone, so the lists are sealed again
  await adam.ok('update', { p: P, d: { meta: LISTS('olga adam sam zoe') } });
  const next = async (x) => (await x.waitPush((f) => f.s === 'L' && f.t === 'set' && f.id === cid)).d;
  for (const [x, who] of staff) assert.deepEqual((await next(x)).meta, LISTS('olga adam sam zoe'), who + ': the new lists, live');
  const pushed = await next(sam);
  assert.equal(pushed.meta, undefined, 'the subscriber: the change, with no lists');
  assert.deepEqual(pushed, noLists(await rec(olga, cid)), 'and the rest of the record as it is now');
  // his own write, a wrap of the key for a new device of his, goes out to everyone again: to him with no lists
  await sam.ok('update', { p: P, d: { keys: { 0: { [label()]: wrap() } } } });
  for (const [x, who] of staff) assert.deepEqual((await next(x)).meta, LISTS('olga adam sam zoe'), who + ': his wrap, with the lists');
  const own = await next(sam);
  assert.deepEqual([own.meta, Object.keys(own.keys[0]).length], [undefined, 2], 'his own wrap comes back to him, with no lists');
  assert.ok(await nora.noPush((f) => f.s === 'L', 200), 'nothing reaches the non-member');
  for (const x of [olga, adam, sam]) await x.ok('unsub', { s: 'L' });
});

test('the level that counts is the one a connection holds as each change goes out, not when its watch began: an admin who opens the channel again with the member key on the same connection gets no lists from the next change on, and with the admin key again gets them back; an admin the owner drops reads none, opened again with the member key', async () => {
  const cid = chid('Level'), P = 'channels/' + cid, { caps } = await createChat(olga, cid, channelDoc({ meta: LISTS('a') }));
  await adam.ok('chat.open', { cid, cap: caps.a });
  await adam.ok('sub', { s: 'V', p: 'channels', ids: [cid] });
  assert.deepEqual((await adam.waitPush((f) => f.s === 'V' && f.t === 'init')).docs[0].d.meta, LISTS('a'), 'an admin\'s watch: the lists');
  const next = async () => (await adam.waitPush((f) => f.s === 'V' && f.t === 'set' && f.id === cid)).d;
  assert.equal((await adam.ok('chat.open', { cid, cap: caps.m })).level, 'member');   // nothing evicts him: his watch goes on
  await olga.ok('update', { p: P, d: { meta: LISTS('b') } });
  assert.equal((await next()).meta, undefined, 'at member level now: the change, with no lists');
  assert.equal((await rec(adam, cid)).meta, undefined, 'and get the same');
  assert.equal((await adam.ok('chat.open', { cid, cap: caps.a })).level, 'admin');
  await olga.ok('update', { p: P, d: { meta: LISTS('c') } });
  assert.deepEqual((await next()).meta, LISTS('c'), 'an admin again: the lists');
  // dropped: the owner replaces the admin secret, which ends his views; opened again with the member key he reads no lists
  await olga.ok('chat.admins', { cid, akeys: { [label()]: wrap() }, cap: cap() });
  assert.deepEqual((await next()).meta, LISTS('c'), 'the owner\'s change itself reaches him while he is still an admin');
  await adam.waitPush((f) => f.t === 'evict' && f.cid === cid);
  assert.equal((await adam.call('chat.open', { cid, cap: caps.a })).e, 'denied', 'the old admin key opens nothing');
  await adam.ok('chat.open', { cid, cap: caps.m });
  assert.equal((await rec(adam, cid)).meta, undefined, 'get: none');
  await adam.ok('sub', { s: 'V', p: 'channels', ids: [cid] });
  assert.equal((await adam.waitPush((f) => f.s === 'V' && f.t === 'init')).docs[0].d.meta, undefined, 'his watch: none');
  await olga.ok('update', { p: P, d: { meta: LISTS('d') } });
  assert.equal((await next()).meta, undefined, 'nor any change after');
  await adam.ok('unsub', { s: 'V' });
});

test('an owner or admin whose account isn\'t secured opens at member level, its tools waiting (SPEC.md 4.6), and still reads the lists by the key it proved: by get, its watch and every change; an admin\'s write stays refused', async () => {
  const cid = chid('Held'), P = 'channels/' + cid, { caps } = await createChat(olga, cid, channelDoc({ meta: LISTS('h') }));
  S.srv.limits.powerNeedsSecure = true;   // the rule on: Hank never secured his account
  let r;
  try { r = await hank.ok('chat.open', { cid, cap: caps.a }); } finally { S.srv.limits.powerNeedsSecure = false; }
  assert.deepEqual([r.level, r.held], ['member', 'admin'], 'held at member level');
  assert.deepEqual((await rec(hank, cid)).meta, LISTS('h'), 'get: the lists his key opens');
  await hank.ok('sub', { s: 'H', p: 'channels', ids: [cid] });
  assert.deepEqual((await hank.waitPush((f) => f.s === 'H' && f.t === 'init')).docs[0].d.meta, LISTS('h'), 'his watch: the same');
  await olga.ok('update', { p: P, d: { meta: LISTS('h2') } });
  assert.deepEqual((await hank.waitPush((f) => f.s === 'H' && f.t === 'set' && f.id === cid)).d.meta, LISTS('h2'), 'and every change');
  assert.equal((await hank.call('update', { p: P, d: { meta: LISTS('h3') } })).e, 'denied', 'his admin tools wait');
  await hank.ok('unsub', { s: 'H' });
});

test('a group is as before: its members see each other, so a member reads its lists by get, mget, a watch and every change', async () => {
  const g = 'gLists0000001', P = 'channels/' + g, { caps } = await createChat(olga, g, groupDoc({ meta: LISTS('g') }));
  await sam.ok('chat.open', { cid: g, cap: caps.m });
  assert.deepEqual((await rec(sam, g)).meta, LISTS('g'), 'get');
  assert.deepEqual((await sam.ok('mget', { ps: [P] })).docs[0].d.meta, LISTS('g'), 'mget');
  await sam.ok('sub', { s: 'G', p: 'channels', ids: [g] });
  assert.deepEqual((await sam.waitPush((f) => f.s === 'G' && f.t === 'init')).docs[0].d.meta, LISTS('g'), 'a watch');
  await olga.ok('update', { p: P, d: { meta: LISTS('g2') } });
  assert.deepEqual((await sam.waitPush((f) => f.s === 'G' && f.t === 'set' && f.id === g)).d.meta, LISTS('g2'), 'a change');
  await sam.ok('unsub', { s: 'G' });
});

test('the public listing hands out no sealed list: going private, a channel keeps the fresh lists chat.rotate seals under its new key until the owner\'s update makes it private, and the listing leaves them out for anyone signed in, a subscriber holding the new key and the owner alike; that subscriber\'s get has none either; the owner reads them', async () => {
  const cid = chid('GoPriv'), caps = CAPS();
  await createChat(olga, cid, channelDoc({ visibility: 'public', name: 'News', desc: '', photo: null, owner: 'olga', admins: [], meta: undefined, openKeys: { 0: 'k'.repeat(44) } }), caps);
  const k1 = cap(), fresh = LISTS('olga sam', 1);
  await olga.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: k1, meta: fresh });   // as the page goes private: the new key and its lists first
  assert.deepEqual((await rec(olga, cid)).meta, fresh, 'the owner reads them (kept: channel-privacy.test.js)');
  await sam.ok('chat.open', { cid, cap: k1 });   // he is on the new lists: the new key is his
  for (const [x, who] of [[nora, 'anyone signed in'], [sam, 'a subscriber holding the new key'], [olga, 'the owner']]) {
    const row = (await x.ok('query', LISTING)).docs.find((d) => d.id === cid);
    assert.deepEqual([row && row.d.visibility, row && row.d.name], ['public', 'News'], who + ': still listed, as before');
    assert.equal(row.d.meta, undefined, who + ': no lists in the listing');
  }
  assert.equal((await rec(sam, cid)).meta, undefined, 'his get: none');
});

// The subscriber count, n (SPEC.md 5.3): admin level writes it, as the member and blocked lists, and it is no name.
test('a private channel\'s subscriber count n: the owner and an admin write it and the record keeps it, through a subscriber\'s own write and a key change; a subscriber\'s write of it is denied; a subscriber gets it by get, mget, a watch\'s first answer and a live change, with no lists; a non-member\'s preview has none', async () => {
  const cid = chid('Count'), P = 'channels/' + cid, { caps } = await createChat(olga, cid, channelDoc({ meta: LISTS('olga adam sam') }));
  await adam.ok('chat.open', { cid, cap: caps.a });
  await sam.ok('chat.open', { cid, cap: caps.m });
  await olga.ok('update', { p: P, d: { n: 2 } });
  assert.equal((await rec(olga, cid)).n, 2, 'the owner\'s');
  await adam.ok('update', { p: P, d: { n: 3 } });
  assert.equal((await rec(olga, cid)).n, 3, 'an admin\'s');
  const r = await sam.call('update', { p: P, d: { n: 9 } });
  assert.deepEqual([r.e, r.m, (await rec(olga, cid)).n], ['denied', 'this needs admin access to the chat', 3], 'a subscriber\'s: denied');
  const mine = await rec(sam, cid);
  assert.deepEqual([mine.n, mine.meta], [3, undefined], 'a subscriber\'s get: the count, no lists');
  assert.deepEqual((await sam.ok('mget', { ps: [P] })).docs[0].d, mine, 'mget: the same');
  await sam.ok('sub', { s: 'N', p: 'channels', ids: [cid] });
  assert.deepEqual((await sam.waitPush((f) => f.s === 'N' && f.t === 'init')).docs[0].d, mine, 'a watch\'s first answer: the same');
  await adam.ok('update', { p: P, d: { n: 4 } });
  const pushed = (await sam.waitPush((f) => f.s === 'N' && f.t === 'set' && f.id === cid)).d;
  assert.deepEqual([pushed.n, pushed.meta], [4, undefined], 'a live change: the new count, no lists');
  await sam.ok('unsub', { s: 'N' });
  assert.deepEqual(Object.keys(await rec(nora, cid)).sort(), PREVIEW, 'a non-member: the preview, as before, with no count');
  await sam.ok('update', { p: P, d: { keys: { 0: { [label()]: wrap() } } } });   // a wrap for a new device of his
  await olga.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: LISTS('olga adam sam', 1) });
  assert.equal((await rec(olga, cid)).n, 4, 'kept through his write and the key change');
});

test('n is a whole number from 0 to 100000 on a private channel and nothing else: any other value is refused, and so is n on a group (created with one, or an update) and on a one-on-one chat (created with one, or an update)', async () => {
  const cid = chid('CountNo'), P = 'channels/' + cid;
  const said = async (op, f) => { const r = await olga.call(op, f); return r.ok ? 'ok' : r.e + ' (' + r.m + ')'; };
  await createChat(olga, cid, channelDoc());
  for (const n of [0, 100000]) { await olga.ok('update', { p: P, d: { n } }); assert.equal((await rec(olga, cid)).n, n, 'takes ' + n); }
  for (const n of [-1, 2.5, '4', 100001, true, [4], {}]) assert.equal(await said('update', { p: P, d: { n } }), 'invalid (chat: bad "n")', JSON.stringify(n));
  assert.equal((await rec(olga, cid)).n, 100000, 'and none of them was stored');
  const g = 'gCount0000001';
  assert.equal(await said('chat.create', { cid: g, d: groupDoc({ n: 2 }), caps: CAPS() }), 'invalid (chat: bad "n")', 'a group created with n');
  await createChat(olga, g, groupDoc());
  assert.equal(await said('update', { p: 'channels/' + g, d: { n: 2 } }), 'invalid (chat: bad "n")', 'a group\'s owner\'s update');
  assert.equal(await said('chat.create', { cid: DMID, d: dmDoc({ n: 2 }), caps: { m: cap() } }), 'invalid (chat: bad "n")', 'a one-on-one chat created with n');
  await createChat(olga, DMID, dmDoc(), { m: cap() });
  assert.equal(await said('update', { p: 'channels/' + DMID, d: { n: 2 } }), 'denied (this needs admin access to the chat)', 'its member\'s update');
  assert.deepEqual([(await rec(olga, g)).n, (await rec(olga, DMID)).n], [undefined, undefined], 'neither carries one');
});

test('a public channel carries no n: Make public, sent as the page sends it while the record has a count, succeeds and drops it, so neither the listing nor a visitor\'s preview shows one; a later update or set that includes n, and a public channel created with one, store none', async () => {
  const cid = chid('CountPub'), P = 'channels/' + cid, has = async (x, c) => 'n' in (await rec(x, c));
  await createChat(olga, cid, channelDoc({ ometa: sealed(0) }));
  await olga.ok('update', { p: P, d: { n: 7 } });
  // the page's setVisibility names no n, so the merge alone would keep the private-era count
  await olga.ok('update', { p: P, d: { visibility: 'public', openKeys: { 0: 'k'.repeat(44) }, name: 'News', desc: '', photo: null, owner: 'olga', admins: [], meta: null, ometa: null, invites: {} } });
  assert.deepEqual([(await rec(olga, cid)).visibility, await has(olga, cid)], ['public', false], 'public, and no count');
  assert.ok(!('n' in (await nora.ok('query', LISTING)).docs.find((x) => x.id === cid).d), 'the listing: none');
  assert.equal(await has(nora, cid), false, 'a visitor\'s preview: none');
  await olga.ok('update', { p: P, d: { n: 5 } });
  assert.equal(await has(olga, cid), false, 'an update of n: taken, and nothing stored');
  await olga.ok('set', { p: P, d: { ...(await rec(olga, cid)), n: 5 } });
  assert.equal(await has(olga, cid), false, 'nor by set');
  const c2 = chid('CountPub2');
  await createChat(olga, c2, channelDoc({ visibility: 'public', name: 'More', desc: '', photo: null, owner: 'olga', admins: [], meta: undefined, openKeys: { 0: 'k'.repeat(44) }, n: 3 }));
  assert.equal(await has(olga, c2), false, 'nor by chat.create');
  assert.throws(() => validateForKind('channels', { id: c2, op: 'set' }, { type: 'channel', visibility: 'public', n: 3 }), /bad "n"/, 'and a writer that kept one would be refused, never store it');
});
