// Release 92 (page), private channel history: an admin's run on the member cards (SPEC.md 5.6 "Member cards", "Leave"):
// what a batch folds in, the owner's page dropping an admin who left or was blocked, readRoll and cardSigOk. The page harness
// is channel-history-kit.js; the cards themselves and self-healing are channel-history-page.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { offline, pageFor, world, makeChannel, linkOf } from './channel-history-kit.js';

// Shared with channel-history-page.test.js and channel-history-golive.test.js, copied as the removal tests do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
// Someone unlisted who holds the key writes a join card naming no link (a joiner from release 91, say): they wait for an admin's Add.
const victim = async (X, cid) => { const m = X.ls.get('hush:cardsOut:' + X.handle, {}); delete m[cid]; X.ls.set('hush:cardsOut:' + X.handle, m); await X.writeCard(await X.sync(cid), 'join', '', ''); };
const hsOf = (X) => X.waitList().map(([cid, x]) => [cid, [...x.hs].sort()]);   // the notice: who waits, by channel

test('6a. a removal and a dev batch fold in no pending joiner; a leave-only batch does', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true });
    const [B, Dn, E, F, G] = [await w.page('bob'), await w.page('dan'), await w.page('erin'), await w.page('fay'), await w.page('gina')];
    await makeChannel(A, cid, ['alice', 'bob', 'dan']);
    await E.joinPrivate(cid, await linkOf(A, cid));             // Erin's join card at the current epoch
    await A.sync(cid);
    await A.kickMember(cid, 'dan');
    let m = await A.meta(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, m.members, m.banned], [1, ['alice', 'bob'], ['dan']]);
    assert.equal(await E.holds(cid, 1), false, 'a removal wraps nothing for a pending joiner');
    assert.equal(await Dn.holds(cid, 1), false);

    A.kv.bob = 2; await B.writeCard(await B.sync(cid), 'dev');
    await F.joinPrivate(cid, await linkOf(A, cid));
    A.spy.updates.length = 0;
    await A.run(cid);
    m = await A.meta(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, m.members], [2, ['alice', 'bob']]);
    assert.equal(await F.holds(cid, 2), false, 'nor does a dev batch');
    assert.equal(await B.holds(cid, 2), true);
    assert.deepEqual(A.spy.updates, [], 'and no list update for the joiner before it');

    await G.joinPrivate(cid, await linkOf(A, cid));
    await leave(B, cid);
    await A.run(cid);
    m = await A.meta(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, m.members], [3, ['alice', 'gina']]);
    assert.equal(await G.holds(cid, 3), true, 'a leave-only batch brings the joiner in with the new key');
    assert.equal(await B.holds(cid, 3), false);
    assert.equal(await F.holds(cid, 3), false, 'a card from before the last key change still adds no one');
  });
});

test('6b. the owner\'s page drops from ometa an admin who left (two key changes later, made by another admin) and an admin another admin blocked', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true });
    const [X, Y] = [await w.page('xena'), await w.page('yuri')]; await w.page('zoe'); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'xena', 'yuri', 'zoe', 'bob'], ['xena', 'yuri', 'zoe']);
    const l = await linkOf(A, cid);
    await leave(X, cid);
    await Y.run(cid);                                          // another admin's page applies the leave
    assert.deepEqual([Y.spy.rotate.length, Y.spy.rotate[0].why, 'invites' in Y.spy.rotate[0]], [1, 'leave', false], 'an admin left: one leave key change, and no link carried (Xena knows their secrets)');
    await assert.rejects(Y.inviteRaws(cid, l), (e) => e.code === 'notfound');
    assert.deepEqual(Object.keys((await A.sync(cid)).invites || {}), [], 'every open link stopped');
    for (let i = 0; i < 2; i++) { await Y.sync(cid); await Y.rotateTo(Y.S.chatDocs.get(cid), Y.metaOf(await Y.shown(cid))); }
    assert.equal((await A.sync(cid)).epoch, 3);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'yuri', 'zoe', 'bob']);
    assert.deepEqual((await A.readOMeta(await A.sync(cid))).admins, ['xena', 'yuri', 'zoe'], 'only the owner writes ometa: Xena is still named');
    assert.deepEqual(Y.spy.admins, [], 'an admin\'s page never replaces the admin secret');
    await A.run(cid);
    assert.equal(A.spy.admins.length, 1, 'chat.admins: a new admin secret');
    assert.deepEqual((await A.readOMeta(await A.sync(cid))).admins, ['yuri', 'zoe']);
    assert.equal(await X.adminSecret(await X.sync(cid)), null, 'which Xena can\'t open');

    await Y.sync(cid); await Y.kickMember(cid, 'zoe');
    assert.deepEqual((await A.readOMeta(await A.sync(cid))).admins, ['yuri', 'zoe'], 'Yuri\'s page blocked Zoe but can\'t change ometa');
    await A.run(cid);
    assert.equal(A.spy.admins.length, 2);
    assert.deepEqual((await A.readOMeta(await A.sync(cid))).admins, ['yuri'], 'the owner\'s next open drops the blocked admin');
    await A.run(cid);
    assert.equal(A.spy.admins.length, 2, 'nothing more to drop');
  });
});

test('6b. an admin drop whose chat.admins failed is tried again at the owner\'s next open: the admin key goes first, so ometa still names them', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'); await w.page('yuri');
    await makeChannel(A, cid, ['alice', 'xena', 'yuri'], ['xena', 'yuri']);
    await leave(X, cid);
    A.spy.failAdmins = 1;
    await A.run(cid);                                          // offline at chat.admins: swallowed, the next open tries again
    assert.equal(A.spy.admins.length, 1);
    assert.deepEqual((await A.readOMeta(await A.sync(cid))).admins, ['xena', 'yuri'], 'the failed drop left Xena named');
    assert.ok(await X.adminSecret(await X.sync(cid)), 'and her admin key as it was');
    await A.run(cid);
    assert.equal(A.spy.admins.length, 2, 'tried again');
    assert.deepEqual((await A.readOMeta(await A.sync(cid))).admins, ['yuri']);
    assert.equal(await X.adminSecret(await X.sync(cid)), null, 'Xena\'s admin key is gone');
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'yuri'], 'and her leave applied');
  });
});

test('6c. readRoll finds a leave card behind 1,200 join cards of older epochs and pages by time; a long link id, a dev card without a new account key and an unlisted author\'s dev card do nothing', async () => {
  let tick = 0;
  await world({ now: () => Date.now() + tick++ }, async (w) => {   // the server's clock moves on at every reading: every card its own time
    const { cid } = w, A = await w.page('alice', { owner: true });
    const [B, Dr, Ev] = [await w.page('bob'), await w.page('dora'), await w.page('eve')];
    await makeChannel(A, cid, ['alice', 'bob', 'dora']);
    for (let i = 0; i < 2; i++) { await A.sync(cid); await A.rotateTo(A.S.chatDocs.get(cid), A.metaOf(await A.shown(cid))); }
    for (let i = 0; i < 1200; i++) w.T.srv.store._putCard(cid, 'u' + String(i).padStart(5, '0'), { e: 0, iv: randomBytes(12).toString('base64'), ct: randomBytes(528).toString('base64') }, 2, null);
    await leave(B, cid);
    const roll = async (all) => { const c = await A.sync(cid); return A.readRoll(c, A.metaOf(await A.showMeta(c)), all); };
    assert.deepEqual((await roll()).leave.map((x) => x.f), ['bob'], 'the epoch filter leaves the old cards out');
    assert.deepEqual((await roll(true)).leave.map((x) => x.f), ['bob'], 'every epoch: found on the second page');

    await Ev.joinPrivate(cid, await linkOf(A, cid));
    assert.deepEqual((await roll()).join.map((x) => x.f), ['eve']);
    const bad = await Ev.sealCard(await Ev.sync(cid), 'join', 'a'.repeat(21));
    await Ev.S.db.card(cid, bad.e, bad.iv, bad.ct);
    assert.deepEqual((await roll()).join, [], 'a link id of 21 characters is refused');
    A.kv.eve = 2; await Ev.writeCard(await Ev.sync(cid), 'dev');
    const r = await roll();
    assert.deepEqual([r.dev, r.join], [[], []], 'an unlisted author\'s dev card counts for nothing');

    await Dr.writeCard(await Dr.sync(cid), 'dev');
    assert.deepEqual((await roll()).dev, [], 'a dev card whose author\'s key didn\'t change is ignored');
    A.kv.dora = 2;
    assert.deepEqual((await roll()).dev.map((x) => x.f), ['dora']);
    await A.run(cid);
    assert.equal((await A.sync(cid)).epoch, 3);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'dora'], 'Bob left; Eve, unlisted, was added by nothing');
    assert.equal(await Ev.holds(cid, 3), false);
    assert.deepEqual(A.rolesOf(cid).dk, { dora: 2 });
    await Dr.writeCard(await Dr.sync(cid), 'dev');
    assert.deepEqual((await roll()).dev, [], 'the same key version is not acted on twice');
    A.kv.dora = 3;
    assert.deepEqual((await roll()).dev.map((x) => x.f), ['dora'], 'a newer one is');
  });
});

test('6d. cardSigOk checks the directory\'s current key, not a pin: the author\'s new key passes on a page that pinned the old one, the old key fails', async () => {
  const A = await pageFor(null, 'alice'), Bold = await pageFor(null, 'bob'), Bnew = await pageFor(null, 'bob'), cid = 'cCardPins001', raw = randomBytes(32);
  for (const X of [A, Bold, Bnew]) X.ksPut(cid, 5, X.b64(raw));
  const keys = (X) => ({ handle: 'bob', ecdh: X.id.ecdh, sig: X.id.sig });
  A.S.pins = { bob: keys(Bold) }; A.S.dir.bob = { ...keys(Bnew), kv: 2 };
  const c = { id: cid, type: 'channel', visibility: 'private', epoch: 5 };
  const card = async (X) => { const d = await X.sealCard(c, 'leave', ''); return A.openCard(c, { e: 5, iv: d.iv, ct: d.ct }); };
  assert.equal(await A.cardSigOk(c, await card(Bnew)), true, 'signed with the key the directory has now');
  assert.equal(await A.cardSigOk(c, await card(Bold)), false, 'signed with the pinned, replaced key');
});

test('139. a card whose author\'s directory entry could not be read (a dropped connection) fails the read instead of passing for a deleted account\'s (owner decision D3): the pass leaves the channel unstamped and the notice as it was, and the next start notes them; an author whose account is gone has their card dropped, and the run goes through', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), D = await w.page('dave'), E = await w.page('eve');
    await makeChannel(A, cid, ['alice']);
    for (const X of [D, E]) { await X.joinPrivate(cid, await linkOf(A, cid)); await victim(X, cid); }   // two release-91 joiners, waiting
    A.S.convs = [{ ...(await A.shown(cid)), id: cid }];
    const doc = A.S.db.doc, stamps = () => A.ls.get('hush:pass:alice', {});
    A.S.db.doc = (p) => (p === 'directory/dave' ? { get: () => Promise.reject(offline()) } : doc(p)); delete A.S.dir.dave;   // Dave's entry can't be read
    await A.goLive(A.S.me);
    assert.deepEqual([stamps(), hsOf(A)], [{}, []], 'the run failed: nothing stamped, no one noted');
    A.S.db.doc = doc;
    await A.goLive(A.S.me);
    assert.deepEqual([Object.keys(stamps()), hsOf(A)], [[cid], [[cid, ['dave', 'eve']]]], 'the next start: both noted and the channel stamped');
    let n = 0; A.S.db.doc = (p) => (p === 'directory/dave' ? { get: () => (n++ ? doc(p).get() : Promise.reject(offline())) } : doc(p)); delete A.S.dir.dave; A.ls.set('hush:pass:alice', null);   // a read that fails once (a dropped frame), then goes through
    await A.goLive(A.S.me);
    assert.deepEqual([n, Object.keys(stamps()), hsOf(A), !!A.S.dir.dave], [2, [cid], [[cid, ['dave', 'eve']]], true], 'the entry is taken from the second read: both noted and the channel stamped');
    A.S.db.doc = (p) => (p === 'directory/eve' ? { get: async () => ({ exists: false }) } : doc(p)); delete A.S.dir.eve; A.ls.set('hush:pass:alice', null);   // Eve's account is gone
    await A.goLive(A.S.me);
    assert.deepEqual([Object.keys(stamps()), hsOf(A)], [[cid], [[cid, ['dave']]]], 'a deleted author: the card dropped, the run through');
  });
});
