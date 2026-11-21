// Release 92 (page), private channel history, the start's pass, third file (SPEC.md 5.6 "The start's pass"; the first two are
// channel-history-golive.test.js and channel-history-golive2.test.js): the pass's pauses (a second after a channel that went through,
// two, five, fifteen then thirty after one that failed: owner decision D4), a channel this device lacks the key for or whose cards
// the server refuses (a failure without the wait), and the rate-limit answers on the pass's leave key change (the connection's own is
// a failure, the leave gap's answer is not). The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { offline, world, makeChannel, linkOf } from './channel-history-kit.js';

// Helpers shared with channel-history-golive2.test.js, copied as the removal tests do.
const otherCid = (cid, n) => cid.slice(0, -1) + 'xyzw'[n];
// The chat list as the page holds it: each channel's readable copy (watchInbox's shown), so the pass sees owner, admins, members, blocks and visibility as the list does.
const listOf = async (X, cids) => { X.S.convs = await Promise.all(cids.map(async (cid) => ({ ...(await X.shown(cid)), id: cid }))); };
const stamps = (X) => X.ls.get('hush:pass:' + X.handle, {});
const hsOf = (X) => X.waitList().map(([cid, x]) => [cid, [...x.hs].sort()]);   // the notice: who waits, by channel

test('128. a channel that failed makes the pass wait longer before the next (two seconds, then five), so a busy connection is not asked again at once; one that went through brings the one-second pause back (owner decision D4); only the ones that failed are left unstamped', async () => {
  await world({}, async (w) => {
    const c1 = w.cid, c2 = otherCid(c1, 0), c3 = otherCid(c1, 1), c4 = otherCid(c1, 2), c5 = otherCid(c1, 3), cs = [c1, c2, c3, c4, c5], A = await w.page('alice', { owner: true });
    for (const x of cs) await makeChannel(A, x, ['alice']);
    await listOf(A, cs);
    const real = A.S.db.collection, at = {}, down = new Set([c1, c2, c4]);   // when each channel's cards were read; c1's, c2's and c4's can't be (offline)
    A.S.db.collection = (p) => { const m = p.match(/^channels\/([^/]+)\/roll$/); if (m) { at[m[1]] = Date.now(); if (down.has(m[1])) throw offline(); } return real(p); };
    await A.goLive(A.S.me);
    assert.deepEqual([Object.keys(at), Object.keys(stamps(A)).sort()], [cs, [c3, c5].sort()], 'each read once, in order; the three that failed are not stamped');
    const gap = (a, b) => at[b] - at[a];
    assert.ok(gap(c1, c2) >= 1950 && gap(c1, c2) < 4500, `c2 read ${gap(c1, c2)} ms after c1 failed: two seconds, not the usual one`);
    assert.ok(gap(c2, c3) >= 4950 && gap(c2, c3) < 7500, `c3 read ${gap(c2, c3)} ms after c2 failed too: five`);
    assert.ok(gap(c3, c4) >= 950 && gap(c3, c4) < 1900, `c4 read ${gap(c3, c4)} ms after c3 went through: the one-second pause`);
    assert.ok(gap(c4, c5) >= 1950 && gap(c4, c5) < 4500, `c5 read ${gap(c4, c5)} ms after c4 failed: two seconds again, c3 having gone through`);
  });
});

test('129. the connection\'s own rate limit on the pass\'s leave key change ("slow down", with the leave gap\'s code) is a failure: one try, the channel unstamped and no 15-minute wait, so an open right after changes the key; the leave gap\'s own answer still stamps the channel and leaves the cards waiting, as at an open', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), D = await w.page('dave'), E = await w.page('eve');
    await makeChannel(A, cid, ['alice', 'eve']); await D.joinPrivate(cid, await linkOf(A, cid)); await A.run(cid);   // Dave listed through his link
    await D.sync(cid); await D.leaveChat(cid); await listOf(A, [cid]);
    assert.deepEqual([(await A.meta(cid)).members, await A.cards(cid)], [['alice', 'eve', 'dave'], ['dave:leave']], 'Dave, listed, left');
    A.spy.failRotate = [{ e: 'ratelimit', m: 'slow down' }]; await A.goLive(A.S.me);   // the one key change the pass tries: the frame budget's answer
    assert.deepEqual([A.spy.rotate.length, stamps(A), (await A.sync(cid)).epoch, await A.cards(cid)], [1, {}, 0, ['dave:leave']], 'refused by the connection: one try, not stamped, the key and the card as they were');
    A.spy.rotate.length = 0; await A.run(cid);   // opened right after
    assert.deepEqual([A.spy.rotate.length, (await A.sync(cid)).epoch, (await A.meta(cid)).members, await A.cards(cid), A.leaveWait.get(cid)], [1, 1, ['alice', 'eve'], [], undefined], 'the open changes the key at once: no wait was set');
    await listOf(E, [cid]); await E.leaveChat(cid); await listOf(A, [cid]); A.spy.rotate.length = 0;   // the leave gap's own answer (store.js), the same code
    A.spy.failRotate = [{ e: 'ratelimit', m: 'chat.rotate: a channel changes its key for people leaving at most once every 15 minutes and 8 times a day; try again later' }]; await A.goLive(A.S.me);
    assert.deepEqual([A.spy.rotate.length, !!stamps(A)[cid].at, (await A.sync(cid)).epoch, await A.cards(cid)], [1, true, 1, ['eve:leave']], 'the leave gap: one try, the channel stamped, the card waiting');
    A.spy.rotate.length = 0; await A.run(cid);
    assert.deepEqual([A.spy.rotate.length, (await A.sync(cid)).epoch, Math.round((A.leaveWait.get(cid) - Date.now()) / 6e4)], [0, 1, 15], 'an open within 15 minutes tries no key change');
  });
});

test('130. a channel this device has no current key for, or whose cards the server refuses to it, is a failure without the wait: nothing was busy, so the pass moves on after the usual pause (a second), and three such channels take about three seconds, no two-second wait among them', async () => {
  await world({}, async (w) => {
    const c1 = w.cid, c2 = otherCid(c1, 0), c3 = otherCid(c1, 1), A = await w.page('alice', { owner: true }), B = await w.page('bob'); await w.page('eve');
    for (const x of [c1, c2]) await makeChannel(A, x, ['alice', 'bob', 'eve'], ['bob']); await makeChannel(A, c3, ['alice', 'bob'], ['bob']);
    const old = await A.newIdentity(); A.S.pins = { bob: { ecdh: old.ecdh, sig: old.sig } };   // as in 120: Bob's new code is not accepted on Alice's page, so her key changes wrap nothing to him
    for (const x of [c1, c2]) { await A.sync(x); await A.kickMember(x, 'eve', { ban: false }); }
    await listOf(B, [c1, c2, c3]);
    const real = B.S.db.collection, denied = { where: () => denied, orderBy: () => denied, limit: () => denied, get: () => Promise.reject(Object.assign(new Error('denied'), { code: 'denied' })) };
    B.S.db.collection = (p) => (p === 'channels/' + c3 + '/roll' ? denied : real(p));   // c3's cards: refused (the connection holds member level only)
    assert.deepEqual([await B.holds(c1, 1), await B.holds(c2, 1), await B.holds(c3, 0), B.S.convs.map((c) => c.admins)], [false, false, true, [['bob'], ['bob'], ['bob']]], 'Bob admins all three; his device lacks two current keys');
    const t0 = Date.now(); await B.goLive(B.S.me); const took = Date.now() - t0;
    assert.deepEqual([stamps(B), hsOf(B)], [{}, []], 'none stamped, nothing noted');
    assert.ok(took >= 2900 && took < 4500, `the pass took ${took} ms: three one-second pauses, no two-second wait`);
  });
});

test('131. a chat.open the connection sends first (the channel\'s level dropped meanwhile), refused or timed out, reaches the page as the ratelimit code with the adapter\'s own text ("the chat could not be opened"): a failure like the connection\'s own rate limit, one try, the channel unstamped, no 15-minute wait, and an open right after changes the key; only the leave gap\'s own answer ("try again later"), and the wait it set, leave the cards waiting and stamp the channel', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), D = await w.page('dave'), E = await w.page('eve');
    await makeChannel(A, cid, ['alice', 'eve']); await D.joinPrivate(cid, await linkOf(A, cid)); await A.run(cid);   // Dave listed through his link
    await D.sync(cid); await D.leaveChat(cid); await listOf(A, [cid]);
    A.spy.failRotate = [{ e: 'ratelimit', m: 'the chat could not be opened' }]; await A.goLive(A.S.me);   // the one key change the pass tries: refused before the server saw it (needOpen)
    assert.deepEqual([A.spy.rotate.length, stamps(A), A.leaveWait.get(cid), (await A.sync(cid)).epoch, await A.cards(cid)], [1, {}, undefined, 0, ['dave:leave']], 'one try, not stamped, no wait set, the key and the card as they were');
    A.spy.rotate.length = 0; await A.run(cid);   // opened right after
    assert.deepEqual([A.spy.rotate.length, (await A.sync(cid)).epoch, (await A.meta(cid)).members, await A.cards(cid)], [1, 1, ['alice', 'eve'], []], 'the open changes the key at once');
    await listOf(E, [cid]); await E.leaveChat(cid); await listOf(A, [cid]); A.spy.rotate.length = 0;   // the leave gap's own answer (store.js) sets the wait and stamps, as 129 shows
    A.spy.failRotate = [{ e: 'ratelimit', m: 'chat.rotate: a channel changes its key for people leaving at most once every 15 minutes and 8 times a day; try again later' }]; await A.goLive(A.S.me);
    assert.deepEqual([A.spy.rotate.length, !!stamps(A)[cid].at, Math.round((A.leaveWait.get(cid) - Date.now()) / 6e4)], [1, true, 15], 'the leave gap: one try, stamped, the wait set');
    A.ls.set('hush:pass:alice', {}); A.spy.rotate.length = 0; await A.goLive(A.S.me);   // unstamped by hand: a start within the wait
    assert.deepEqual([A.spy.rotate.length, !!stamps(A)[cid].at, (await A.sync(cid)).epoch, await A.cards(cid)], [0, true, 1, ['eve:leave']], 'the wait itself (rotateTo\'s own answer): no try, the channel stamped, the card waiting');
  });
});
