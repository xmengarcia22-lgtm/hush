// Release 92 (page), private channel history: a join card counts only through its link (SPEC.md 5.6 "Member cards"), second
// half; the first half is channel-history-cards.test.js. Any unlisted, unblocked author whose card does not prove a link this
// admin's page opens is only "Waiting to join", in Add subscribers, for an admin to add, each row with its @username. A link
// from before release 92 (no `as`) gets one from the page that made it; a joiner's noted link and m outlast a key change; a
// leave folds in link joiners alone. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, linkOf, oldServer } from './channel-history-kit.js';

// `m` as SPEC.md 5.6 has it: HKDF-SHA-256 of the link's secret, salt "hush-join-mac-v1", info cid|iid|author, 32 bytes.
const mac = (secret, cid, iid, f) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'base64url'), 'hush-join-mac-v1', [cid, iid, f].join('|'), 32)));
const noted = (X, cid) => X.ls.get('hush:cardsOut:' + X.handle, {})[cid];
// X's card on the server, as an admin's page opens it (with its `m`), and its ciphertext's size.
const cardOf = async (A, cid, h) => { const c = await A.sync(cid);
  for (const d of (await A.S.db.collection('channels/' + cid + '/roll').limit(1000).get()).docs) { const x = await A.openCard(c, d.data()); if (x && x.f === h) return { ...x, id: d.id, n: Buffer.from(d.data().ct, 'base64').length }; }
  return null; };
const roll = async (A, cid, all) => { const c = await A.sync(cid); return A.readRoll(c, A.metaOf(await A.showMeta(c)), all); };
// Someone holding the channel's current key from elsewhere (a stolen phone's, say) writes a join card under an account of theirs.
const puppet = async (X, from, cid, i, m) => { X.ksPut(cid, 0, from.ksGet(cid, 0)); await X.writeCard(await X.sync(cid), 'join', i, m); };

// Shared with channel-history-removal.test.js and channel-history-revoke.test.js, copied as the removal tests do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };

const sheetOf = (X, cid, iid) => { X.spy.els.length = 0; X.openRevoke(cid, iid); return X.spy.els; };
const press = async (els, text) => { const b = els.find((e) => e.tag === 'button' && e.textContent === text); assert.ok(b, 'a button "' + text + '"'); await b.onclick(); return b; };
// Add subscribers on X's page (openAddSubs), its elements as the page made them once the waiting list is read; no one picked.
const addSheet = async (X, cid) => { X.S.pick = []; X.S.convs = [await X.sync(cid)]; X.spy.els.length = 0; await X.openAddSubs(cid); return X.spy.els; };

test('48. Add subscribers shows who is waiting to join, unticked: a release-91 joiner\'s card (no m) and a puppet\'s; ticking one and Add lists them with no key change, the other stays out; Revoke and remove people who joined with it then lists only the one still waiting, and the one added keeps the channel', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), Pp = await w.page('pete');
    let B = await w.page('bob');
    // Until the heal, today's server, where a subscriber's page reads the list that leaves it out; under the rule it reads none and
    // writes again only a join card noted at the current epoch, as this heal notes it (channel-history-nolist.test.js M6).
    const was = oldServer(w.T);
    await makeChannel(A, cid, ['alice']);
    await B.joinPrivate(cid, await linkOf(A, cid));
    // The live bug: a joiner from release 91 has no card on the server and none noted on its device.
    for (const d of (await A.S.db.collection('channels/' + cid + '/roll').limit(10).get()).docs) await A.S.db.doc('channels/' + cid + '/roll/' + d.id).delete();
    B.ls.set('hush:cardsOut:bob', null);
    B = await w.reload(B);
    await B.healCard(await B.shown(cid));
    assert.deepEqual([(await cardOf(A, cid, 'bob')).i, (await cardOf(A, cid, 'bob')).m], ['', ''], 'a card naming no link');
    was.off();   // the server's rule from here on
    await puppet(Pp, B, cid, '', '');
    await A.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice'], 'a card naming no link lists no one');

    let els = await addSheet(A, cid);
    const boxes = els.filter((e) => e.tag === 'input'), go = els.find((e) => e.tag === 'button'), err = els.find((e) => e.cls === 'err');
    assert.deepEqual(boxes.map((b) => [b.type, b.value, !!b.checked]), [['checkbox', 'bob', false], ['checkbox', 'pete', false]]);
    assert.deepEqual(els.filter((e) => e.cls === 't-sub').map((e) => e.textContent), ['@bob', '@pete'], 'each row shows the @username: a display name can be copied');
    assert.ok(els.some((e) => e.textContent === 'Waiting to join'));
    assert.deepEqual([go.disabled, go.textContent], [true, 'Add subscribers']);
    const b = boxes.find((x) => x.value === 'bob'); b.checked = true; b.onchange();
    assert.deepEqual([go.disabled, go.textContent], [false, 'Add 1 subscriber']);
    await go.onclick();
    assert.equal(err.textContent, '');
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob']);
    assert.equal((await B.sync(cid)).meta, undefined, 'his page reads no list (the server\'s rule): the owner\'s lists him');
    assert.deepEqual([A.spy.rotate, (await A.sync(cid)).epoch], [[], 0], 'no key change');
    els = await addSheet(A, cid);
    assert.deepEqual(els.filter((e) => e.tag === 'input').map((x) => x.value), ['pete'], 'Bob waits no more');


    // Bob, listed now with a card no link vouches for, is under neither heading of Revoke and change the key, and keeps the channel.
    const j = await linkOf(A, cid);
    await A.sync(cid);
    els = sheetOf(A, cid, j.iid);
    await press(els, 'Revoke and remove people who joined with it');
    assert.deepEqual(els.filter((e) => e.tag === 'input').map((x) => x.value), ['pete']);
    await press(els, 'Remove and revoke');
    assert.deepEqual([await B.holds(cid, 1), await Pp.holds(cid, 1), (await A.meta(cid)).members], [true, false, ['alice', 'bob']]);
  });
});

test('49. a link made before release 92 has no `as`: an admin\'s page without its secret leaves its joiner waiting; the page that made it, keeping the secret, seals one when it opens the channel and lists them in that run; another admin\'s page then vouches for them, and its leave carries the link and keeps them', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), F = await w.page('fay'), D = await w.page('dave'), G = await w.page('gina');
    await makeChannel(A, cid, ['alice', 'bob', 'fay'], ['bob']);
    const l0 = await linkOf(A, cid);
    await A.S.db.doc('channels/' + cid).update({ invites: { [l0.iid]: { as: null } } });   // as the live page makes links: the secret kept on its device alone
    assert.deepEqual(A.ls.get('hush:inv:' + cid), { iid: l0.iid, secret: l0.secret, h: 'alice' });
    await D.joinPrivate(cid, l0);
    await B.run(cid);
    assert.deepEqual([(await A.meta(cid)).members, (await roll(B, cid)).wait.map((x) => x.f), (await A.sync(cid)).invites[l0.iid].as], [['alice', 'bob', 'fay'], ['dave'], undefined], 'Bob\'s page holds no secret for it: Dave waits');
    await A.run(cid);
    const c = await A.sync(cid);
    assert.equal(typeof c.invites[l0.iid].as, 'string', 'the record holds an `as` for it now');
    assert.equal(b64u(await A.openAs(A.unb64(A.ksGet(cid, 'a')), cid, l0.iid, c.invites[l0.iid].as)), l0.secret, 'its `as` opens to the link\'s secret');
    assert.deepEqual([(await A.meta(cid)).members, A.spy.rotate], [['alice', 'bob', 'fay', 'dave'], []], 'Dave listed in the same run, with no key change');
    assert.deepEqual((await roll(B, cid, true)).join.map((x) => x.f), ['dave'], 'Bob\'s page vouches for him now');
    await leave(F, cid); await B.run(cid);
    const c1 = await B.sync(cid);
    assert.deepEqual([c1.epoch, Object.keys(c1.invites), (await A.meta(cid)).members, await D.holds(cid, 1)], [1, [l0.iid], ['alice', 'bob', 'dave'], true], 'the leave carried the link and kept Dave');
    await G.joinPrivate(cid, l0); await B.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'dave', 'gina'], 'and its next joiner is listed by Bob\'s page');
  });
});

test('50. a link joiner\'s noted link and m outlast a key change: listed, kept across a leave, then left out of a later list, their page writes the same link and m again and an admin\'s page lists them', async () => {
  await world({}, async (w) => {
    // Today's server: under the rule her page reads no list, and after a key change that included her heals no more
    // (channel-history-nolist.test.js M6).
    oldServer(w.T);
    const { cid } = w, A = await w.page('alice', { owner: true }), F = await w.page('fay');
    let G = await w.page('gina');
    await makeChannel(A, cid, ['alice', 'fay']);
    const j = await linkOf(A, cid), gm = mac(j.secret, cid, j.iid, 'gina');
    await G.joinPrivate(cid, j); await A.run(cid);
    await leave(F, cid); await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, await G.holds(cid, 1)], [1, ['alice', 'gina'], true]);
    G = await w.reload(G); await G.resendCards();
    assert.deepEqual([noted(G, cid).k, noted(G, cid).e, noted(G, cid).i, noted(G, cid).m, G.spy.card], ['join', 0, j.iid, gm, []], 'the entry stays with its link and m once the key changed, and nothing is written');
    const v = A.metaOf(await A.shown(cid));
    await A.S.db.doc('channels/' + cid).update({ meta: await A.sealMeta(cid, 1, A.unb64(A.ksGet(cid, 1)), { ...v, members: ['alice'] }) });   // a list without her, from an older copy say
    const sh = await G.shown(cid);
    assert.equal(sh._unlisted, true);
    await G.healCard(sh);
    const h = await cardOf(A, cid, 'gina');
    assert.deepEqual([h.k, h.e, h.i, h.m], ['join', 1, j.iid, gm], 'the same link and m, at the new key');
    await A.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'gina'], 'listed again, with no admin\'s Add');
  });
});

test('51. a leave\'s key change folds in a link joiner not listed yet, never a puppet waiting at the same time: the puppet holds no new key and is not in the list', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), F = await w.page('fay'), D = await w.page('dave'), Pp = await w.page('pete');
    await makeChannel(A, cid, ['alice', 'bob', 'fay']);
    assert.equal(await B.holds(cid, 0), true);
    await D.joinPrivate(cid, await linkOf(A, cid));
    await puppet(Pp, B, cid, '', '');
    await leave(F, cid);
    await A.run(cid);                                          // one run: the cards read once, Dave listed and the leave's key change
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members], [1, ['alice', 'bob', 'dave']]);
    assert.deepEqual([await D.holds(cid, 1), await Pp.holds(cid, 1)], [true, false], 'Dave keeps the channel, Pete gets no key');
    assert.deepEqual((await roll(A, cid, true)).wait.map((x) => x.f), ['pete'], 'Pete still waits');
  });
});
