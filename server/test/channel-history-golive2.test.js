// Release 92 (page), private channel history, the start's pass and the chat list's notice, second file (SPEC.md 5.6 "The start's
// pass"; the first is channel-history-golive.test.js): the notice follows the record and its Add reads the cards again; a read the
// server refuses is a failure for the pass, and so is a channel whose current key this device lacks (neither makes it wait); one tab at a time runs the pass;
// the pass's pauses and its rate-limit answers are channel-history-golive3.test.js. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { offline, world, makeChannel, linkOf } from './channel-history-kit.js';

// Helpers shared with channel-history-golive.test.js, copied as the removal tests do.
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const otherCid = (cid, n) => cid.slice(0, -1) + 'xyzw'[n];
async function bareMeta(e, raw, x, ad) {   // an ometa as a page from before release 92 sealed it (no rs)
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(ad) }, key, Buffer.from(JSON.stringify(x)))).toString('base64') };
}
// A private channel as a page from before release 92 left it: its ometa unsigned, naming no admin secret; the owner has yet to sign it by hand.
async function pre92(A, cid, members, admins = []) {
  await makeChannel(A, cid, members, admins);
  await A.S.db.doc('channels/' + cid).update({ ometa: await bareMeta(0, keyOf(A, cid, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins }, 'hush-ometa-v1|' + cid) });
  return A.sync(cid);
}
// Save pressed in the owner's Edit sheet (openEditConv) with the name as it is: the record's list signed at a fresh rt, naming no admin secret yet (owner decision D1's manual step).
async function editSave(X, cid, name = 'History') {
  X.S.convs = [{ ...(await X.showMeta(await X.sync(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); assert.equal(at((e) => e.cls === 'err').textContent, '', 'saved'); return X.sync(cid);
}
// Someone unlisted who holds the key writes a join card naming no link (a joiner from release 91, say): they wait for an admin's Add.
const victim = async (X, cid) => { const m = X.ls.get('hush:cardsOut:' + X.handle, {}); delete m[cid]; X.ls.set('hush:cardsOut:' + X.handle, m); await X.writeCard(await X.sync(cid), 'join', '', ''); };
// The chat list as the page holds it: each channel's readable copy (watchInbox's shown), so the pass and the notice see owner, admins, members, blocks and visibility as the list does.
const listOf = async (X, cids) => { X.S.convs = await Promise.all(cids.map(async (cid) => ({ ...(await X.shown(cid)), id: cid }))); };
// Counts the member-card reads (readRoll's queries) of each channel from here on.
function rollSpy(X) { const real = X.S.db.collection, n = {}; X.S.db.collection = (p) => { const m = p.match(/^channels\/([^/]+)\/roll$/); if (m) n[m[1]] = (n[m[1]] || 0) + 1; return real(p); }; return n; }
const ometas = (X) => X.spy.updates.filter((k) => k.includes('ometa')).length;
const stamps = (X) => X.ls.get('hush:pass:' + X.handle, {});
const hsOf = (X) => X.waitList().map(([cid, x]) => [cid, [...x.hs].sort()]);   // the notice: who waits, by channel

test('117. the notice follows the record, and its Add reads the cards again: someone another admin\'s device listed since, or the owner blocked since, drops out of the count, and so does a channel made public; someone added elsewhere who then left shows until the cards are read again; Add on a stale entry (a leave acted on elsewhere; a block the chat list has not caught up with) adds no one, lifts no block, and clears the entry', async () => {
  await world({}, async (w) => {
    const c1 = w.cid, c2 = otherCid(c1, 0), c3 = otherCid(c1, 1);
    const A = await w.page('alice', { owner: true }), B = await w.page('bob'), D = await w.page('dave'), E = await w.page('eve'), Z = await w.page('zed'), Y = await w.page('yves');
    await makeChannel(A, c1, ['alice', 'bob'], ['bob']); for (const X of [D, E]) { await X.joinPrivate(c1, await linkOf(A, c1)); await victim(X, c1); }
    await makeChannel(A, c2, ['alice', 'bob'], ['bob']); await Z.joinPrivate(c2, await linkOf(A, c2)); await victim(Z, c2);
    await makeChannel(A, c3, ['alice']); await Y.joinPrivate(c3, await linkOf(A, c3)); await victim(Y, c3);
    await listOf(A, [c1, c2, c3]); await A.goLive(A.S.me);
    assert.deepEqual(hsOf(A), [[c1, ['dave', 'eve']], [c2, ['zed']], [c3, ['yves']]], 'the pass noted who waits, by channel');
    // c3 made public: out of the notice (its entry stays stored: a public channel's cards are never read again)
    await A.setVisibility(c3, 'public'); await listOf(A, [c1, c2, c3]);
    assert.deepEqual([A.S.convs[2].visibility, hsOf(A)], ['public', [[c1, ['dave', 'eve']], [c2, ['zed']]]], 'a public channel: out of the notice');
    // Bob's device lists Dave and Eve: out of the count, though this device's entry still names them until it reads the cards again
    await B.sync(c1); await B.addSubs(c1, new Set(['dave', 'eve'])); await listOf(A, [c1, c2, c3]);
    assert.deepEqual([A.ls.get('hush:wait:alice', {})[c1].hs, hsOf(A)], [['dave', 'eve'], [[c2, ['zed']]]], 'listed elsewhere: out of the count, the stored entry as it was');
    // Alice removes and blocks Eve: out of the list and blocked, so still out of the count
    await A.sync(c1); await A.kickMember(c1, 'eve', { ban: true }); await listOf(A, [c1, c2, c3]);
    assert.deepEqual([(await A.meta(c1)).banned, hsOf(A)], [['eve'], [[c2, ['zed']]]], 'blocked: out of the count');
    // Dave leaves and Bob's page acts on it: Dave is in neither list, so this device counts him again until it reads the cards (known limit, SPEC.md 5.6)
    await D.sync(c1); await D.leaveChat(c1); await B.sync(c1); await B.run(c1); await listOf(A, [c1, c2, c3]);
    assert.deepEqual([(await A.meta(c1)).members, hsOf(A)], [['alice', 'bob'], [[c1, ['dave']], [c2, ['zed']]]], 'added elsewhere, then left: counted until the cards are read again');
    // Bob lists Zed, then blocks him; this device's chat list has not caught up (the sheet was open, say), so the notice still offers Zed
    await B.sync(c2); await B.addSubs(c2, new Set(['zed'])); await B.sync(c2); await B.kickMember(c2, 'zed', { ban: true }); await A.sync(c1); await A.sync(c2);
    assert.deepEqual([(await A.meta(c2)).banned, hsOf(A)], [['zed'], [[c1, ['dave']], [c2, ['zed']]]], 'the record blocks Zed; the stale notice still offers him');
    // Add from the notice, Dave and Zed ticked: the cards read again name neither (a leave card replaced Dave's join card; a blocked author never counts), so no one is added, no block is lifted, and both entries clear
    A.spy.els.length = 0; await A.openWaiting(); const els = A.spy.els, boxes = els.filter((e) => e.tag === 'input'), go = els.find((e) => e.tag === 'button');
    assert.deepEqual(boxes.map((b) => b.value), ['dave', 'zed'], 'the sheet offers both');
    for (const b of boxes) { b.checked = true; b.onchange(); } assert.equal(go.textContent, 'Add 2 subscribers');
    A.spy.ban.length = 0; A.spy.inbox.length = 0; A.spy.toasts.length = 0; A.spy.updates.length = 0; await go.onclick();
    assert.deepEqual([(await A.meta(c1)).members, (await A.meta(c1)).banned, (await A.meta(c2)).members, (await A.meta(c2)).banned], [['alice', 'bob'], ['eve'], ['alice', 'bob'], ['zed']], 'the lists as they were: no one added, the blocks kept');
    assert.deepEqual([A.spy.ban, A.spy.inbox, A.spy.updates, A.spy.toasts, A.waitList(), Object.keys(A.ls.get('hush:wait:alice', {}))], [[], [], [], [['No one left to add.']], [], [c3]], 'no block lifted, no note, no write; the notice gone, both entries cleared (the public channel\'s stays stored, hidden)');
  });
});

test('118. a read the server refuses (the connection holds member level only) is a failure: the pass leaves the channel unstamped and its entry as it was, and the next start reads the cards and stamps', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), D = await w.page('dave');
    await makeChannel(A, cid, ['alice']); await D.joinPrivate(cid, await linkOf(A, cid)); await victim(D, cid);
    await listOf(A, [cid]); await A.goLive(A.S.me);
    assert.deepEqual([hsOf(A), !!stamps(A)[cid].at], [[[cid, ['dave']]], true], 'noted and stamped');
    A.ls.set('hush:pass:alice', null);   // a start that has not run it today
    const real = A.S.db.collection, denied = { where: () => denied, orderBy: () => denied, limit: () => denied, get: () => Promise.reject(Object.assign(new Error('denied'), { code: 'denied' })) };
    let n = 0; A.S.db.collection = (p) => { if (/\/roll$/.test(p)) { n++; return denied; } return real(p); };   // the server refuses the cards, as the adapter delivers it
    await A.goLive(A.S.me);
    assert.deepEqual([n, stamps(A), hsOf(A)], [1, {}, [[cid, ['dave']]]], 'refused: not stamped, the entry kept');
    A.S.db.collection = real; const reads = rollSpy(A); await A.goLive(A.S.me);
    assert.deepEqual([reads, !!stamps(A)[cid].at, hsOf(A)], [{ [cid]: 1 }, true, [[cid, ['dave']]]], 'the next start reads the cards and stamps');
  });
});

test('119. two tabs of one account started together: one runs the pass, the other finds the lock held and skips it (the stamps are shared), so a channel whose signed list names no admin secret yet (one from before release 92 the owner saved by hand) gets one admin secret', async () => {
  await world({}, async (w) => {
    const c1 = w.cid, c2 = otherCid(c1, 0), A1 = await w.page('alice', { owner: true }), A2 = await w.page('alice', { owner: true, id: A1.id, store: A1.store });
    for (const cid of [c1, c2]) { await pre92(A1, cid, ['alice', 'bob']); await editSave(A1, cid); }
    await listOf(A1, [c1, c2]); await listOf(A2, [c1, c2]); for (const X of [A1, A2]) { X.spy.admins.length = 0; X.spy.updates.length = 0; }
    const held = new Set(), locks = { request: async (name, o, fn) => { if (held.has(name)) return fn(null); held.add(name); try { return await fn({ name }); } finally { held.delete(name); } } };   // the Web Locks API as a browser has it (ifAvailable), shared by the two tabs
    const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true });
    try { await Promise.all([A1.goLive(A1.S.me), A2.goLive(A2.S.me)]); } finally { Object.defineProperty(globalThis, 'navigator', nav); }
    assert.deepEqual([[A1, A2].map((X) => [X.spy.admins.length, ometas(X)]), held.size], [[[2, 2], [0, 0]], 0], 'one secret and its signed fingerprint per channel, all from the first tab; the lock released');
    assert.deepEqual([c1, c2].map((x) => Object.keys(stamps(A2)[x])), [['at'], ['at']], 'the stamps, shared by both tabs');
  });
});

test('120. a private channel whose current key this device lacks (an admin whose new security code the owner\'s page hasn\'t accepted: her key change wrapped nothing to him) is a failure for the pass: no card read, no stamp, no wait entry; once the key reaches the device the next start reads the cards, notes who waits and stamps; and the notice\'s sheet, opened after a reload within the day, loads the waiting people\'s profiles before drawing them under the channel\'s current name', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), D = await w.page('dave'), E = await w.page('eve');
    await makeChannel(A, cid, ['alice', 'bob', 'eve'], ['bob']); await D.joinPrivate(cid, await linkOf(A, cid)); await victim(D, cid);
    const old = await A.newIdentity(); A.S.pins = { bob: { ecdh: old.ecdh, sig: old.sig } };   // Bob's key as Alice's page pinned it: his new code is not accepted there (keyChanged), so her key change wraps nothing to him
    await A.sync(cid); await A.kickMember(cid, 'eve', { ban: false });
    assert.deepEqual([(await A.sync(cid)).epoch, await B.holds(cid, 1)], [1, false], 'the key changed; Bob\'s device lacks the new one');
    await listOf(B, [cid]);
    assert.deepEqual([B.S.convs[0].admins, (await B.shown(cid))._unlocked], [['bob'], undefined], 'his chat list shows him admin (the owner\'s part opens under the old key); the description does not');
    let reads = rollSpy(B); await B.goLive(B.S.me);
    assert.deepEqual([reads, stamps(B), hsOf(B), B.ls.get('hush:wait:bob', null)], [{}, {}, [], null], 'no key: no card read, not stamped, nothing noted');
    const B2 = await w.reload(B); B2.ksPut(cid, 1, A.ksGet(cid, 1));   // the next start, the key handed on meanwhile (by a page that accepted his code)
    await listOf(B2, [cid]); reads = rollSpy(B2); await B2.goLive(B2.S.me);
    assert.deepEqual([reads, !!stamps(B2)[cid].at, hsOf(B2)], [{ [cid]: 1 }, true, [[cid, ['dave']]]], 'with the key: the cards read, Dave noted waiting, the channel stamped');
    const B3 = await w.reload(B2); await listOf(B3, [cid]); B3.S.convs[0].name = 'History, renamed';   // a reload within the day: its pass reads no card, so nothing has loaded Dave's profile before the sheet asks
    assert.equal(B3.S.dir.dave, undefined, 'Dave\'s profile not loaded yet');
    B3.spy.els.length = 0; await B3.openWaiting(); const els = B3.spy.els, texts = els.map((e) => e.textContent);
    assert.deepEqual([!!B3.S.dir.dave, els.filter((e) => e.tag === 'input').map((b) => b.value), texts.includes('History, renamed'), texts.includes('History')], [true, ['dave'], true, false], 'the sheet loaded his profile first and lists him under the channel\'s current name, not the stored one');
  });
});
