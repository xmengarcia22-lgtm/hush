// Release 92 (page), private channel history: member cards and self-healing (SPEC.md 5.6 "Member cards", "Join by link",
// "Leave"). The page harness (the page's own code, one copy per account, against a real server) is channel-history-kit.js.
// An admin's leave run and readRoll are channel-history-roll.test.js, the key chain (5.6 "Key chain", "Remove or ban")
// channel-history-chain.test.js, signed key changes channel-history-signed.test.js, links holding one key and links that
// survive leaves channel-history-links.test.js, a device removal's channels channel-history-removal.test.js (one file each,
// so each stays well inside the runner's 120 s per file, also under the whole suite's parallel load).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { lift, offline, pageFor, world, makeChannel, linkOf, oldServer } from './channel-history-kit.js';


test('1. a card is 528 bytes for every kind, opens only under its own chat and epoch, and its signature binds kind, epoch, link and time', async () => {
  const A = await pageFor(null, 'alice'), cid = 'cCardTest001', raw = randomBytes(32);
  A.ksPut(cid, 3, A.b64(raw)); A.ksPut('cCardTest002', 3, A.b64(raw)); A.ksPut(cid, 4, A.b64(raw));
  A.S.dir.alice = { handle: 'alice', ecdh: A.id.ecdh, sig: A.id.sig, kv: 1 };
  const c = { id: cid, type: 'channel', visibility: 'private', epoch: 3 };
  for (const k of ['join', 'leave', 'dev', 'adm']) {
    const d = await A.sealCard(c, k, k === 'join' ? 'iNvItE000001' : '');
    assert.equal(d.e, 3);
    assert.equal(Buffer.from(d.ct, 'base64').length, 528, k + ' card size');
    assert.equal(Buffer.from(d.iv, 'base64').length, 12);
    const x = await A.openCard(c, { e: 3, iv: d.iv, ct: d.ct });
    assert.deepEqual([x.f, x.k, x.e, x.i], ['alice', k, 3, k === 'join' ? 'iNvItE000001' : '']);
    assert.equal(await A.cardSigOk(c, x), true, k + ' signature');
    assert.equal(await A.openCard({ ...c, id: 'cCardTest002' }, { e: 3, iv: d.iv, ct: d.ct }), null, 'another channel, the same key: refused');
    assert.equal(await A.openCard({ ...c, epoch: 4 }, { e: 4, iv: d.iv, ct: d.ct }), null, 'another epoch, the same key: refused');
    for (const bad of [{ k: k === 'leave' ? 'join' : 'leave' }, { e: 4 }, { i: 'iNvItE000002' }, { ts: x.ts + 1 }]) assert.equal(await A.cardSigOk(c, { ...x, ...bad }), false, JSON.stringify(bad));
  }
  const long = await A.sealCard(c, 'join', 'a'.repeat(21));
  assert.equal(await A.openCard(c, { e: long.e, iv: long.iv, ct: long.ct }), null, 'a link id of 21 characters is refused');
});

test('2-3. a link joiner writes a join card, never a post; the admin\'s page writes them into meta with no new key and no unblock, and their reactions count', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), C = await w.page('carol'), D = await w.page('dave');
    const c0 = await makeChannel(A, cid, ['alice']);
    const j = await linkOf(A, cid);
    for (const X of [B, C]) await X.joinPrivate(cid, j);
    for (const X of [B, C]) { assert.deepEqual(X.spy.card, [cid], X.handle + ' wrote one card'); assert.equal(X.ls.get('hush:cardsOut:' + X.handle, {})[cid].k, 'join'); assert.equal(X.spy.posts, 0, X.handle + ' tried no post'); }
    const posts = (await A.S.db.collection('channels/' + cid + '/posts').limit(100).get()).docs;
    assert.equal(posts.length, 0, 'no join note was posted (a channel refuses them)');
    // Carol is on the sealed blocked list (the server, not told, let her join): her card is never acted on.
    const v = A.metaOf(await A.shown(cid));
    await A.S.db.doc('channels/' + cid).update({ meta: await A.sealMeta(cid, 0, A.unb64(A.ksGet(cid, 0)), { ...v, banned: ['carol'] }) });
    const keysBefore = JSON.stringify((await A.sync(cid)).keys);
    A.spy.updates.length = 0;
    await A.run(cid);
    let m = await A.meta(cid);
    assert.deepEqual(m.members, ['alice', 'bob'], 'Bob is listed; Carol, blocked, is not');
    assert.deepEqual(m.banned, ['carol']);
    assert.deepEqual(A.spy.updates, [['meta']], 'one meta update');
    assert.equal(JSON.stringify((await A.sync(cid)).keys), keysBefore, 'no wraps added: the joiner wrapped the key');
    assert.deepEqual(A.spy.ban.filter((b) => b[1] === false), [], 'never an unblock');
    assert.deepEqual(A.spy.rotate, [], 'no key change');
    assert.equal((await A.sync(cid)).epoch, c0.epoch);

    // 3: Bob's own page reads no list (the server's rule, channel-members.test.js): it names reactions by the owner, the admins and
    // itself (channel-history-nolist.test.js M5), so his tag maps to him (what onActs counts reactions by), and on the admin's page too.
    const f = await B.sync(cid);
    assert.deepEqual([f.meta, await B.readMeta(f)], [undefined, null], 'no list to read');
    assert.ok(Object.values(await B.tagMap({ ...f, members: ['bob'] }, B.epochOf(f))).includes('bob'), 'his tag maps to him');
    assert.ok(Object.values(await A.tagMap({ ...f, members: m.members }, 0)).includes('bob'), 'on the admin\'s page too');

    // A card from before the last key change is not added: Dave joined, then a key change came before any admin page ran.
    await D.joinPrivate(cid, await linkOf(A, cid));
    await A.sync(cid); await A.rotateTo(A.S.chatDocs.get(cid), A.metaOf(await A.shown(cid)));
    A.spy.updates.length = 0;
    await A.run(cid);
    m = await A.meta(cid);
    assert.deepEqual(m.members, ['alice', 'bob'], 'Dave\'s epoch-0 card adds no one at epoch 1');
    assert.deepEqual(A.spy.updates, [], 'nothing written');
    assert.equal(await D.holds(cid, 1), false);
  });
});

const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };

test('4. two leave cards make one leave key change; inside the 15 minutes a ratelimit keeps both cards, and the next run inside the wait wraps nothing', async () => {
  await world({ limits: { leaveRotateGapMs: 15 * 60e3 } }, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true });
    const [B, C, E, F] = [await w.page('bob'), await w.page('carol'), await w.page('erin'), await w.page('frank')];
    await makeChannel(A, cid, ['alice', 'bob', 'carol', 'erin', 'frank']);
    await leave(B, cid); await leave(C, cid);
    assert.deepEqual(await A.cards(cid), ['bob:leave', 'carol:leave']);
    await A.run(cid);
    assert.equal(A.spy.rotate.length, 1, 'one key change for both');
    assert.equal(A.spy.rotate[0].why, 'leave');
    assert.ok(!('invites' in A.spy.rotate[0]), 'no links carried');
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'erin', 'frank']);
    for (const X of [B, C]) assert.equal(await X.holds(cid, 1), false, X.handle + ' gets no key at epoch 1');
    for (const X of [E, F]) assert.equal(await X.holds(cid, 1), true, X.handle + ' does');
    assert.deepEqual(await A.cards(cid), [], 'the applied cards are deleted');

    await leave(E, cid); await leave(F, cid);
    const wraps = A.spy.wrapAll.length;
    await A.run(cid);
    assert.equal(A.spy.rotate.length, 2, 'tried once');
    assert.equal(A.spy.wrapAll.length, wraps + 1, 'wrapped once, before the server said ratelimit');
    assert.ok(A.leaveWait.get(cid) > Date.now() + 14 * 60e3, 'then waits 15 minutes');
    assert.deepEqual(await A.cards(cid), ['erin:leave', 'frank:leave'], 'both cards stay');
    await A.run(cid);
    assert.equal(A.spy.rotate.length, 2, 'no try inside the wait');
    assert.equal(A.spy.wrapAll.length, wraps + 1, 'and nothing wrapped');
    assert.equal((await A.sync(cid)).epoch, 1);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'erin', 'frank']);
  });
});

test('4. a dev card rotates too, marked leave, with no joiners added and no links; an unlisted leaver and a record past 1 MB rotate nothing', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true });
    const [B, G, H, I] = [await w.page('bob'), await w.page('grace'), await w.page('hank'), await w.page('ivan')];
    await makeChannel(A, cid, ['alice', 'bob', 'grace']);
    A.kv.grace = 2;                                            // Grace removed a device: her account key changed
    await G.writeCard(await G.sync(cid), 'dev');
    await H.joinPrivate(cid, await linkOf(A, cid));             // a joiner still waiting at the current epoch
    await A.run(cid);
    assert.equal(A.spy.rotate.length, 1);
    assert.equal(A.spy.rotate[0].why, 'leave', 'a lost device\'s key change counts with the leaves');
    assert.ok(!('invites' in A.spy.rotate[0]));
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'grace'], 'no joiner with a dev card');
    assert.equal(await G.holds(cid, 1), true, 'Grace keeps the channel');
    assert.equal(await H.holds(cid, 1), false);
    assert.deepEqual(A.rolesOf(cid).dk, { grace: 2 }, 'the key version acted on is kept');
    assert.deepEqual(await A.cards(cid), ['hank:join'], 'the dev card is deleted; join cards stay');

    // Ivan joined and left before any admin page ran: his leave card replaced his join card, and he was never listed.
    await I.joinPrivate(cid, await linkOf(A, cid));
    await leave(I, cid);
    A.spy.updates.length = 0;
    await A.run(cid);
    assert.equal(A.spy.rotate.length, 1, 'an unlisted leaver changes no key');
    assert.deepEqual(A.spy.updates, [], 'and is not written in');

    // Past 1 MB of wrap tables a leave waits (no pruning before release 93); back under it, it goes.
    await leave(B, cid);
    const rec = await A.sync(cid);
    A.S.chatDocs.set(cid, { ...rec, keys: { ...rec.keys, 999: { pad: 'x'.repeat(1e6) } } });
    await A.rollRun(await A.showMeta(rec));
    assert.equal(A.spy.rotate.length, 1, 'no leave batch above 1 MB');
    await A.run(cid);
    assert.equal(A.spy.rotate.length, 2);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'grace']);
  });
});

test('5. self-healing: an unlisted member holding the key writes one join card per epoch, again a week on, and one naming no link waits for an admin\'s Add; a listed or blocked member writes none; a pending dev card stands', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true });
    let B = await w.page('bob'); const D = await w.page('dora');
    // Today's server: under the rule a subscriber's page reads no list and heals only a join card noted at the current epoch
    // (channel-history-nolist.test.js M6).
    oldServer(w.T);
    await makeChannel(A, cid, ['alice']);
    await B.joinPrivate(cid, await linkOf(A, cid));
    // The live bug: a joiner from release 91 has no card on the server and none noted on its device.
    for (const d of (await A.S.db.collection('channels/' + cid + '/roll').limit(10).get()).docs) await A.S.db.doc('channels/' + cid + '/roll/' + d.id).delete();
    B.ls.set('hush:cardsOut:bob', null);
    B = await w.reload(B);
    let sh = await B.shown(cid);
    assert.equal(sh._unlisted, true, 'holding the key, left out of the list');
    await B.healCard(sh); await B.healCard(sh);
    assert.equal(B.spy.card.length, 1, 'one card per epoch and load');
    assert.deepEqual(await A.cards(cid), ['bob:join']);
    B = await w.reload(B); await B.healCard(await B.shown(cid));
    assert.equal(B.spy.card.length, 0, 'a join card sent this week stands');
    B.clock.skew = 8 * 864e5;
    B = await w.reload(B); await B.healCard(await B.shown(cid));
    assert.equal(B.spy.card.length, 1, 'written again once it is a week old (the server keeps cards 30 days)');

    // A key change wrapped for Bob, then a list without him (a lists-only write): a new epoch, one new card.
    const v = A.metaOf(await A.shown(cid));
    await A.rotateTo(A.S.chatDocs.get(cid), { ...v, members: ['alice', 'bob'] });
    await A.S.db.doc('channels/' + cid).update({ meta: await A.sealMeta(cid, 1, A.unb64(A.ksGet(cid, 1)), { ...v, members: ['alice'] }) });
    sh = await B.shown(cid);
    assert.deepEqual([sh._unlisted, B.epochOf(sh)], [true, 1]);
    await B.healCard(sh); await B.healCard(sh);
    assert.equal(B.spy.card.length, 2, 'one more, at the new epoch');

    // His card names no link (a release-91 joiner noted none), so no admin's page lists him by itself (release 92, fix E): he
    // waits to join, and the admin adds him from Add subscribers.
    await A.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice'], 'a card no link vouches for lists no one');
    A.S.pick = []; A.S.convs = [await A.sync(cid)]; A.spy.els.length = 0; await A.openAddSubs(cid);
    const box = A.spy.els.find((e) => e.tag === 'input' && e.value === 'bob');
    assert.ok(box && A.spy.els.some((e) => e.textContent === 'Waiting to join'), 'Bob waits to join');
    box.checked = true; box.onchange(); await A.spy.els.find((e) => e.tag === 'button').onclick();
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob']);
    assert.ok(!(await B.shown(cid))._unlisted, 'listed now');
    assert.ok(lift('function start(cid){pend++', 'function adopt(').includes('if(mine&&(shown._unlisted||!shown._unlocked))healCard(shown);'), 'the chat watch heals an unlisted copy, or one with no list to read (then only a join noted at the current epoch: channel-history-nolist.test.js), never a listed one');

    // Blocked in the sealed list while still holding the key: none.
    await A.S.db.doc('channels/' + cid).update({ meta: await A.sealMeta(cid, 1, A.unb64(A.ksGet(cid, 1)), { ...A.metaOf(await A.shown(cid)), members: ['alice'], banned: ['bob'] }) });
    B.ls.set('hush:cardsOut:bob', null);
    B = await w.reload(B); sh = await B.shown(cid);
    assert.deepEqual([sh._unlisted, sh.banned], [true, ['bob']]);
    await B.healCard(sh);
    assert.equal(B.spy.card.length, 0, 'a blocked member writes none');

    // A joiner not listed yet whose device was then removed: the heal never writes over the dev card.
    await D.joinPrivate(cid, await linkOf(A, cid));
    await D.writeCard(await D.sync(cid), 'dev');
    const D2 = await w.reload(D); sh = await D2.shown(cid);
    assert.equal(sh._unlisted, true);
    await D2.healCard(sh);
    assert.equal(D2.spy.card.length, 0);
    assert.ok((await A.cards(cid)).includes('dora:dev'), 'the dev card stands');
  });
});

test('6. resendCards: a leave card whose write failed goes out at the next start, until the key changes; entries drop when the chat is gone or refused; a join entry stays, unsent, once the epoch moved', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true });
    let B = await w.page('bob'); const C = await w.page('carol'); let D = await w.page('dave');
    await makeChannel(A, cid, ['alice', 'bob', 'carol']);
    B.spy.failCard = 1;
    await leave(B, cid);
    assert.deepEqual(B.ls.get('hush:cardsOut:bob', {})[cid], { k: 'leave', e: 0, i: '' }, 'noted first, never sent');
    assert.deepEqual(await A.cards(cid), []);
    B = await w.reload(B); await B.resendCards();
    assert.deepEqual(B.spy.card, [cid], 'written at the next start');
    assert.deepEqual(await A.cards(cid), ['bob:leave']);
    assert.equal(typeof B.ls.get('hush:cardsOut:bob', {})[cid].sent, 'number');
    B = await w.reload(B); await B.resendCards();
    assert.equal(B.spy.card.length, 1, 'and again at each start while the epoch stands');
    await A.run(cid);
    assert.equal((await A.sync(cid)).epoch, 1);
    B = await w.reload(B); await B.resendCards();
    assert.deepEqual(B.spy.card, [], 'not once the key changed');
    assert.equal(B.ls.get('hush:cardsOut:bob', {})[cid], undefined, 'the entry is dropped');

    C.ls.set('hush:cardsOut:carol', { cNoSuchChan01: { k: 'leave', e: 0, i: '' } });
    await C.resendCards();
    assert.deepEqual([C.ls.get('hush:cardsOut:carol', {}), C.spy.card], [{}, []], 'a chat that is gone drops its entry');
    C.ls.set('hush:cardsOut:carol', { [cid]: { k: 'leave', e: 1, i: '' } });
    C.spy.denyGet = true; await C.resendCards(); C.spy.denyGet = false;
    assert.deepEqual([C.ls.get('hush:cardsOut:carol', {}), C.spy.card], [{}, []], 'a refused one too');

    await D.joinPrivate(cid, await linkOf(A, cid));
    D = await w.reload(D); await D.resendCards();
    assert.deepEqual(D.spy.card, [], 'a join card is written again only by healCard');
    const dj = D.ls.get('hush:cardsOut:dave', {})[cid];
    assert.equal(dj.k, 'join', 'its entry stays while the epoch stands');
    await A.sync(cid); await A.rotateTo(A.S.chatDocs.get(cid), A.metaOf(await A.shown(cid)));
    D = await w.reload(D); await D.resendCards();
    // release 92 (fix E): kept with its link and `m`, so healCard writes them again if a later list leaves Dave out (cards test 50)
    assert.deepEqual([D.ls.get('hush:cardsOut:dave', {})[cid], D.spy.card], [dj, []], 'and stays as it was once the epoch moved, with nothing written');
  });
});
