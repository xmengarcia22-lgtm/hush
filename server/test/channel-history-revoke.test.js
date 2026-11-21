// Release 92 (page), private channel history: a channel link's two Revoke options (SPEC.md 5.6 "Member cards", "Links across
// a key change"): Revoke stops that link alone; Revoke and change the key lists, unticked, whoever joined through the link and
// everyone still waiting, reads the cards again at confirm, and gives the new key only to the listed members and the people
// ticked, with no link carried. Test 109: Remove admin and a block with no room for a key change list a link's joiners before they
// stop it (release 92's fix J). The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { world, makeChannel, linkOf } from './channel-history-kit.js';

// Helpers shared with channel-history-page.test.js, copied as the removal tests do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
const packet = (X, j) => X.inviteRaws(j.cid, j);   // what a link hands out, as a page about to join reads it
const notfound = (e) => !!e && e.code === 'notfound';
// The Revoke sheet on X's page (openRevoke), its elements as the page made them; `press` finds a button by its text and presses it.
const sheetOf = (X, cid, iid) => { X.spy.els.length = 0; X.openRevoke(cid, iid); return X.spy.els; };
const press = async (els, text) => { const b = els.find((e) => e.tag === 'button' && e.textContent === text); assert.ok(b, 'a button "' + text + '"'); await b.onclick(); return b; };
const lastToast = (X) => X.spy.toasts[X.spy.toasts.length - 1];
const FAILED = ['error', 'That didn’t go through. Check your connection and try again.'];
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
async function bareMeta(e, raw, x, ad) {   // an ometa as a page from before release 92 sealed it: no rs, so the record it gives is unsigned
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(ad) }, key, Buffer.from(JSON.stringify(x)))).toString('base64') };
}
// Save pressed in X's Edit sheet (openEditConv) on the record as the server has it: the sheet's error line ('' once saved). The owner's manual step (owner decision D1).
async function editSave(X, cid, name) {
  X.S.convs = [{ ...(await X.showMeta(await X.sync(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); return at((e) => e.cls === 'err').textContent;
}

test('25. Revoke stops that link alone, with no key change; Revoke and remove people who joined with it lists this link\'s joiners (listed or not) and everyone still waiting, none ticked, reads the cards again at confirm, gives the new key to the listed members and the people ticked only (not to an unticked joiner listed before the sheet opened or by another page while it was open, nor to a leaver), never lists or cuts off an admin who joined through it, stops every link, adds no one, a leaked-link holder\'s card from just before stays without effect, and a retry after another admin\'s key change reads the cards and the list again', async () => {
  await world({ limits: { framesPerMin: 3000, queriesPerMin: 3000 } }, async (w) => {   // alone on an idle machine it nears the default 300 frames and 120 queries a minute per connection
    const { cid } = w, A = await w.page('alice', { owner: true }), D = await w.page('adam');
    const [B, C, G, H, I, Pp, Q, R, T, U, V, W] = [await w.page('bob'), await w.page('carol'), await w.page('gina'), await w.page('hugo'), await w.page('ivan'), await w.page('pete'), await w.page('quin'), await w.page('rita'), await w.page('tina'), await w.page('uma'), await w.page('vera'), await w.page('wade')];
    await makeChannel(A, cid, ['alice', 'adam', 'bob', 'carol'], ['adam']);
    // A new link no one joined with, and no one waiting: the sheet says so, with nothing to tick.
    const j0 = await linkOf(A, cid);
    let els = sheetOf(A, cid, j0.iid);
    await press(els, 'Revoke and remove people who joined with it');
    assert.deepEqual([els.filter((e) => e.tag === 'input').length, els.some((e) => e.textContent === 'No one who joined with this link in the last 30 days is listed, and no one is waiting.'), els.some((e) => e.textContent === 'Remove and revoke')], [0, true, true]);

    // Tina joined by it, and a key change came before any admin's page listed her: she is waiting with a card one key back.
    await T.joinPrivate(cid, j0);
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    assert.equal(await T.holds(cid, 1), false);
    const j1 = await linkOf(A, cid), j2 = await linkOf(A, cid), j3 = await linkOf(A, cid);

    // Revoke: that entry alone goes, and the key stays.
    const e0 = (await A.sync(cid)).epoch, n0 = A.spy.rotate.length;
    els = sheetOf(A, cid, j1.iid);
    for (const t of ['The link stops working. People who already joined stay. Someone who opened the link but didn’t join may still be able to read for a while. If the link got into the wrong hands, use the second choice.',
      'For a link that got into the wrong hands. Tick the people who should stay. Everyone you leave unticked is removed. Only people who joined in the last 30 days are listed. All invite links for this channel stop working.']) assert.ok(els.some((e) => e.textContent === t), 'the hint: ' + t);
    await press(els, 'Revoke');
    assert.deepEqual([A.spy.confirms, lastToast(A)], [['Revoke this link? It stops working for anyone who hasn’t joined yet.'], ['Link revoked']]);
    assert.deepEqual(Object.keys((await A.sync(cid)).invites).sort(), [j2.iid, j3.iid].sort(), 'only that entry is gone');
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length], [e0, n0], 'no key change');
    await assert.rejects(packet(R, j1), notfound);
    assert.ok((await packet(R, j2))[e0], 'the other links still hand out the key');

    // Hugo and Wade joined by the link that leaked (j2) and Gina by another one (j3), all listed, and Wade was made an admin;
    // then Ivan by j2 and Pete by j3, waiting.
    await H.joinPrivate(cid, j2); await G.joinPrivate(cid, j3); await W.joinPrivate(cid, j2);
    await A.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'adam', 'bob', 'carol', 'hugo', 'gina', 'wade']);
    await A.sync(cid); await A.setAdmins(cid, ['adam', 'wade']);
    await I.joinPrivate(cid, j2); await Pp.joinPrivate(cid, j3);

    // Revoke and change the key: the sheet lists this link's joiners, listed or not, then everyone else waiting; none ticked.
    // Never an admin (Wade): only Remove admin or a block cuts off someone holding the admin secret.
    await A.sync(cid); A.spy.confirms.length = 0;
    els = sheetOf(A, cid, j2.iid);
    await press(els, 'Revoke and remove people who joined with it');
    const boxes = els.filter((e) => e.tag === 'input'), texts = els.map((e) => e.textContent);
    assert.deepEqual(boxes.map((b) => [b.type, b.value, !!b.checked]), [['checkbox', 'hugo', false], ['checkbox', 'ivan', false], ['checkbox', 'tina', false], ['checkbox', 'pete', false]]);
    assert.ok(texts.indexOf('Joined with this link') < texts.indexOf('hugo') && texts.indexOf('ivan') < texts.indexOf('Waiting to join') && texts.indexOf('Waiting to join') < texts.indexOf('tina'), JSON.stringify(texts));
    assert.ok(!texts.includes('No one who joined with this link in the last 30 days is listed, and no one is waiting.'));
    assert.deepEqual([A.spy.rotate.length, (await A.sync(cid)).epoch], [n0, e0], 'opening the sheet changes nothing');

    // While the sheet is open: Quin joins by the same link and Adam's page lists Quin, Ivan and Pete; then Hugo writes his join
    // card again (a leaked-link holder can, right up to the key change), Carol leaves, and Rita joins by the other link.
    await Q.joinPrivate(cid, j2);
    await D.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'adam', 'bob', 'carol', 'hugo', 'gina', 'wade', 'ivan', 'pete', 'quin']);
    await H.writeCard(await H.sync(cid), 'join', j2.iid);
    await leave(C, cid);
    await R.joinPrivate(cid, j3);
    await A.sync(cid);   // the record as the chat watch delivers it

    // Ivan and Tina ticked. The first try meets another admin's key change twice and fails, leaving everything as it was; the next goes.
    for (const b of boxes) if (['ivan', 'tina'].includes(b.value)) b.checked = true;
    A.spy.failRotate = ['conflict', 'conflict'];
    const go = await press(els, 'Remove and revoke');
    assert.deepEqual([lastToast(A), go.disabled, (await A.sync(cid)).epoch, A.spy.rotate.length], [FAILED, false, e0, n0 + 2], 'a second conflict fails, after one more try from a fresh record');
    await press(els, 'Remove and revoke');
    assert.deepEqual(A.spy.confirms, Array(2).fill('Remove and revoke? Everyone you left unticked loses access. Open invite links stop working.'));
    const t = lastToast(A);
    assert.deepEqual([t[0], t[1], t[3], typeof t[2]], ['Invite link reset. Share a new one.', 'New link', 8000, 'function']);
    const spec = A.spy.rotate[A.spy.rotate.length - 1], e1 = (await A.sync(cid)).epoch;
    assert.deepEqual([e1, 'why' in spec, 'invites' in spec, A.spy.rotate.length], [e0 + 1, false, false, n0 + 3], 'one key change, no why, no link carried');
    for (const X of [A, D, B, G, W, I, T]) assert.equal(await X.holds(cid, e1), true, X.handle + ' gets the new key');
    for (const X of [H, Q, Pp, C, R]) assert.equal(await X.holds(cid, e1), false, X.handle + ' gets none');
    assert.deepEqual([(await A.meta(cid)).members, (await A.shown(cid)).admins], [['alice', 'adam', 'bob', 'gina', 'wade', 'ivan', 'tina'], ['adam', 'wade']]);
    assert.deepEqual(Object.keys((await A.sync(cid)).invites || {}), [], 'every open link stopped');
    for (const j of [j2, j3]) await assert.rejects(packet(R, j), notfound);
    const cards = await A.cards(cid);
    assert.ok(!cards.includes('carol:leave') && cards.includes('hugo:join'), 'the leave card applied and deleted; join cards stay: ' + cards);

    // Hugo's card, now one key back, brings him back on no admin's page; a card from him at the new epoch can't be written.
    await H.writeCard(await H.sync(cid), 'join', j2.iid).catch(() => {});
    await A.run(cid); await D.run(cid);
    assert.deepEqual([(await A.meta(cid)).members, A.spy.rotate.length, D.spy.rotate.length, (await A.sync(cid)).epoch], [['alice', 'adam', 'bob', 'gina', 'wade', 'ivan', 'tina'], n0 + 3, 0, e1]);
    assert.equal(await H.holds(cid, e1), false);

    // Another admin's key change while this page's record is a key behind, then Vera joins by a link of theirs (j5) and is
    // listed by their page. While this page's first try is on its way, Uma joins by another of their links, the one that
    // leaked (j4), and their page lists her too. Once more from the fresh record, with the cards and the list read again: Uma
    // gets no key, and Vera, listed only in the fresh copy, keeps hers.
    await D.rotateTo(await D.sync(cid), D.metaOf(await D.shown(cid)));
    const j4 = await linkOf(D, cid), j5 = await linkOf(D, cid);
    await V.joinPrivate(cid, j5); await D.run(cid);
    assert.equal(A.S.chatDocs.get(cid).epoch, e1, 'Alice\'s copy is a key behind');
    const send = A.S.db.rotateChat; let listed = null;
    A.S.db.rotateChat = async (...x) => { A.S.db.rotateChat = send; await U.joinPrivate(cid, j4); await D.run(cid); listed = (await D.meta(cid)).members; return send(...x); };
    await A.revokeRekey(cid, j4.iid, [], []);
    assert.deepEqual(listed, ['alice', 'adam', 'bob', 'gina', 'wade', 'ivan', 'tina', 'vera', 'uma'], 'listed by Adam\'s page while the first try was on its way');
    assert.deepEqual([A.spy.rotate.length, (await A.sync(cid)).epoch], [n0 + 5, e1 + 2], 'refused once (conflict), then from the fresh record');
    for (const X of [A, D, B, G, W, I, T, V]) assert.equal(await X.holds(cid, e1 + 2), true, X.handle + ' keeps the channel');
    assert.equal(await U.holds(cid, e1 + 2), false, 'uma gets none');
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'adam', 'bob', 'gina', 'wade', 'ivan', 'tina', 'vera']);

    // A copy whose member list doesn't open on this page: the sheet lists no one, and no key change leaves everyone out.
    const rec = await A.sync(cid);
    A.S.chatDocs.set(cid, { ...rec, meta: await A.sealMeta(cid, rec.epoch, randomBytes(32), { name: 'History', owner: 'alice', admins: [], members: ['alice'], banned: [] }) });
    els = sheetOf(A, cid, j2.iid);
    await press(els, 'Revoke and remove people who joined with it');
    assert.deepEqual([lastToast(A), els.filter((e) => e.tag === 'input').length], [FAILED, 0]);
    await assert.rejects(A.revokeRekey(cid, j2.iid, [], []), (e) => !!e && e.message === 'notmember');
    assert.deepEqual([A.spy.rotate.length, (await A.sync(cid)).epoch], [n0 + 5, e1 + 2], 'nothing changed');
  });
});

test('53. Revoke, the link alone, first acts on the cards as opening the channel does: whoever joined through the link since the admin\'s page last opened it is listed while the link still vouches for them, with no key change, so they stay subscribed; the next leave\'s key change gives them the new key, and no one is left waiting', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), F = await w.page('fay'), D = await w.page('dave');
    await makeChannel(A, cid, ['alice', 'fay']);
    await A.run(cid);   // the channel open on the admin's page
    const j = await linkOf(A, cid);
    await D.joinPrivate(cid, j);   // Dave joins while it stays open
    A.S.convs = [{ ...(await A.shown(cid)), id: cid }]; const n0 = A.spy.rotate.length;
    await press(sheetOf(A, cid, j.iid), 'Revoke');
    assert.deepEqual([lastToast(A), Object.keys((await A.sync(cid)).invites || {}), (await A.meta(cid)).members, A.spy.rotate.length], [['Link revoked'], [], ['alice', 'fay', 'dave'], n0], 'the link gone, Dave listed, no key change');
    await leave(F, cid); await A.run(cid);
    const c = await A.sync(cid), r = await A.readRoll(c, A.metaOf(await A.showMeta(c)));
    assert.deepEqual([A.epochOf(c), (await A.meta(cid)).members, await D.holds(cid, 1), r.wait], [1, ['alice', 'dave'], true, []], 'after Fay\'s leave Dave holds the new key');
  });
});

test('109. a link stopped with no key change by Remove admin, or by a block with no room for a key change, first lists whoever joined through it, while the link still vouches for them (as Revoke does, test 53), so they keep the key at the next leave', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), K = await w.page('kim'), Y = await w.page('yan'), Z = await w.page('zed'), Q = await w.page('quin');
    await makeChannel(A, cid, ['alice', 'yan', 'zed', 'quin'], ['yan']);
    await A.shown(cid); await A.rolesQ.get(cid);
    const j = await linkOf(A, cid);
    await B.joinPrivate(cid, j);
    // Remove admin (setAdmins): Bob is listed, then the admin secret is replaced and every open link stops; no key change.
    A.S.convs = [{ ...(await A.shown(cid)), id: cid }]; const n0 = A.spy.rotate.length;
    assert.equal(await A.setAdmins(cid, []), true, 'open links stopped');
    const c = await A.sync(cid);
    assert.deepEqual([(await A.meta(cid)).members, (await A.shown(cid)).admins, Object.keys(c.invites || {}), c.epoch, A.spy.rotate.length], [['alice', 'yan', 'zed', 'quin', 'bob'], [], [], 0, n0], 'Bob listed first; Yan no admin; the link gone; no key change');
    await leave(Z, cid); await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, await B.holds(cid, 1)], [1, ['alice', 'yan', 'quin', 'bob'], true], 'Bob gets the next leave\'s key');

    // A block with no room for a key change (toolarge): Kim, who joined by a new link, is listed in the lists-only write that stops the links.
    const j2 = await linkOf(A, cid);
    await K.joinPrivate(cid, j2);
    A.spy.failRotate = ['toolarge']; A.spy.updates.length = 0;
    assert.equal(await A.kickMember(cid, 'quin', { ban: true }), undefined);
    const c2 = await A.sync(cid), m2 = await A.meta(cid);
    assert.deepEqual([A.spy.updates, m2.members, m2.banned, Object.keys(c2.invites || {}), c2.epoch], [[['meta', 'invites']], ['alice', 'yan', 'bob', 'kim'], ['quin'], [], 1], 'one write: Quin out and blocked, Kim in, the link gone, no key');
    await leave(Y, cid); await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, await K.holds(cid, 2), await Q.holds(cid, 2)], [2, ['alice', 'bob', 'kim'], true, false], 'Kim gets the next leave\'s key; Quin none');
  });
});

test('125. a block of an admin with room for a key change lists no link joiner first: the admin key is replaced with no lists-only write, the key change leaves them out (a lost device may know the link), and they wait for an Add', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }); await w.page('xena'); const J = await w.page('joe');
    const roll = async (X) => { const c = await X.sync(cid); return X.readRoll(c, X.metaOf(await X.showMeta(c))); };
    await makeChannel(A, cid, ['alice', 'xena'], ['xena']);
    await A.shown(cid); await A.rolesQ.get(cid);
    await J.joinPrivate(cid, await linkOf(A, cid));
    assert.deepEqual([(await A.meta(cid)).members, (await roll(A)).join.map((x) => x.f)], [['alice', 'xena'], ['joe']], 'Joe joined by the link and is not listed yet');
    const seen = [], real = A.S.db.rotateChat;
    A.S.db.rotateChat = async (c, spec) => { seen.push((await A.readMeta({ id: cid, ...(await A.S.db.doc('channels/' + cid).get()).data() })).members); return real(c, spec); };   // the server's list right before the key change
    A.spy.updates.length = 0;
    await A.sync(cid); await A.kickMember(cid, 'xena', { ban: true });
    A.S.db.rotateChat = real;
    assert.deepEqual([seen, A.spy.updates.filter((k) => k.length === 1 && k[0] === 'meta')], [[['alice', 'xena']], []], 'no lists-only write: the list before the key change named no joiner');
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, (await A.shown(cid)).admins, await J.holds(cid, 1), (await roll(A)).wait.map((x) => x.f)], [1, ['alice'], [], false, ['joe']], 'Xena blocked and no admin; Joe cut off and waiting');
  });
});

test('132. a link whose joiners this device can\'t tell (no `as` on the link, or no admin secret the owner signed on this device): Revoke and remove people who joined with it lists no one under "Joined with this link", says so, not "no one joined", and Remove and revoke is disabled (owner decision D5); with the `as` and the signed secret it lists them, says the unticked stay under Waiting to join, and the button works; on the owner\'s own page with the admin list unsigned (a channel from before release 92) the hint says the list isn\'t signed yet and names Edit then Save, not "the owner\'s device", and after her save and the next open the sheet works (release 93b, item 9)', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), D = await w.page('dave'), E = await w.page('eve');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']);
    const j1 = await linkOf(A, cid), j2 = await linkOf(A, cid);
    await D.joinPrivate(cid, j1); await E.joinPrivate(cid, j2); await A.run(cid); await B.sync(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'dave', 'eve'], 'both listed through their links');
    const BLIND = 'This device can’t show who joined with this link, so it can’t remove them here. The channel’s owner hasn’t confirmed this device as an admin’s yet, or the link was made with an older version of Hush. You can still revoke the link.';
    const NONE = 'No one who joined with this link in the last 30 days is listed, and no one is waiting.';
    const UNTICKED = 'Changed your mind? Most people you remove here stay under Waiting to join for now, so you can add them back. Anyone else needs a new link.';
    const sheet = async (X, j) => { const els = sheetOf(X, cid, j.iid); await press(els, 'Revoke and remove people who joined with it'); const go = els.find((e) => e.tag === 'button' && e.textContent === 'Remove and revoke'); return [els.filter((e) => e.tag === 'input').map((b) => b.value), els.some((e) => e.textContent === BLIND), els.some((e) => e.textContent === NONE), els.some((e) => e.textContent === UNTICKED), go ? go.disabled : 'gone']; };
    assert.deepEqual([await sheet(A, j1), await sheet(B, j2)], [[['dave'], false, false, true, false], [['eve'], false, false, true, false]], 'with the link\'s as and the owner\'s signed secret: this link\'s joiner listed, the unticked hint shown and Remove and revoke enabled, on the owner\'s page and an admin\'s');
    await A.S.db.doc('channels/' + cid).update({ invites: { [j1.iid]: { as: null } } }); await A.sync(cid);   // j1 as a page from before release 92 left it
    assert.deepEqual(await sheet(A, j1), [[], true, false, false, true], 'no as: Dave\'s card counts for no link, so the sheet says this device can\'t tell, not "no one", and Remove and revoke is disabled');
    const old = await A.newIdentity(); B.S.pins = { alice: { ecdh: old.ecdh, sig: old.sig } };   // Bob's page has seen the owner's key change without accepting it: the secret she signed counts for nothing there (verifiedAdmin)
    assert.deepEqual([await B.verifiedAdmin(await B.sync(cid)), await sheet(B, j2)], [null, [[], true, false, false, true]], 'no admin secret the owner signed on this device: the same, Eve\'s card counting for no link');

    // The owner's own page on a channel from before release 92 (its admin list unsigned, so no admin secret counts here until she signs it, owner decision D1):
    // blind too, but the hint names the one manual step rather than "the owner's device" (release 93b, item 9); her save and the next open make the secret and seal her link's `as`.
    const OWNER = 'This channel’s admin list isn’t signed yet, so this device can’t tell who joined with this link and can’t remove them here. In Channel info, tap Edit and Save to sign it, then open the channel again. You can still revoke the link.';
    const g = cid.slice(0, -1) + 'z', F = await w.page('fay');
    await makeChannel(A, g, ['alice', 'bob'], []);
    await A.S.db.doc('channels/' + g).update({ ometa: await bareMeta(0, keyOf(A, g, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins: [] }, 'hush-ometa-v1|' + g) });   // as a page from before release 92 sealed it
    await A.shown(g); await A.rolesQ.get(g); assert.equal(A.rolesOf(g).s, 0, 'her record is unsigned');
    const j3 = await linkOf(A, g); await F.joinPrivate(g, j3);   // her link has no `as` (no secret she signed), and joins as before
    const owner = async (j) => { const els = sheetOf(A, g, j.iid); await press(els, 'Revoke and remove people who joined with it'); const go = els.find((e) => e.tag === 'button' && e.textContent === 'Remove and revoke'); return [els.filter((e) => e.tag === 'input').map((b) => b.value), els.some((e) => e.textContent === OWNER), els.some((e) => e.textContent === BLIND), els.some((e) => e.textContent === UNTICKED), go ? go.disabled : 'gone']; };
    assert.deepEqual(await owner(j3), [['fay'], true, false, false, true], 'the owner\'s page, the list unsigned: Fay only waits (her card counts for no link), the hint says the list isn\'t signed yet and names Edit then Save, not "the owner\'s device", and Remove and revoke is disabled');
    assert.equal(await editSave(A, g, 'History'), '', 'Edit, then Save'); await A.run(g);   // her next open: a fresh admin secret, and her link gets its `as`
    assert.deepEqual(await owner(j3), [['fay'], false, false, true, false], 'after the save and the next open: Fay listed through the link, the unticked hint, and the button works');
  });
});
