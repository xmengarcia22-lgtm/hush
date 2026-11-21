// Release 91, member cards (SPEC.md 5.6): one sealed card of one size per account per private channel, at a keyed tag, written
// with chat.card (member level) or chat.ask (an approval link's proof); admins read, watch and delete them; they go after 30 days,
// with their chat, with their account and with a block. A channel holds 10,000; past that a join request or a stale card gives way.
// Release 93: chat.slots tells the owner's or an admin's page, holding the current member key, the tag each author's card sits under.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { startServer, signup, connect, connectAs, makeIdentity, createChat, channelDoc, groupDoc, dmDoc, cap, label, wrap, sealed } from './helpers.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const chid = (s) => ('c' + s + '0'.repeat(12)).slice(0, 13);
const ct = (n = 528) => Buffer.alloc(n, 7).toString('base64');
const card = (cid, e = 0, over = {}) => ({ cid, e, iv: 'aXY=', ct: ct(), ...over });
const PROOF = 'proof-' + 'a'.repeat(30);
const invite = (over = {}) => ({ iNvAsk000001: { iv: 'aXY=', ct: 'Y3Q=', ph: sha(PROOF), ts: T, ...over } });
const ask = (cid, proof = PROOF, iid = 'iNvAsk000001') => ({ cid, iid, proof, iv: 'aXY=', ct: ct() });
const DAY = 86_400_000;

let T = Date.now(), S, A, B, C, D, ids;
before(async () => {
  S = await startServer({ authz: 'standard', now: () => T });
  ids = await Promise.all(['alice', 'bob', 'carol', 'dave'].map(makeIdentity));
  [A, B, C, D] = await Promise.all(ids.map((id) => signup(S.url, id)));
});
after(async () => { for (const X of [A, B, C, D]) await X.close(); await S.stop(); });

const roll = async (X, cid) => (await X.ok('query', { p: `channels/${cid}/roll`, l: 100 })).docs;
const rows = (cid) => Number(S.srv.store.db.prepare('SELECT COUNT(*) AS n FROM docs WHERE parent = ?').get(`channels/${cid}/roll`).n);

test('a member writes one card per channel; admins see it under a tag that names nobody, and a newer one replaces it', async () => {
  const cid = chid('Card'), { caps } = await createChat(A, cid, channelDoc());
  await C.ok('chat.open', { cid, cap: caps.m });
  await B.ok('chat.open', { cid, cap: caps.a });
  await B.ok('sub', { s: 'r', p: `channels/${cid}/roll`, l: 100 });
  await C.ok('chat.card', card(cid));
  let r = await roll(A, cid);
  assert.equal(r.length, 1);
  assert.match(r[0].id, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!r[0].id.includes('carol'));
  assert.deepEqual(r[0].d, { e: 0, iv: 'aXY=', ct: ct(), ts: T }, 'the time is the server\'s');
  await B.waitPush((f) => f.s === 'r' && f.t === 'set' && f.id === r[0].id);
  T += 1000;
  await C.ok('chat.card', card(cid, 0, { iv: 'bmV3' }));
  r = await roll(A, cid);
  assert.deepEqual([r.length, r[0].d.iv, r[0].d.ts], [1, 'bmV3', T], 'replaced, not added');
  const P = `channels/${cid}/roll/${r[0].id}`;
  assert.equal((await C.call('get', { p: P })).e, 'denied', 'a member reads no card, not even their own');
  assert.equal((await C.call('query', { p: `channels/${cid}/roll`, l: 10 })).e, 'denied');
  assert.equal((await C.call('delete', { p: P })).e, 'denied');
  for (const X of [C, A]) assert.equal((await X.call('set', { p: P, d: r[0].d })).e, 'denied', 'cards come only from chat.card and chat.ask');
  assert.equal((await A.call('update', { p: P, d: { iv: 'eA==' } })).e, 'denied');
  assert.deepEqual((await B.ok('get', { p: P })).d, r[0].d);
  await B.ok('delete', { p: P });
  await B.waitPush((f) => f.s === 'r' && f.t === 'del' && f.id === r[0].id);
  assert.equal(rows(cid), 0);
});

test('a card is 528 bytes sealed under an epoch the channel has reached', async () => {
  const cid = chid('Shape'), { caps } = await createChat(A, cid, channelDoc());
  await C.ok('chat.open', { cid, cap: caps.m });
  for (const [what, f] of [['527 bytes', { ct: ct(527) }], ['529 bytes', { ct: ct(529) }], ['an epoch ahead', { e: 1 }], ['no epoch', { e: undefined }],
    ['1.5', { e: 1.5 }], ['no iv', { iv: undefined }], ['an iv too long', { iv: 'i'.repeat(65) }], ['a bad chat id', { cid: 'nope' }]]) {
    assert.equal((await C.call('chat.card', card(cid, 0, f))).e, 'invalid', what);
  }
  assert.equal(rows(cid), 0);
});

test('only a private channel keeps cards, and only for those who opened it', async () => {
  const cid = chid('Where'), { caps } = await createChat(A, cid, channelDoc());
  assert.equal((await D.call('chat.card', card(cid))).e, 'denied', 'no level');
  const anon = await connect(S.url);
  await anon.hello();
  assert.equal((await anon.call('chat.card', card(cid))).e, 'unauth');
  await anon.close();
  const ghost = await connectAs(S.url, await makeIdentity('ghost'), { pub: true });   // a sign-up proof, no account made: free
  await ghost.ok('chat.open', { cid, cap: caps.m });
  assert.equal((await ghost.call('chat.card', card(cid))).e, 'unauth', 'every unused name would be a card');
  await ghost.close();
  assert.equal((await C.call('chat.card', card(chid('NoSuch')))).e, 'notfound');
  const g = 'gWhere0000001', gc = await createChat(A, g, groupDoc());
  await C.ok('chat.open', { cid: g, cap: gc.caps.m });
  assert.equal((await C.call('chat.card', card(g))).e, 'denied', 'a group');
  const dm = 'd' + 'CardDm'.padEnd(22, 'x');
  await createChat(A, dm, dmDoc(), { m: cap() });
  assert.equal((await A.call('chat.card', card(dm))).e, 'denied', 'a DM');
  const pub = chid('Public'), pc = await createChat(A, pub, channelDoc({ visibility: 'public' }));
  await C.ok('chat.open', { cid: pub, cap: pc.caps.m });
  assert.equal((await C.call('chat.card', card(pub))).e, 'denied', 'a public channel');
  await A.ok('update', { p: 'channels/' + pub, d: { invites: invite() } });
  assert.equal((await D.call('chat.ask', ask(pub))).e, 'invalid', 'not denied: that would count as a wrong link');
  await C.ok('chat.open', { cid, cap: caps.m });
  await C.ok('chat.card', card(cid));
});

test('a subscriber\'s card is taken; their service note is not (only owners and admins post in a channel)', async () => {
  const cid = chid('Sub'), { caps } = await createChat(A, cid, channelDoc());
  await D.ok('chat.open', { cid, cap: caps.m });
  await D.ok('chat.card', card(cid));
  assert.equal((await D.call('set', { p: `channels/${cid}/posts/pJoin0000001`, d: { sv: 1, ts: T, e: 0, n: 'n', d: 'd' } })).e, 'denied');
  assert.equal(rows(cid), 1);
});

test('chat.ask: an approval link\'s proof, an account that exists, not blocked; a wrong proof counts as a wrong link', async () => {
  const L = await startServer({ authz: 'standard', limits: { openFailsPerMin: 3 } });
  const [own, ann, ben] = await Promise.all([makeIdentity('owen'), makeIdentity('ann'), makeIdentity('ben')]);
  const O = await signup(L.url, own), N = await signup(L.url, ann), X = await signup(L.url, ben);
  try {
    const cid = chid('Ask'), { caps } = await createChat(O, cid, channelDoc());
    await O.ok('update', { p: 'channels/' + cid, d: { invites: invite() } });
    await O.ok('chat.ban', { cid, h: 'ben', on: true });
    assert.equal((await X.call('chat.ask', ask(cid))).e, 'banned', 'the right proof, then the block list');
    assert.equal((await X.call('chat.ask', ask(cid, 'wrong-' + PROOF))).e, 'denied', 'a blocked account with a wrong proof learns nothing more');
    assert.equal((await N.call('chat.ask', { ...ask(cid), iid: ['iNvAsk000001'] })).e, 'invalid', 'a link id is a string');
    await N.ok('chat.ask', ask(cid));
    let r = (await O.ok('query', { p: `channels/${cid}/roll`, l: 10 })).docs;
    assert.equal(r.length, 1);
    assert.deepEqual(Object.keys(r[0].d).sort(), ['ct', 'iid', 'iv', 'ts'], 'a join request names its link, not an epoch');
    assert.equal(r[0].d.iid, 'iNvAsk000001');
    await N.ok('chat.open', { cid, cap: caps.m });
    await N.ok('chat.card', card(cid));
    r = (await O.ok('query', { p: `channels/${cid}/roll`, l: 10 })).docs;
    assert.deepEqual([r.length, r[0].d.e, r[0].d.iid], [1, 0, undefined], 'a later card from the same account replaces the request');
    const fresh = await connectAs(L.url, await makeIdentity('nobody'), { pub: true });   // a sign-up proof, no account made
    assert.equal((await fresh.call('chat.ask', ask(cid))).e, 'unauth');
    await fresh.close();
    const g = 'gAsk000000001', pub = chid('AskPub');
    await createChat(O, g, groupDoc({ invites: invite() }));
    await createChat(O, pub, channelDoc({ visibility: 'public', invites: invite() }));
    for (const c of [g, g, pub, pub]) assert.equal((await N.call('chat.ask', ask(c))).e, 'invalid', 'a group or public channel: not counted as a wrong link');
    assert.equal((await N.call('chat.ask', ask(cid, PROOF, 'iNvGone00001'))).e, 'denied', 'no such link: as a wrong one');
    assert.equal((await N.call('chat.ask', ask(cid, 'wrong-' + PROOF))).e, 'denied');
    assert.equal((await N.call('chat.ask', ask(cid))).e, 'ratelimit', 'three wrong links from here: wait a minute');
  } finally { await O.close(); await N.close(); await X.close(); await L.stop(); }
});

test('a channel holds cardsPerChat cards: past that a new one takes the place of the oldest join request or stale card, or is refused', async () => {
  let t = Date.now();
  const L = await startServer({ authz: 'standard', now: () => t, limits: { cardsPerChat: 3 } });
  const ppl = await Promise.all(['owen', 'mia', 'max', 'meg', 'moe'].map(makeIdentity));
  const [O, M1, M2, M3, M4] = await Promise.all(ppl.map((id) => signup(L.url, id)));
  const tick = () => { t += 1000; };
  try {
    const cid = chid('Cap'), { caps } = await createChat(O, cid, channelDoc({ invites: invite({ ts: t }) }));
    for (const X of [M1, M2, M3, M4]) await X.ok('chat.open', { cid, cap: caps.m });
    const RP = `channels/${cid}/roll`;
    await O.ok('sub', { s: 'r', p: RP, l: 100 });
    const list = async () => (await O.ok('query', { p: RP, o: ['ts', 'asc'], l: 10 })).docs;   // oldest first
    for (const X of [M1, M2, M3]) { tick(); await X.ok('chat.card', card(cid)); }
    assert.equal((await M4.call('chat.card', card(cid))).e, 'toolarge', 'full, and every card is a member\'s for this key: none gives way');
    tick(); await M1.ok('chat.card', card(cid, 0, { iv: 'bmV3' }));   // a replacement always fits: [M2, M3, M1]
    await O.ok('delete', { p: `${RP}/${(await list())[0].id}` });     // an admin's page clears M2's
    tick(); await M4.ok('chat.card', card(cid));                      // room again: [M3, M1, M4]
    await O.ok('delete', { p: `${RP}/${(await list())[0].id}` });     // and M3's: [M1, M4]
    tick(); await M2.ok('chat.ask', ask(cid));                        // full again, with a join request
    const askId = (await list()).find((x) => x.d.iid).id;
    tick(); await M3.ok('chat.card', card(cid));                      // a member's card: the request gives way
    let now = await list();
    assert.equal(now.length, 3);
    assert.ok(!now.some((x) => x.id === askId) && now.every((x) => x.d.e === 0));
    await O.waitPush((f) => f.s === 'r' && f.t === 'del' && f.id === askId);
    for (const e of [1, 2]) await O.ok('chat.rotate', { cid, epoch: e, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(e), invites: invite({ ts: t }) });   // an approval link survives a key change
    const oldest = now[0].id;
    tick(); await M2.ok('chat.ask', ask(cid));                        // every card is from two keys back now: the oldest gives way
    now = await list();
    assert.equal(now.length, 3);
    assert.ok(!now.some((x) => x.id === oldest) && now.some((x) => x.d.iid), 'the request is in, in place of the oldest stale card');
  } finally { for (const X of [O, M1, M2, M3, M4]) await X.close(); await L.stop(); }
});

test('a card goes 30 days after it was written, with its channel, with its account and with a block', async () => {
  const cid = chid('Gone'), { caps } = await createChat(A, cid, channelDoc()), t0 = T;
  await B.ok('chat.open', { cid, cap: caps.a });
  await B.ok('sub', { s: 'g', p: `channels/${cid}/roll`, l: 100 });
  await C.ok('chat.open', { cid, cap: caps.m });
  await C.ok('chat.card', card(cid));
  const id = (await roll(A, cid))[0].id;
  S.srv.sweep(t0 + 30 * DAY - 1);
  assert.equal(rows(cid), 1, 'still there a moment before');
  S.srv.sweep(t0 + 30 * DAY + 1);
  assert.equal(rows(cid), 0);
  await B.waitPush((f) => f.s === 'g' && f.t === 'del' && f.id === id);

  await C.ok('chat.card', card(cid));
  await A.ok('chat.ban', { cid, h: 'carol', on: true });
  await B.waitPush((f) => f.s === 'g' && f.t === 'del' && f.id === id);
  assert.equal(rows(cid), 0, 'a block takes their card: a join card from just before can\'t bring them back');
  await A.ok('chat.ban', { cid, h: 'carol', on: false });

  await B.ok('chat.ban', { cid, h: 'alice', on: true });   // an admin blocking the owner changes nothing for the owner's tools
  await A.ok('chat.ban', { cid, h: 'bob', on: true });
  assert.equal((await B.call('chat.card', card(cid))).e, 'denied', 'a blocked admin still holds the admin key, and may not');
  await A.ok('chat.card', card(cid));
  await A.ok('delete', { p: 'channels/' + cid });
  assert.equal(rows(cid), 0, 'the channel takes its cards');

  const g = chid('GoneAcct'), gc = await createChat(A, g, channelDoc());
  const gina = await makeIdentity('gina'), G = await signup(S.url, gina);
  await G.ok('chat.open', { cid: g, cap: gc.caps.m });
  await G.ok('chat.card', card(g));
  await D.ok('chat.open', { cid: g, cap: gc.caps.m });
  await D.ok('chat.card', card(g));
  const del = await connectAs(S.url, gina);
  await del.ok('account.delete', {});
  await del.closed;
  assert.equal(rows(g), 1, 'her card went with her account; dave\'s stays');
});

// ---- chat.slots (release 93): which tag each author's card sits under ----
// The id of the card X's chat.card just wrote: the roll read as the owner before and after.
const wrote = async (X, cid, over) => {
  const had = new Set((await roll(A, cid)).map((r) => r.id));
  await X.ok('chat.card', card(cid, 0, over));
  const got = (await roll(A, cid)).filter((r) => !had.has(r.id));
  assert.equal(got.length, 1, 'one new card');
  return got[0].id;
};

test('chat.slots (release 93): an owner or admin holding the current member key gets, for each username, the tag its card sits under, so a copy of one account\'s card written again from another account\'s slot is told from the original; a name with no card gets the tag its card would take', async () => {
  const cid = chid('Slots'), { caps } = await createChat(A, cid, channelDoc());
  await B.ok('chat.open', { cid, cap: caps.a });
  for (const X of [C, D]) await X.ok('chat.open', { cid, cap: caps.m });
  const carol = await wrote(C, cid, { iv: 'Y2Fyb2w=' }), bob = await wrote(B, cid), alice = await wrote(A, cid);
  const hs = ['carol', 'bob', 'alice', 'dave', 'carol'], r = await A.ok('chat.slots', { cid, cap: caps.m, hs });
  assert.deepEqual(Object.keys(r).sort(), ['i', 'ok', 'tags']);
  assert.deepEqual([r.tags[0], r.tags[1], r.tags[2], r.tags[4]], [carol, bob, alice, carol], 'each author\'s own card, in the order asked; a name asked twice gets it twice');
  assert.match(r.tags[3], /^[A-Za-z0-9_-]{43}$/);
  assert.ok(![carol, bob, alice].includes(r.tags[3]), 'dave has written no card');
  const copy = await wrote(D, cid, { iv: 'Y2Fyb2w=' });   // dave writes carol's card again, byte for byte
  assert.equal(copy, r.tags[3], 'it sits in dave\'s slot, under the tag asked for him before he wrote');
  assert.deepEqual((await roll(A, cid)).filter((x) => x.d.iv === 'Y2Fyb2w=').map((x) => x.id).sort(), [carol, copy].sort(), 'two cards alike, told apart only by their slots');
  assert.deepEqual((await B.ok('chat.slots', { cid, cap: caps.m, hs })).tags, r.tags, 'an admin gets the same answer');
});

test('chat.slots answers only the owner, or an admin who is not blocked, of a private channel: no level, a member, a blocked admin, a group, a one-on-one chat and a public channel are denied, a chat that isn\'t there is notfound, and a connection not signed in unauth', async () => {
  const cid = chid('SlotWho'), { caps } = await createChat(A, cid, channelDoc()), ask = { cid, cap: caps.m, hs: ['carol'] };
  await B.ok('chat.open', { cid, cap: caps.a });
  await C.ok('chat.open', { cid, cap: caps.m });
  const anon = await connect(S.url);
  await anon.hello();
  assert.equal((await anon.call('chat.slots', ask)).e, 'unauth');
  await anon.close();
  assert.equal((await D.call('chat.slots', ask)).e, 'denied', 'no level');
  assert.equal((await C.call('chat.slots', ask)).e, 'denied', 'a member, who reads no cards');
  await A.ok('chat.ban', { cid, h: 'bob', on: true });
  assert.equal((await B.call('chat.slots', ask)).e, 'denied', 'a blocked admin, who still holds the admin key');
  await A.ok('chat.ban', { cid, h: 'bob', on: false });
  assert.equal((await B.ok('chat.slots', ask)).tags.length, 1, 'unblocked, the admin may');
  await B.ok('chat.ban', { cid, h: 'alice', on: true });
  assert.equal((await A.ok('chat.slots', ask)).tags.length, 1, 'an admin blocking the owner changes nothing for the owner');
  assert.equal((await A.call('chat.slots', { ...ask, cid: chid('NoSlots') })).e, 'notfound');
  const g = 'gSlots0000001', gc = await createChat(A, g, groupDoc());
  assert.equal((await A.call('chat.slots', { ...ask, cid: g, cap: gc.caps.m })).e, 'denied', 'a group, even to its owner');
  const dm = 'd' + 'SlotsDm'.padEnd(22, 'x'), dc = { m: cap() };
  await createChat(A, dm, dmDoc(), dc);
  assert.equal((await A.call('chat.slots', { ...ask, cid: dm, cap: dc.m })).e, 'denied', 'a one-on-one chat');
  const pub = chid('SlotsPub'), pc = await createChat(A, pub, channelDoc({ visibility: 'public' }));
  assert.equal((await A.call('chat.slots', { ...ask, cid: pub, cap: pc.caps.m })).e, 'denied', 'a public channel, even to its owner: it keeps no cards');
});

test('chat.slots needs the channel\'s current member key: the one from before a key change, or any other key, is conflict, so a page that raced a key change reads again; a member, or a connection the key change evicted, is denied whatever the key', async () => {
  const cid = chid('SlotStale'), { caps } = await createChat(A, cid, channelDoc()), hs = ['carol'];
  await B.ok('chat.open', { cid, cap: caps.a });
  await C.ok('chat.open', { cid, cap: caps.m });
  const was = (await B.ok('chat.slots', { cid, cap: caps.m, hs })).tags, m1 = cap();
  await A.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: m1, meta: sealed(1) });
  assert.equal((await B.call('chat.slots', { cid, cap: m1, hs })).e, 'denied', 'the key change took the admin\'s level until the page opens the channel again');
  await B.ok('chat.open', { cid, cap: caps.a });
  for (const [what, k] of [['the member key from before the key change', caps.m], ['the admin key', caps.a], ['the owner key', caps.o], ['a key that never was', cap()]]) {
    assert.equal((await B.call('chat.slots', { cid, cap: k, hs })).e, 'conflict', what);
    assert.equal((await A.call('chat.slots', { cid, cap: k, hs })).e, 'conflict', what + ', to the owner too');
  }
  assert.deepEqual((await B.ok('chat.slots', { cid, cap: m1, hs })).tags, was, 'the current key: the same slot as before, since a tag is not tied to an epoch');
  assert.deepEqual((await A.ok('chat.slots', { cid, cap: m1, hs })).tags, was);
  await C.ok('chat.open', { cid, cap: m1 });
  assert.equal((await C.call('chat.slots', { cid, cap: caps.m, hs })).e, 'denied', 'a member is denied whatever the key: who may ask comes first');
});

test('chat.slots takes a chat id, a member key and a list of at most cardsPerChat (10,000) usernames; anything else is invalid', async () => {
  const cid = chid('SlotBad'), { caps } = await createChat(A, cid, channelDoc()), ask = { cid, cap: caps.m, hs: ['carol'] };
  assert.deepEqual((await A.ok('chat.slots', { ...ask, hs: [] })).tags, [], 'an empty list is a list');
  const many = Array.from({ length: 10_000 }, (_, i) => 'u' + String(i).padStart(5, '0')), tags = (await A.ok('chat.slots', { ...ask, hs: many })).tags;
  assert.deepEqual([tags.length, new Set(tags).size], [10_000, 10_000], 'as many names as a channel holds cards, a tag each');
  for (const [what, f] of [['a bad chat id', { cid: 'nope' }], ['a chat id in a list', { cid: [cid] }], ['no key', { cap: undefined }], ['a key one short', { cap: caps.m.slice(1) }],
    ['a key in a list', { cap: [caps.m] }], ['no list', { hs: undefined }], ['a name, not a list', { hs: 'carol' }], ['an object', { hs: { 0: 'carol' } }], ['a number', { hs: [5] }],
    ['null', { hs: [null] }], ['a list in the list', { hs: [['carol']] }], ['capitals', { hs: ['Carol'] }], ['two letters', { hs: ['ab'] }], ['21 letters', { hs: ['a'.repeat(21)] }],
    ['a name with a bar', { hs: ['carol|x'] }], ['one bad name among good ones', { hs: ['carol', 'bob', 'dave/x'] }], ['10,001 names', { hs: [...many, 'u10000'] }]]) {
    assert.equal((await A.call('chat.slots', { ...ask, ...f })).e, 'invalid', what);
  }
});

test('chat.slots spends the connection\'s query budget, the one query and mget share (queriesPerMin)', async () => {
  const L = await startServer({ authz: 'standard', limits: { queriesPerMin: 3 } }), O = await signup(L.url, await makeIdentity('owen'));
  try {
    const cid = chid('SlotCount'), { caps } = await createChat(O, cid, channelDoc()), ask = { cid, cap: caps.m, hs: ['owen'] }, q = { p: `channels/${cid}/roll`, l: 10 };
    await O.ok('chat.slots', ask);
    await O.ok('query', q);
    await O.ok('chat.slots', ask);
    assert.equal((await O.call('chat.slots', ask)).e, 'ratelimit', 'the fourth in a minute of three');
    assert.equal((await O.call('query', q)).e, 'ratelimit', 'and the query after it: one budget');
  } finally { await O.close(); await L.stop(); }
});

test('chat.slots costs a query token for every 300 names it is asked (mget\'s most paths), and at least one: 10,000 names cost 34 of a connection\'s 120 a minute, so a fourth call that size in a minute is ratelimit, while 300 names, or none, cost one, as every call did', async () => {
  const O = await connectAs(S.url, ids[0]);   // the owner on a connection of its own: a full query budget, 120, refilling 2 a second
  try {
    const cid = chid('SlotCost'), { caps } = await createChat(O, cid, channelDoc());
    const ask = (n) => ({ cid, cap: caps.m, hs: Array.from({ length: n }, (_, i) => 'u' + String(i).padStart(5, '0')) });
    for (const k of [1, 2, 3]) assert.equal((await O.ok('chat.slots', ask(10_000))).tags.length, 10_000, `call ${k} of 10,000 names: 34 tokens`);
    const r = await O.call('chat.slots', ask(10_000));
    assert.deepEqual([r.e, r.m], ['ratelimit', 'too many queries, slow down'], 'the fourth in a minute: 18 tokens left, 34 needed; the answer the bucket gives any query');
    for (let k = 0; k < 18; k++) await O.ok('chat.slots', ask(k % 2 ? 0 : 300));   // the 18 left answer nine calls of 300 names and nine of none
    assert.equal((await O.call('chat.slots', ask(2_700))).e, 'ratelimit', 'one token each: none is left for 2,700 names (nine)');
  } finally { await O.close(); }
});
