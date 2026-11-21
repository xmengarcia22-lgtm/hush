// Release 93b (page), private channel member cards: a card counts only in its author's slot (SPEC.md 5.6 "Member cards",
// release 93). Since release 93a the server tells an owner's or admin's page that holds the current member key the tag each
// author's card sits under (chat.slots); from 93b the page ignores a card outside its author's slot, so an admin's leave card
// written again from another account's slot drops no one. The read fails closed: with no answer (ratelimit) no card acts and
// the run waits for the next open, never "every card"; a stale key (conflict: a key change landed since this copy) is asked
// once more with the fresh key. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { world, makeChannel } from './channel-history-kit.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };   // the channel opened on X's page, its roles record taken
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; await X.leaveChat(cid); };
const admins = async (A, cid) => (await A.readOMeta(await A.sync(cid))).admins;
const rows = async (X, cid) => (await X.S.db.collection('channels/' + cid + '/roll').limit(1000).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
// Add subscribers on X's page with `hs` picked, Add pressed: the error line after it ('' when they were added).
const addSubs = async (X, cid, hs) => { X.S.pick = hs; X.S.convs = [await X.sync(cid)]; X.spy.els.length = 0; await X.openAddSubs(cid);
  const go = X.spy.els.find((e) => e.tag === 'button'), err = X.spy.els.find((e) => e.cls === 'err'); await go.onclick(); return err.textContent; };
// h's card of kind k as the server holds it, found by admin M's page: { e, iv, ct }, what another account would write again from its own slot.
const cardOf = async (M, cid, h, k) => { const c = await M.sync(cid);
  for (const r of await rows(M, cid)) { const x = await M.openCard(c, r); if (x && x.f === h && x.k === k) return { e: r.e, iv: r.iv, ct: r.ct }; } return null; };
// chat.slots on X's page, as the page calls it, with each answer's code kept in `codes` ('ok' or the error); `before` runs once, before the first call reaches the server.
const watchSlots = (X, codes, before) => { const real = X.S.db.slots; let first = true;
  X.S.db.slots = async (...a) => { if (first && before) { first = false; await before(real, ...a); }
    try { const r = await real(...a); codes.push('ok'); return r; } catch (e) { codes.push(e && e.code); throw e; } }; };

test('141. (R1, item 1) an admin writes a captured admin leave card again from her own slot, after its author was added and made admin again: the owner\'s page ignores it (the card is not in its author\'s slot) and the re-appointed admin stays', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), M = await w.page('mallory'), X = await w.page('xena');
    await makeChannel(A, cid, ['alice', 'mallory', 'xena'], ['mallory', 'xena']);
    for (const P of [A, M, X]) await read(P, cid);
    await leave(X, cid);
    const cap = await cardOf(M, cid, 'xena', 'leave');
    assert.ok(cap, 'Mallory, an admin, read her leave card');
    await A.run(cid);
    assert.deepEqual(await admins(A, cid), ['mallory'], 'her own leave drops her');
    assert.equal(await addSubs(A, cid, ['xena']), '');
    await A.setAdmins(cid, ['mallory', 'xena']);
    await M.S.db.card(cid, cap.e, cap.iv, cap.ct);   // the replay, byte for byte, from Mallory's slot
    await A.run(cid);
    assert.deepEqual(await admins(A, cid), ['mallory', 'xena'], 'REPLAY TOOK: the copy in Mallory\'s slot dropped Xena');
  });
});

test('142. the connection\'s query budget runs out between the roll read and chat.slots, which answers ratelimit: the owner\'s run acts on no card (the leaver stays listed with his key, nothing is wrapped, no key change), never on every card; once the budget is back the next run acts on his leave', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), G = await w.page('gus');
    await makeChannel(A, cid, ['alice', 'gus']);
    for (const P of [A, G]) await read(P, cid);
    await leave(G, cid);
    const codes = [], many = Array.from({ length: 10_000 }, (_, i) => 'u' + String(i).padStart(5, '0'));
    // Right before the page's own call: the connection's whole query budget (120) spent by chat.slots calls (34 tokens each for 10,000 names, then one each), so the page's call is the one the server refuses.
    watchSlots(A, codes, async (real, c, cap) => { for (const hs of [many, []]) for (;;) { const e = await real(c, cap, hs).then(() => null, (x) => x.code); if (e) { assert.equal(e, 'ratelimit'); break; } } });
    const wraps = A.spy.wrapAll.length;
    assert.equal(await A.run(cid), false, 'the run failed, for the next open');
    assert.deepEqual(codes, ['ratelimit'], 'the server\'s answer to the page\'s chat.slots');
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, A.spy.rotate.length, A.spy.wrapAll.length - wraps, await G.holds(cid, 0)], [0, ['alice', 'gus'], 0, 0, true], 'EVERY CARD ACTED: no card may act with no slot information: Gus stays listed with the key, and nothing is wrapped');
    let r = false; for (let n = 0; n < 8 && r === false; n++) { await pause(1500); r = await A.run(cid); }   // the budget refills 2 a second
    assert.notEqual(r, false, 'the run went through once the budget was back');
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, await G.holds(cid, 1)], [1, ['alice'], false], 'his leave acted on: the key changed without him');
  });
});

test('143. a key change lands between the roll read and chat.slots, so the key sent is stale (conflict): the page asks once more with the fresh key, and Add subscribers still lists the person waiting to join', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), Pp = await w.page('pete');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']);
    for (const P of [A, B]) await read(P, cid);
    Pp.ksPut(cid, 0, B.ksGet(cid, 0)); await Pp.writeCard(await Pp.sync(cid), 'join', '', '');   // someone holding the key from elsewhere: waiting to join
    const codes = [];
    watchSlots(A, codes, async () => { await B.rotateTo(await B.sync(cid), B.metaOf(await B.shown(cid))); await A.S.db.refreshChat(cid); });   // Bob's key change, and Alice's connection opened again, as the eviction does
    A.S.pick = []; A.S.convs = [await A.sync(cid)]; A.spy.els.length = 0; await A.openAddSubs(cid);
    assert.deepEqual(codes, ['conflict', 'ok'], 'the stale key refused, then the fresh one answered');
    assert.deepEqual(A.spy.els.filter((e) => e.tag === 'input').map((e) => e.value), ['pete'], 'Pete listed under Waiting to join');
    assert.ok(A.spy.els.some((e) => e.textContent === 'Waiting to join'));
  });
});
