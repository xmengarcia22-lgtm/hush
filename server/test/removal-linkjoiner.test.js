// A person who joined a private channel by link, was never added by an admin, and then removes a device (release 104, item 7;
// SPEC.md 5.6 "Member cards", 14.15).
//
// The server hands a channel's member list to its owner and admins only, so a subscriber's page reads no list: it cannot know
// whether it is listed, and a device removal on it writes a dev card (rekeyChat), over the join card if the person was still
// waiting, since a channel keeps one card per account. Until release 104 an admin's page acted on a dev card only from a listed
// person and ignored one from anybody else: such a person was no longer under Waiting to join, nothing happened, the removed
// device read on, and the summary said the removed device "stops reading these channels when one of their admins next opens Hush".
//
// From release 104:
//   - readRoll counts a dev card from a person who is NOT listed as "waiting to join", exactly like a join card that no link
//     vouches for. It changes no key and lists nobody by itself. The card is checked as every card is: only in its author's own
//     slot, signed by the author's account key of now, once per new account key, never from a blocked person.
//   - so the admin sees the person in the chat list's notice and under Waiting to join, adds them, and the next open of the
//     channel (the card now being a listed person's) changes the key without the removed device.
//   - the summary says so, for every private channel that got a dev card, in the approved words (NEW below).
// A dev card from a listed person acts as before.
//
// The removal runs as written (rekeyRun's rotate stage with rekeyChat, then rekeySummary), and the admin's page with its own
// functions (readRoll, rollRun, the notice's list, Add subscribers), on the page harness of channel-history-kit.js against a real
// server with today's rule (no list below admin level). The steps of the new sentence, in their order and with the admin's
// accept of the new security code, are in shut-out-steps.test.js (case D).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { b64u, world, makeChannel, linkOf, pageFor } from './channel-history-kit.js';

// Helpers shared with channel-history-waiting.test.js and channel-history-cards3.test.js, copied as those files do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; await X.leaveChat(cid); };
const roll = async (A, cid, all) => { const c = await A.sync(cid); return A.readRoll(c, A.metaOf(await A.showMeta(c)), all); };
// A device removal on X's page from its rotate stage on, stopped at the next stage (the vault); `rec.rotated` is what each chat came to.
async function removal(X, chats) {
  const rec = { stage: 'rotate', name: 'Old phone', rotated: [], chats: chats.map((x) => ({ type: 'channel', vis: 'private', owner: false, admin: false, admins: [], members: [], name: 'History', unlocked: true, ...x })) }, fails = [];
  const ui = { step: (t) => { if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} };
  X.S.contactsReady = true; X.S.vaultOk = true;
  await X.rekeyRun(rec, ui);
  assert.deepEqual(fails, ['Removing the device stopped (stop). Close Hush and open it again to finish it.'], 'the rotate stage ran to its end');
  assert.equal(X.S.rekeying, true); X.S.rekeying = false;
  return rec;
}
// The account's new keys as the removal's keys, write and mirror stages leave them.
async function newKeys(X) {
  await X.rekeyIdentity(X.S.me); X.S.keys.clear(); X.S.chanKeys.clear();
  await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() });
  const sk = await crypto.subtle.importKey('jwk', X.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await X.S.db.prove(null);
  await X.S.db.prove({ h: X.handle, pub: X.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  await X.loadDir([X.handle], true);
}
const summary = (X, rec) => { X.spy.els.length = 0; X.rekeySummary(rec); return X.spy.els.map((e) => e.textContent).filter(Boolean); };
// Whether the keys of the account's removed device (`old`, its identity from before the removal) open a wrap of the record's for epoch e.
const lostOpens = async (A, h, old, cid, e) => !!(await (await pageFor(null, h, { id: old })).convKey(await A.sync(cid), e));
// Add subscribers on X's page (openAddSubs) with `who` picked, and Add pressed.
const addPicked = async (X, cid, who) => { X.S.pick = who; X.S.convs = [await X.sync(cid)]; X.spy.els.length = 0; await X.openAddSubs(cid); await X.spy.els.find((e) => e.tag === 'button').onclick(); };
const rows = async (X, cid) => (await X.S.db.collection('channels/' + cid + '/roll').limit(1000).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
// h's card of kind k as the server holds it, found by admin M's page: its row id and { e, iv, ct }, what another account would write again from its own slot.
const cardOf = async (M, cid, h, k) => { const c = await M.sync(cid);
  for (const r of await rows(M, cid)) { const x = await M.openCard(c, r); if (x && x.f === h && x.k === k) return { id: r.id, e: r.e, iv: r.iv, ct: r.ct }; } return null; };

// What the admin's page makes of the cards: who is in each kind.
const kinds = async (A, cid) => { const r = await roll(A, cid); return { join: r.join.map((x) => x.f).sort(), wait: r.wait.map((x) => x.f).sort(), leave: r.leave.map((x) => x.f).sort(), dev: r.dev.map((x) => x.f).sort(), adm: r.adm.map((x) => x.f).sort() }; };
const none = { join: [], wait: [], leave: [], dev: [], adm: [] };
// The chat list as the page holds it (each channel's readable copy), and the notice: who waits to join, by channel.
const notice = async (A, cid) => { A.S.convs = [{ ...(await A.shown(cid)), id: cid }]; return A.waitList().map(([c, x]) => [c, x.n, [...x.hs].sort()]); };
// Add subscribers opened on the admin's page with nobody picked: the people offered, and whether the Waiting to join label stands.
const offered = async (A, cid) => { A.S.pick = []; A.S.convs = [await A.sync(cid)]; A.spy.els.length = 0; await A.openAddSubs(cid);
  return { who: A.spy.els.filter((e) => e.tag === 'input').map((e) => e.value).sort(), label: A.spy.els.some((e) => e.textContent === 'Waiting to join') }; };
// The notice's sheet (Waiting to join) on X's page: `who` ticked and its Add pressed. It offers only people the page holds as waiting.
const addWaiting = async (X, cid, who) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.spy.els.length = 0; await X.openWaiting();
  const boxes = X.spy.els.filter((e) => e.tag === 'input'), go = X.spy.els.find((e) => e.tag === 'button'), b = boxes.find((x) => x.value === who);
  assert.ok(b, who + ' is offered in the Waiting to join sheet (offered: ' + JSON.stringify(boxes.map((x) => x.value)) + ')'); b.checked = true; b.onchange(); await go.onclick(); };
const forget = (X, cid) => { const m = X.ls.get('hush:cardsOut:' + X.handle, {}); delete m[cid]; X.ls.set('hush:cardsOut:' + X.handle, m); };   // this device's own note of the card it wrote
const noted = (X, cid) => X.ls.get('hush:cardsOut:' + X.handle, {})[cid];

const NEW = (names) => 'Ask an admin of these channels to open the channel: ' + names + '. If they see you under Waiting to join, they add you, then open the channel once more. That shuts the removed device out. Until an admin has accepted your new security code, new posts there may not show for you either. If that lasts more than 30 days, ask for a new invite link.';
const OLD = /stops reading these channels|when one of their admins next opens Hush/;
const OTHER = /The removed device can still read|Couldn’t secure these chats|You had left/;   // the sentences of the other answers: none of them fits a dev card
const said = (t) => ({ new: t.filter((x) => /^Ask an admin of these channels/.test(x)), old: t.filter((x) => OLD.test(x)), other: t.filter((x) => OTHER.test(x)) });

// Alice's private channel with Bob listed; Dave joins by link and no admin's page has opened the channel since: he is not listed.
async function joined(w, o = {}) {
  const { cid } = w, A = await w.page('alice', { owner: true }), D = await w.page('dave'); await w.page('bob');
  await makeChannel(A, cid, ['alice', 'bob']);
  await D.joinPrivate(cid, await linkOf(A, cid));
  assert.deepEqual([await A.cards(cid), noted(D, cid).k, !!noted(D, cid).i], [['dave:join'], 'join', true], 'Dave\'s join card, naming his link, and his device\'s note of it');
  if (o.noNote) forget(D, cid);
  return { cid, A, D, old: D.id };
}
const removed = async (D, cid) => { await newKeys(D); D.spy.card.length = 0; return removal(D, [{ cid }]); };   // his page reads no list: the read stage names no member

for (const note of [false, true]) test((note ? '2' : '1') + '. a link joiner no admin has listed yet removes a device, ' + (note ? 'on the device that joined (it holds its note of the join)' : 'on a device that has no note of the join (he joined on another one)') + ': the removal writes the dev card, as before, and the summary says in the approved words to ask an admin to open the channel; the old sentence, and the sentences of the other answers, stand nowhere', async () => {
  await world({}, async (w) => {
    const { cid, A, D } = await joined(w, { noNote: !note });
    const rec = await removed(D, cid);
    assert.deepEqual([rec.rotated, D.spy.card, noted(D, cid).k, await A.cards(cid)], [[{ cid, card: 'dev' }], [cid], 'dev', ['dave:dev']], 'the dev card, over his join card (one card per account), with or without a note: his page cannot know whether he is listed');
    assert.deepEqual(said(summary(D, rec)), { new: [NEW('History')], old: [], other: [] });
  });
});

test('3. a listed subscriber removes a device: the dev card, as before, and the same sentence (it is true for a listed person too: the admin\'s open changes the key)', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), C = await w.page('carol');
    await makeChannel(A, cid, ['alice', 'carol']);
    assert.equal(await C.holds(cid, 0), true, 'her device holds the key of the channel, in its key store');
    await newKeys(C); C.spy.card.length = 0;
    const rec = await removal(C, [{ cid }]);
    assert.deepEqual([rec.rotated, C.spy.card, noted(C, cid).k, await A.cards(cid)], [[{ cid, card: 'dev' }], [cid], 'dev', ['carol:dev']], 'guard: the card is the one written before release 104');
    assert.deepEqual(said(summary(C, rec)), { new: [NEW('History')], old: [], other: [] });
  });
});

test('4. a leave card still pending wins, as before: the removal writes the leave again, no dev card, and the summary says "You had left", not the new sentence', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'); await w.page('cyd');
    await makeChannel(A, cid, ['alice', 'bob', 'cyd']);
    await leave(B, cid);
    await newKeys(B); B.spy.card.length = 0;
    const rec = await removal(B, [{ cid }]);
    assert.deepEqual([rec.rotated, B.spy.card, noted(B, cid).k, await A.cards(cid)], [[{ cid, skip: 'left', card: 'leave' }], [cid], 'leave', ['bob:leave']]);
    const t = summary(B, rec);
    assert.deepEqual([said(t).new, said(t).old, t.includes('You had left History. That still stands.')], [[], [], true]);
  });
});

test('5. the admin\'s page and a dev card from a person who is not listed: he is under Waiting to join, in the chat list\'s notice and in Add subscribers; the card changes no key and lists nobody, at this open and at the next', async () => {
  await world({}, async (w) => {
    const { cid, A, D, old } = await joined(w);
    await removed(D, cid);
    assert.deepEqual(await kinds(A, cid), { ...none, wait: ['dave'] }, 'waiting: not a dev card to act on, not a join');
    for (let i = 0; i < 2; i++) await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await A.meta(cid)).members, A.rolesOf(cid).dk], [0, 0, ['alice', 'bob'], undefined], 'no key change, nobody listed, and no dev card noted as acted on');
    assert.deepEqual(await notice(A, cid), [[cid, 'History', ['dave']]], 'the chat list\'s notice names him');
    assert.deepEqual(await offered(A, cid), { who: ['dave'], label: true }, 'Add subscribers offers him under Waiting to join');
    assert.equal(await lostOpens(A, 'dave', old, cid, 0), true, 'and nothing is shut out yet: the removed device\'s keys still open the current key (the sentence says so: the admin adds, then opens once more)');
  });
});

test('6. the admin adds the person from the Waiting to join sheet (no key change), and the next open of the channel changes the key: the card is a listed person\'s now; his remaining device holds the new key (the admin\'s page never held his old security code), and the removed device\'s keys open no wrap of it', async () => {
  await world({}, async (w) => {
    const { cid, A, D, old } = await joined(w);
    await removed(D, cid);
    await A.run(cid);
    await addWaiting(A, cid, 'dave');
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await A.meta(cid)).members, await lostOpens(A, 'dave', old, cid, 0)], [0, 0, ['alice', 'bob', 'dave'], true], 'added: listed, no key change, so the removed device still reads');
    assert.deepEqual(await kinds(A, cid), { ...none, dev: ['dave'] }, 'his card is a listed person\'s dev card now');
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await A.meta(cid)).members, A.rolesOf(cid).dk], [1, 1, ['alice', 'bob', 'dave'], { dave: 2 }], 'the open after the Add: one key change, he stays listed');
    assert.deepEqual([await D.holds(cid, 1), await lostOpens(A, 'dave', old, cid, 1)], [true, false], 'SHUT OUT: his remaining device holds the new key, the removed device\'s keys open nothing of it');
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, await notice(A, cid)], [1, []], 'the card acted once; nobody waits any more');
  });
});

test('7. who does NOT get under Waiting to join with a dev card: a copy of the card in another account\'s slot, a card signed with the account key from before the removal, a card from an account whose key never changed, and a card from a blocked person', async () => {
  await world({}, async (w) => {
    const { cid, A, D } = await joined(w);
    const M = await w.page('mallory'), G = await w.page('gus'), E = await w.page('erin');
    await addPicked(A, cid, ['mallory']);   // a listed subscriber: she holds the channel's key and has a slot of her own
    await removed(D, cid);
    assert.deepEqual(await kinds(A, cid), { ...none, wait: ['dave'] }, 'control: his own card, in his slot, signed by his key of now, waits');
    // another account's slot: Mallory writes his card again, byte for byte, from hers, and his own is gone
    const cap = await cardOf(A, cid, 'dave', 'dev');
    await A.S.db.doc('channels/' + cid + '/roll/' + cap.id).delete(); await M.S.db.card(cid, cap.e, cap.iv, cap.ct);
    assert.deepEqual([await A.cards(cid), await kinds(A, cid)], [['dave:dev'], none], 'the copy opens as his card, and counts for nothing outside his slot');
    await D.writeCard(await D.sync(cid), 'dev');
    assert.deepEqual((await kinds(A, cid)).wait, ['dave'], 'control: written again in his own slot, it waits again');
    // the account key from before the removal: Gus's dev card is signed, then his account key changes (what the removed device could at most have written)
    await G.joinPrivate(cid, await linkOf(A, cid)); await G.writeCard(await G.sync(cid), 'dev'); await newKeys(G);
    // an account whose key never changed: Erin writes a dev card over her join card
    await E.joinPrivate(cid, await linkOf(A, cid)); await E.writeCard(await E.sync(cid), 'dev');
    assert.deepEqual([(await A.cards(cid)).sort(), await kinds(A, cid)], [['dave:dev', 'dave:dev', 'erin:dev', 'gus:dev'], { ...none, wait: ['dave'] }], 'Gus (old signature) and Erin (no new key) do not wait, and their replaced join cards list nobody');
    // blocked: Alice blocks Dave. The server deletes his card with the block (setBan, since release 91), so none of his is left to count
    await A.kickMember(cid, 'dave', { ban: true });
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).banned, await kinds(A, cid), await notice(A, cid)], [1, ['dave'], none, []], 'a blocked person\'s card counts for nothing');
    // The server deleted his card with the block, so the page's own check has not been asked yet. It is asked when the signed list
    // names him blocked and the server lets him write all the same: the server's block is lifted behind the list, he comes back by
    // a link and writes his card again, in his own slot, signed by his key of now.
    assert.deepEqual((await A.cards(cid)).sort(), ['dave:dev', 'erin:dev', 'gus:dev'], 'control: his own card went with the block (Mallory\'s copy of it stays)');
    await A.S.db.banChat(cid, 'dave', false);
    await D.joinPrivate(cid, await linkOf(A, cid)); await D.writeCard(await D.sync(cid), 'dev');
    assert.deepEqual([(await A.meta(cid)).banned, (await A.cards(cid)).sort(), await kinds(A, cid), await notice(A, cid)], [['dave'], ['dave:dev', 'dave:dev', 'erin:dev', 'gus:dev'], none, []], 'his card is there again, and the signed list still names him blocked: it counts for nothing');
  });
});

test('8. a dev card from a listed person acts exactly as before: it is a dev card to the admin\'s page, nobody waits, and the open changes the key once', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), C = await w.page('carol'); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob', 'carol']);
    assert.equal(await C.holds(cid, 0), true, 'her device holds the key of the channel, in its key store');
    const old = C.id;
    await newKeys(C); await removal(C, [{ cid }]);
    assert.deepEqual(await kinds(A, cid), { ...none, dev: ['carol'] });
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await A.meta(cid)).members, A.rolesOf(cid).dk, await notice(A, cid)], [1, 1, ['alice', 'bob', 'carol'], { carol: 2 }, []]);
    assert.deepEqual([await C.holds(cid, 1), await lostOpens(A, 'carol', old, cid, 1)], [true, false]);
    await A.run(cid);
    assert.equal((await A.sync(cid)).epoch, 1, 'once per new account key');
  });
});

test('9. a join card that no link vouches for and a dev card, from two people who are not listed, at once: both wait, and nothing else changes', async () => {
  await world({}, async (w) => {
    const { cid, A, D } = await joined(w);
    const E = await w.page('erin');
    await E.joinPrivate(cid, await linkOf(A, cid)); forget(E, cid); await E.writeCard(await E.sync(cid), 'join', '', '');   // a join card naming no link, as a release-91 page wrote it
    await removed(D, cid);
    assert.deepEqual([(await A.cards(cid)).sort(), await kinds(A, cid)], [['dave:dev', 'erin:join'], { ...none, wait: ['dave', 'erin'] }]);
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await A.meta(cid)).members, await notice(A, cid)], [0, 0, ['alice', 'bob'], [[cid, 'History', ['dave', 'erin']]]], 'no key change, nobody listed, both in the notice');
    assert.deepEqual(await offered(A, cid), { who: ['dave', 'erin'], label: true });
  });
});
