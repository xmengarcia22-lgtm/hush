// Release 92 (page), private channel history: a join card counts only through its link (SPEC.md 5.6 "Member cards"). A link
// joiner's card carries `m`, worked out from the link's secret over the channel, the link id and the author, and noted on the
// joiner's device so healCard writes it again. An admin's page lists a card's author (with no new key) only when it opens
// that link's `as` (the link still open, or carried across a leave) and `m` checks. Any other unlisted, unblocked author (no
// `m`, a wrong or copied one, a link that is gone or unknown, no link) is only "Waiting to join", in Add subscribers and in
// Revoke and change the key, for an admin to add, each row with its @username. A link from before release 92 (no `as`) gets
// one from the page that made it; a joiner's noted link and m outlast a key change; a leave folds in link joiners alone.
// This file holds tests 45 to 47, 108 (the wait lasts through one key change: release 92's fix I) and 127 (ensureInbox's per-device memory and `fresh`); tests 48 to 51 (Add subscribers'
// waiting list, a link made before release 92, a joiner's noted link and m, a leave's key change) are in channel-history-cards2.test.js.
// The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, world, makeChannel, linkOf, lift, oldServer } from './channel-history-kit.js';

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
async function removal(X, chats) {
  const rec = { stage: 'rotate', name: 'Old phone', rotated: [], chats: chats.map((x) => ({ type: 'channel', vis: 'private', owner: false, admin: false, admins: [], members: [], name: 'History', unlocked: true, ...x })) }, fails = [];
  const ui = { step: (t) => { if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} };
  X.S.contactsReady = true; X.S.vaultOk = true;
  await X.rekeyRun(rec, ui);
  assert.deepEqual(fails, ['Removing the device stopped (stop). Close Hush and open it again to finish it.'], 'the rotate stage ran to its end');
  assert.equal(X.S.rekeying, true); X.S.rekeying = false;
  return rec;
}
async function newKeys(X) {
  await X.rekeyIdentity(X.S.me); X.S.keys.clear(); X.S.chanKeys.clear();
  await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() });
  const sk = await crypto.subtle.importKey('jwk', X.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await X.S.db.prove(null);
  await X.S.db.prove({ h: X.handle, pub: X.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  await X.loadDir([X.handle], true);
}
const sheetOf = (X, cid, iid) => { X.spy.els.length = 0; X.openRevoke(cid, iid); return X.spy.els; };
const press = async (els, text) => { const b = els.find((e) => e.tag === 'button' && e.textContent === text); assert.ok(b, 'a button "' + text + '"'); await b.onclick(); return b; };

test('45. a join card counts only through its link: puppets holding the key with no m, a wrong m, a copied m, a link that is gone, an unknown link or no link are never listed, wait, and get no key at a device removal\'s key change; the real joiner is listed', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), C = await w.page('carol'), D = await w.page('dave');
    const P = [await w.page('pete'), await w.page('quin'), await w.page('rita'), await w.page('sam'), await w.page('tom'), await w.page('uma')];
    await makeChannel(A, cid, ['alice', 'bob', 'carol']);
    assert.equal(await B.holds(cid, 0), true);
    const j = await linkOf(A, cid), gone = await linkOf(A, cid);
    await A.revokeInvite(cid, gone.iid);
    await D.joinPrivate(cid, j);                                // a real link joiner
    const dm = (await cardOf(A, cid, 'dave')).m;
    // Bob's stolen phone: its holder hands the key it holds to accounts of their own, which write join cards (no link, no admin)
    const odd = 'nOsUcHlInK01';
    await puppet(P[0], B, cid, '', '');                                                 // no link
    await puppet(P[1], B, cid, j.iid, '');                                              // the real link named, no m
    await puppet(P[2], B, cid, j.iid, b64u(randomBytes(32)));                           // a wrong m
    await puppet(P[3], B, cid, j.iid, dm);                                              // Dave's m, copied from his card
    await puppet(P[4], B, cid, odd, mac(b64u(randomBytes(16)), cid, odd, 'tom'));       // a link the record doesn't hold
    await puppet(P[5], B, cid, gone.iid, mac(gone.secret, cid, gone.iid, 'uma'));       // a revoked link's secret, the right m
    await A.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'carol', 'dave'], 'only the real joiner is listed');
    assert.deepEqual(A.spy.rotate, [], 'with no key change');
    const r = await roll(A, cid);
    assert.deepEqual([r.join, r.wait.map((x) => x.f).sort()], [[], P.map((X) => X.handle)], 'every puppet waits');
    assert.deepEqual((await roll(A, cid, true)).join.map((x) => x.f), ['dave'], 'every epoch: Dave alone came by a link');

    // Bob removes the lost device: his dev card, then the admin's key change. No puppet is listed, so none gets the new key.
    await newKeys(B);
    assert.deepEqual((await removal(B, [{ cid, members: ['alice', 'bob', 'carol', 'dave'] }])).rotated, [{ cid, card: 'dev' }]);
    await A.run(cid);
    assert.equal((await A.sync(cid)).epoch, 1);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'carol', 'dave']);
    for (const X of P) assert.equal(await X.holds(cid, 1), false, X.handle + ' gets no key');
    for (const X of [C, D]) assert.equal(await X.holds(cid, 1), true, X.handle + ' keeps the channel');

    // Dave's card: `m` as the spec has it, noted on his device for healCard, and still 528 bytes like every card.
    assert.deepEqual([dm, noted(D, cid).m, noted(D, cid).i, (await cardOf(A, cid, 'dave')).n], [mac(j.secret, cid, j.iid, 'dave'), dm, j.iid, 528]);
  });
});

test('46. a link carried across a leave, its `as` sealed again for a new admin, still vouches for its joiner; healCard writes the noted m again and the new admin\'s page lists them once more', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), C = await w.page('carol');
    let G = await w.page('gina');
    await makeChannel(A, cid, ['alice', 'bob', 'carol']);
    const j = await linkOf(A, cid);
    await leave(C, cid); await A.run(cid);                     // a leave's key change carries the link
    const c1 = await A.sync(cid);
    assert.deepEqual([c1.epoch, Object.keys(c1.invites)], [1, [j.iid]]);
    await G.joinPrivate(cid, j);                               // by the carried link, at epoch 1
    await A.setAdmins(cid, ['bob']);                           // a new admin secret: every `as` sealed again under it
    assert.notEqual((await A.sync(cid)).invites[j.iid].as, c1.invites[j.iid].as);
    await B.run(cid);                                          // Bob, admin now, opens the link's `as` with the new secret
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'gina'], 'listed by the new admin\'s page');

    // Gina's card is lost (30 days on the server) and a list without her written: her page writes the card again with its m.
    const g = await cardOf(A, cid, 'gina');
    assert.equal(g.m, mac(j.secret, cid, j.iid, 'gina'));
    await A.S.db.doc('channels/' + cid + '/roll/' + g.id).delete();
    assert.equal(await cardOf(A, cid, 'gina'), null);
    const v = A.metaOf(await A.shown(cid));
    await A.S.db.doc('channels/' + cid).update({ meta: await A.sealMeta(cid, 1, A.unb64(A.ksGet(cid, 1)), { ...v, members: ['alice', 'bob'] }) });
    G.clock.skew = 8 * 864e5;
    G = await w.reload(G);
    const sh = await G.shown(cid);
    assert.deepEqual([!!sh._unlocked, !!sh._unlisted], [false, false], 'her page reads no list (the server\'s rule, channel-members.test.js): it can\'t tell she is left out');
    await G.healCard(sh);   // and writes the join card it noted at the current epoch again, a week on (channel-history-nolist.test.js M6)
    const h = await cardOf(A, cid, 'gina');
    assert.deepEqual([h.k, h.e, h.i, h.m], ['join', 1, j.iid, g.m], 'the same link and m, written again');
    assert.ok(h.ts > g.ts);
    await B.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'gina'], 'listed again');
  });
});

test('47. Revoke and remove people who joined with it lists under "Joined with this link" only joiners whose m checks for it: a card naming the link with no m, or another\'s m, is under Waiting to join, and none ticked gets the new key', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), H = await w.page('hugo'), Q = await w.page('quin'), R = await w.page('rita');
    await makeChannel(A, cid, ['alice', 'bob']);
    assert.equal(await B.holds(cid, 0), true);
    const j = await linkOf(A, cid);
    await H.joinPrivate(cid, j);
    await puppet(Q, B, cid, j.iid, '');
    await puppet(R, B, cid, j.iid, (await cardOf(A, cid, 'hugo')).m);
    await A.sync(cid);
    const els = sheetOf(A, cid, j.iid);
    await press(els, 'Revoke and remove people who joined with it');
    const boxes = els.filter((e) => e.tag === 'input'), texts = els.map((e) => e.textContent);
    assert.deepEqual(boxes.map((b) => [b.value, !!b.checked]), [['hugo', false], ['quin', false], ['rita', false]]);
    assert.deepEqual(els.filter((e) => e.cls === 't-sub').map((e) => e.textContent), ['@hugo', '@quin', '@rita'], 'with their @usernames');
    assert.ok(texts.indexOf('Joined with this link') < texts.indexOf('hugo') && texts.indexOf('hugo') < texts.indexOf('Waiting to join') && texts.indexOf('Waiting to join') < texts.indexOf('quin'), JSON.stringify(texts));
    await press(els, 'Remove and revoke');
    assert.equal((await A.sync(cid)).epoch, 1);
    for (const X of [H, Q, R]) assert.equal(await X.holds(cid, 1), false, X.handle + ' gets none');
    assert.equal(await B.holds(cid, 1), true);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob']);
  });
});

// Add subscribers on X's page (openAddSubs), its elements as the page made them once the waiting list is read; no one picked.
const addSheet = async (X, cid) => { X.S.pick = []; X.S.convs = [await X.sync(cid)]; X.spy.els.length = 0; await X.openAddSubs(cid); return X.spy.els; };

test('108. people waiting to join last through one key change: release-91 joiners cut off by a leave\'s key change (never held back for them) still show under Waiting to join, in Add subscribers and in Revoke and remove people who joined with it, and Add gives one the current key and sends his note again, with no new link; a link joiner whose card is one key back only waits, never listed by itself; a card two key changes old is no longer shown', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), F = await w.page('fay'), G = await w.page('gus'), D = await w.page('dave');
    let B = await w.page('bob'), C = await w.page('carl');
    // Until the heal, today's server, where a subscriber's page reads the list that leaves it out; under the rule it reads none and
    // writes again only a join card noted at the current epoch, as this heal notes it (channel-history-nolist.test.js M6).
    const was = oldServer(w.T);
    await makeChannel(A, cid, ['alice', 'fay', 'gus']);
    const j = await linkOf(A, cid);
    for (const X of [B, C]) await X.joinPrivate(cid, j);
    // The live bug: no card on the server, none noted on their devices (as test 48 makes it); their release-92 pages write a card naming no link.
    for (const d of (await A.S.db.collection('channels/' + cid + '/roll').limit(10).get()).docs) await A.S.db.doc('channels/' + cid + '/roll/' + d.id).delete();
    B.ls.set('hush:cardsOut:bob', null); C.ls.set('hush:cardsOut:carl', null);
    B = await w.reload(B); C = await w.reload(C);
    for (const X of [B, C]) await X.healCard(await X.shown(cid));
    was.off();   // the server's rule from here on
    await A.run(cid);
    assert.deepEqual([(await A.meta(cid)).members, (await roll(A, cid)).wait.map((x) => x.f).sort()], [['alice', 'fay', 'gus'], ['bob', 'carl']], 'both wait');

    // Fay leaves; Dave joins by the link while the leave's key change is on its way, so his card is one key back once it lands, and the link is carried.
    await leave(F, cid);
    const rc = A.S.db.rotateChat; A.S.db.rotateChat = async (...a) => { A.S.db.rotateChat = rc; await D.joinPrivate(cid, j); return rc(...a); };
    await A.run(cid);
    const c1 = await A.sync(cid);
    assert.deepEqual([c1.epoch, Object.keys(c1.invites), (await A.meta(cid)).members], [1, [j.iid], ['alice', 'gus']], 'the leave batch ran, with no one waiting folded in, and carried the link');
    for (const X of [B, C, D]) assert.equal(await X.holds(cid, 1), false, X.handle + ' is cut off');
    assert.deepEqual([(await cardOf(A, cid, 'dave')).e, (await cardOf(A, cid, 'dave')).m], [0, mac(j.secret, cid, j.iid, 'dave')]);
    let r = await roll(A, cid);
    assert.deepEqual([r.join, r.wait.map((x) => x.f).sort()], [[], ['bob', 'carl', 'dave']], 'one key back, all three wait: the link vouches for Dave\'s card, but he holds no current key, so he is not listed by itself');
    await A.run(cid);
    assert.deepEqual([(await A.meta(cid)).members, (await A.sync(cid)).epoch, A.spy.rotate.length], [['alice', 'gus'], 1, 1], 'the next open lists no one and changes no key');
    let els = sheetOf(A, cid, j.iid);
    await press(els, 'Revoke and remove people who joined with it');
    const texts = els.map((e) => e.textContent);
    assert.deepEqual(els.filter((e) => e.tag === 'input').map((b) => [b.value, !!b.checked]).sort(), [['bob', false], ['carl', false], ['dave', false]], 'Revoke and remove people who joined with it lists all three, unticked');
    assert.ok(texts.indexOf('Joined with this link') < texts.indexOf('dave') && texts.indexOf('dave') < texts.indexOf('Waiting to join') && texts.indexOf('Waiting to join') < texts.indexOf('bob'), JSON.stringify(texts));

    // Add subscribers: Bob, ticked and added, is listed with the current key and his note is sent again.
    els = await addSheet(A, cid);
    const boxes = els.filter((e) => e.tag === 'input'), go = els.find((e) => e.tag === 'button');
    assert.deepEqual(boxes.map((b) => [b.value, !!b.checked]).sort(), [['bob', false], ['carl', false], ['dave', false]], 'Add subscribers lists all three under Waiting to join');
    const b = boxes.find((x) => x.value === 'bob'); b.checked = true; b.onchange();
    A.spy.inbox.length = 0;
    await go.onclick();
    assert.deepEqual([(await A.meta(cid)).members, await B.holds(cid, 1), A.spy.inbox], [['alice', 'gus', 'bob'], true, [[cid, ['bob'], true]]], 'listed, with the current key, and his note sent again, afresh');
    assert.equal((await B.sync(cid)).meta, undefined, 'his page reads no list (the server\'s rule): the owner\'s lists him, with no new link');
    assert.deepEqual([A.spy.rotate.length, (await A.sync(cid)).epoch], [1, 1], 'no key change');

    // A second key change: Carl's and Dave's cards, two keys back now, are no longer shown; Bob, listed, gets the new key.
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    r = await roll(A, cid);
    assert.deepEqual([(await A.sync(cid)).epoch, r.join, r.wait, (await addSheet(A, cid)).filter((e) => e.tag === 'input').length], [2, [], [], 0], 'two key changes old: no longer waiting');
    assert.deepEqual([await B.holds(cid, 2), await C.holds(cid, 2)], [true, false]);
  });
});

test('127. ensureInbox (the page\'s own): a note goes to each person once per chat per device; `fresh` sends again to those named, as an Add does for someone this device noted before, and forgets no one else noted for the chat, so the next post sends nothing to them again', async () => {
  const src = lift('async function ensureInbox(', 'function notePointer(') + '\nreturn ensureInbox;';
  const store = new Map(), ls = { get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d), set: (k, v) => store.set(k, JSON.stringify(v)) }, sent = [];
  const ensureInbox = new Function('S', 'ls', 'loadDir', 'typeOf', 'dropPointer', src)({ db: {}, me: { handle: 'alice' } }, ls, async () => {}, (c) => c.type, async (h, p) => { sent.push(h + ':' + p.t); });
  const c = { id: 'c1', type: 'channel', members: ['alice', 'bob', 'gus', 'ned'] };
  await ensureInbox(c); await ensureInbox(c);
  assert.deepEqual([sent, ls.get('hush:ptr:alice').c1.sort()], [['alice:invite', 'bob:invite', 'gus:invite', 'ned:invite'], ['alice', 'bob', 'gus', 'ned']], 'once each');
  sent.length = 0; await ensureInbox(c, ['bob'], true);
  assert.deepEqual([sent, ls.get('hush:ptr:alice').c1.sort()], [['bob:invite'], ['alice', 'bob', 'gus', 'ned']], 'fresh: Bob again, the others still noted');
  sent.length = 0; await ensureInbox({ ...c, members: [...c.members, 'kim'] });
  assert.deepEqual(sent, ['kim:invite'], 'the next post notes only who is new');
});
