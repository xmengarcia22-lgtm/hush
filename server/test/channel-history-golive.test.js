// Release 92 (page), private channel history, the start's pass and the chat list's notice (SPEC.md 5.6 "The start's pass"): once
// the chat list is live, an owner's or admin's page does for each private channel what opening it does (rollRun), one at a time
// and at most once a day per channel, so no channel needs opening by hand at go-live; it saves no admin list by itself (a channel
// from before release 92 is signed by the owner, Edit then Save: owner decision D1); and everyone waiting to join shows in one notice
// whose sheet adds the ticked as Add subscribers does. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { b64u, offline, world, makeChannel, linkOf } from './channel-history-kit.js';

// Helpers shared with the other channel-history files, copied as the removal tests do.
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const otherCid = (cid, n) => cid.slice(0, -1) + 'xyzw'[n];
const fp = (S, cid) => b64u(Buffer.from(hkdfSync('sha256', Buffer.from(S), 'hush-admin-id-v1', cid, 32)));   // `ah` as SPEC.md 5.6 has it
async function bareMeta(e, raw, x, ad) {   // an ometa as a page from before release 92 sealed it (no rs)
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(ad) }, key, Buffer.from(JSON.stringify(x)))).toString('base64') };
}
async function plainOf(X, cid, m) {   // the plaintext of a channel's ometa, opened with the key X holds for its epoch
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}
// A private channel as a page from before release 92 left it: its ometa unsigned, naming no admin secret; the owner has yet to sign it by hand.
async function pre92(A, cid, members, admins = []) {
  await makeChannel(A, cid, members, admins);
  await A.S.db.doc('channels/' + cid).update({ ometa: await bareMeta(0, keyOf(A, cid, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins }, 'hush-ometa-v1|' + cid) });
  return A.sync(cid);
}
// Save pressed in the owner's Edit sheet (openEditConv) with the name as it is: the record's list signed at a fresh rt (owner decision D1's manual step).
async function editSave(X, cid, name = 'History') {
  X.S.convs = [{ ...(await X.showMeta(await X.sync(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); assert.equal(at((e) => e.cls === 'err').textContent, '', 'saved'); return X.sync(cid);
}
const roles = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); return X.rolesOf(cid) || {}; };
// Someone unlisted who holds the key writes a join card naming no link (a joiner from release 91, say): they wait for an admin's Add.
const victim = async (X, cid) => { const m = X.ls.get('hush:cardsOut:' + X.handle, {}); delete m[cid]; X.ls.set('hush:cardsOut:' + X.handle, m); await X.writeCard(await X.sync(cid), 'join', '', ''); };
// The chat list as the page holds it: each channel's readable copy (watchInbox's shown), so the pass sees owner, admins and name as the list does.
const listOf = async (X, cids) => { X.S.convs = await Promise.all(cids.map(async (cid) => ({ ...(await X.shown(cid)), id: cid }))); };
// Counts the member-card reads (readRoll's queries) of each channel from here on, and makes one channel's fail (offline).
function rollSpy(X, failCid) { const real = X.S.db.collection, n = {}; X.S.db.collection = (p) => { const m = p.match(/^channels\/([^/]+)\/roll$/); if (m) { n[m[1]] = (n[m[1]] || 0) + 1; if (m[1] === failCid) throw offline(); } return real(p); }; return n; }
const ometas = (X) => X.spy.updates.filter((k) => k.includes('ometa')).length;
const stamps = (X) => X.ls.get('hush:pass:' + X.handle, {});

test('112. the start\'s pass: an owner with four private channels, none opened, gets each handled once the chat list is live: a channel from before release 92 the owner hasn\'t signed gets no admin secret, no re-seal, no `as` and no save (its record unsigned: owner decision D1), though whoever waits in it is noted; a release-91 joiner waiting shows in the chat list\'s notice, and Add from its sheet lists them with the key and sends their note again while the rest keep waiting; a channel with nothing pending gets no write; a channel from before release 92 the owner saved by hand gets its admin secret, the fingerprint signed at her record\'s rt, and the old link it shows gains `as` under it; every channel is stamped and the calls stay bounded', async () => {
  await world({}, async (w) => {
    const c1 = w.cid, c2 = otherCid(c1, 0), c3 = otherCid(c1, 1), c4 = otherCid(c1, 2);
    const A = await w.page('alice', { owner: true }), B = await w.page('bob'), M = await w.page('mona'), D = await w.page('dave'), Z = await w.page('zed');
    // c1: from before release 92, not signed by the owner, with a link this device made then (no `as`); Zed holds the key from elsewhere and waits
    const m1 = (await pre92(A, c1, ['alice', 'mona'])).ometa, l1 = await linkOf(A, c1); let c = await A.sync(c1);
    assert.equal(c.invites[l1.iid].as, undefined, 'a link from before release 92 has no `as`');
    Z.ksPut(c1, 0, A.ksGet(c1, 0)); await victim(Z, c1);
    assert.deepEqual([(await roles(A, c1)).s, (await roles(M, c1)).s], [0, 0], 'unsigned, on the owner\'s device and a member\'s');
    // c2: made by release 92; Dave joined by link, but his card names none (a release-91 page), so he waits
    await makeChannel(A, c2, ['alice', 'bob']); await D.joinPrivate(c2, await linkOf(A, c2)); await victim(D, c2);
    // c3: nothing pending
    await makeChannel(A, c3, ['alice', 'bob']);
    // c4: from before release 92, with a link from then, signed by the owner by hand (Edit, then Save): a signed record naming no admin secret yet
    await pre92(A, c4, ['alice', 'bob']); const l4 = await linkOf(A, c4); await editSave(A, c4);
    const ak4 = JSON.stringify((await A.sync(c4)).akeys), o4 = await plainOf(A, c4, (await A.sync(c4)).ometa);
    assert.deepEqual([o4.rt > 1, 'ah' in o4, (await roles(A, c4)).s, (await roles(B, c4)).t, (await A.sync(c4)).invites[l4.iid].as], [true, false, 1, o4.rt, undefined], 'signed at a fresh rt, no fingerprint; Bob\'s record takes it; the link has no `as`');

    await listOf(A, [c1, c2, c3, c4]);
    const reads = rollSpy(A); A.spy.updates.length = 0; A.spy.admins.length = 0; A.spy.rotate.length = 0; A.spy.card.length = 0;
    await A.goLive(A.S.me);
    const st = stamps(A);
    assert.deepEqual([c1, c2, c3, c4].map((x) => [!!(st[x] && st[x].at > Date.now() - 60e3), Object.keys(st[x] || {})]), [[true, ['at']], [true, ['at']], [true, ['at']], [true, ['at']]], 'each stamped, with the time alone');
    // c1
    c = await A.sync(c1);
    assert.deepEqual([c.ometa.iv, c.invites[l1.iid].as, (await roles(A, c1)).s, (await roles(M, c1)).s], [m1.iv, undefined, 0, 0], 'the unsigned channel: no re-seal, no `as`, still unsigned everywhere');
    // c4
    c = await A.sync(c4); const p4 = await plainOf(A, c4, c.ometa), s4 = keyOf(A, c4, 'a');
    assert.deepEqual([A.spy.admins, JSON.stringify(c.akeys) === ak4, p4.ah, p4.rt, p4.admins, (await roles(B, c4)).h], [[c4], false, fp(s4, c4), o4.rt, [], fp(s4, c4)], 'a fresh admin secret, its fingerprint signed at the record\'s rt; Bob\'s record takes the fingerprint');
    assert.equal(b64u(await A.openAs(s4, c4, l4.iid, c.invites[l4.iid].as)), l4.secret, 'the old link\'s `as` under the signed secret');
    // c2, c3 and the notice
    assert.deepEqual([A.waitList(), (await A.meta(c2)).members, (await A.meta(c3)).members], [[[c1, { n: 'History', hs: ['zed'] }], [c2, { n: 'History', hs: ['dave'] }]], ['alice', 'bob'], ['alice', 'bob']], 'the notice lists who waits, by channel, the unsigned channel\'s included; nobody was added by itself');
    assert.deepEqual([ometas(A), A.spy.rotate.length, A.spy.card.length, reads], [1, 0, 0, { [c1]: 1, [c2]: 1, [c3]: 1, [c4]: 1 }], 'bounded: c4\'s fingerprint alone; one card read per channel; no key change, no card');
    A.spy.els.length = 0; await A.openWaiting(); const els = A.spy.els, boxes = els.filter((e) => e.tag === 'input'), texts = els.map((e) => e.textContent);
    assert.deepEqual(boxes.map((b) => [b.value, !!b.checked]), [['zed', false], ['dave', false]], 'the sheet: everyone waiting, unticked');
    assert.ok(texts.indexOf('History') < texts.indexOf('zed') && texts.indexOf('zed') < texts.lastIndexOf('History') && texts.lastIndexOf('History') < texts.indexOf('dave') && texts.includes('@dave'), 'grouped by channel, with the @username: ' + JSON.stringify(texts));
    const go = els.find((e) => e.tag === 'button'); assert.ok(go.disabled, 'Add waits for a tick');
    const b = boxes.find((x) => x.value === 'dave'); b.checked = true; b.onchange(); assert.equal(go.textContent, 'Add 1 subscriber');
    A.spy.inbox.length = 0; A.spy.toasts.length = 0; await go.onclick();
    assert.deepEqual([(await A.meta(c2)).members, A.spy.updates.at(-1), A.spy.inbox, A.waitList(), A.spy.toasts], [['alice', 'bob', 'dave'], ['keys', 'meta'], [[c2, ['dave'], true]], [[c1, { n: 'History', hs: ['zed'] }]], [['Subscriber added']]], 'Dave listed, the key wrapped for him and his note sent again; Zed keeps waiting');
    assert.ok(!(await D.shown(c2))._unlisted, 'Dave reads himself listed');
  });
});

test('113. the pass runs a channel at most once a day: a second start reads no card and writes nothing, a stamp older than a day is run again, and the channel open on screen is left to its own open', async () => {
  await world({}, async (w) => {
    const c1 = w.cid, c2 = otherCid(c1, 0), A = await w.page('alice', { owner: true }), D = await w.page('dave');
    await makeChannel(A, c1, ['alice', 'bob']); await D.joinPrivate(c1, await linkOf(A, c1)); await victim(D, c1);
    const m2 = (await pre92(A, c2, ['alice', 'bob'])).ometa;
    await listOf(A, [c1, c2]); const reads = rollSpy(A);
    await A.goLive(A.S.me);
    const st1 = stamps(A);
    assert.deepEqual([reads, A.waitList().map((x) => x[0]), (await A.sync(c2)).ometa.iv, Object.keys(st1[c2])], [{ [c1]: 1, [c2]: 1 }, [c1], m2.iv, ['at']], 'the first pass: the unsigned channel read, nothing written for it');
    A.spy.updates.length = 0; A.spy.admins.length = 0;
    await A.goLive(A.S.me);
    assert.deepEqual([reads, A.spy.updates, A.spy.admins, stamps(A)], [{ [c1]: 1, [c2]: 1 }, [], [], st1], 'the second pass, within the day: nothing read, nothing written, the stamps as they were');
    const m = stamps(A); m[c1].at -= 25 * 3600e3; A.ls.set('hush:pass:alice', m);
    await A.goLive(A.S.me);
    assert.deepEqual([reads, stamps(A)[c1].at > st1[c1].at, stamps(A)[c2]], [{ [c1]: 2, [c2]: 1 }, true, st1[c2]], 'a stamp older than a day: run again and stamped anew; the other left alone');
    delete m[c1]; A.ls.set('hush:pass:alice', m); A.S.chan = c1;
    await A.goLive(A.S.me);
    assert.deepEqual([reads[c1], stamps(A)[c1]], [2, undefined], 'the channel on screen: left to its own open, not stamped');
  });
});

test('114. the pass saves no admin list by itself (owner decision D1): on an unsigned record (a channel from before release 92) the owner\'s pass makes no admin secret and seals nothing, and so does an admin\'s, whose pass still acts on the cards (his link, with no `as`, leaves its joiner waiting); after the owner\'s Edit then Save her next start makes the admin secret for the signed list, at its rt, and his page takes the fingerprint', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), D = await w.page('dave');
    const m0 = (await pre92(A, cid, ['alice', 'bob'], ['bob'])).ometa;
    assert.deepEqual([(await roles(A, cid)).s, (await roles(B, cid)).s], [0, 0], 'unsigned on both devices');
    // Bob, an admin: his link has no `as` (his record is unsigned), so Dave, who joins by it, waits; Bob's pass acts on the cards and writes nothing
    const lb = await linkOf(B, cid); assert.equal((await B.sync(cid)).invites[lb.iid].as, undefined, 'a link with no `as`');
    await D.joinPrivate(cid, lb);
    await listOf(B, [cid]); B.spy.updates.length = 0; B.spy.admins.length = 0;
    await B.goLive(B.S.me);
    assert.deepEqual([B.waitList(), ometas(B), B.spy.admins, Object.keys(stamps(B)[cid])], [[[cid, { n: 'History', hs: ['dave'] }]], 0, [], ['at']], 'an admin\'s device: the cards acted on, nothing written');
    await listOf(A, [cid]); A.spy.updates.length = 0; A.spy.admins.length = 0;
    await A.goLive(A.S.me);
    assert.deepEqual([ometas(A), A.spy.admins, (await A.sync(cid)).ometa.iv, (await roles(A, cid)).s, Object.keys(stamps(A)[cid]), A.waitList()], [0, [], m0.iv, 0, ['at'], [[cid, { n: 'History', hs: ['dave'] }]]], 'the owner\'s device: nothing written either, the record still unsigned; Dave noted');
    await editSave(A, cid);
    const o = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([o.rt > 1, o.admins, 'ah' in o, (await roles(B, cid)).t, (await roles(B, cid)).h], [true, ['bob'], false, o.rt, undefined], 'the list signed at a fresh rt, naming no secret, taken by Bob');
    A.ls.set('hush:pass:alice', null); await listOf(A, [cid]); A.spy.updates.length = 0;   // the next start
    await A.goLive(A.S.me);
    const p = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([A.spy.admins, ometas(A), p.ah, p.rt, p.admins, (await roles(B, cid)).h], [[cid], 1, fp(keyOf(A, cid, 'a'), cid), o.rt, ['bob'], p.ah], 'the next start makes the admin secret for the signed list, its fingerprint signed at the record\'s rt; Bob\'s page takes it');
  });
});

test('115. the pass stops when the account changes or logs out: a channel whose cards were being read notes and writes nothing more and is not stamped, under either account; one whose key change was under way goes through but is not stamped; the next channel is never read', async () => {
  await world({}, async (w) => {
    const c1 = w.cid, c2 = otherCid(c1, 0), c3 = otherCid(c1, 1), c4 = otherCid(c1, 2), A = await w.page('alice', { owner: true }), D = await w.page('dave'), E = await w.page('eve'), M = await w.page('mona');
    await makeChannel(A, c1, ['alice']); await D.joinPrivate(c1, await linkOf(A, c1)); await victim(D, c1);
    await makeChannel(A, c2, ['alice']); await E.joinPrivate(c2, await linkOf(A, c2)); await victim(E, c2);
    await listOf(A, [c1, c2]); const me = A.S.me; let reads = rollSpy(A);
    const doc = A.S.db.doc; A.S.db.doc = (p) => { if (p === 'directory/dave') A.S.me = { ...me, handle: 'bob' }; return doc(p); };   // another account in while c1's cards are read: at the directory read for their signatures, the cards already open, so Dave would be noted waiting under Bob
    await A.goLive(me);
    assert.deepEqual([reads, ['alice', 'bob'].map((h) => [A.ls.get('hush:wait:' + h, null), A.ls.get('hush:pass:' + h, null)])], [{ [c1]: 1 }, [[null, null], [null, null]]], 'c1 read, then nothing noted or stamped under either account; c2 never read');
    // logged out and in again while c3's key change (Mona's leave) is under way: the leave goes through, the channel is not stamped, and c4 is never read
    A.S.me = me; A.S.db.doc = doc; reads = rollSpy(A);
    await makeChannel(A, c3, ['alice', 'mona']); await listOf(M, [c3]); await M.leaveChat(c3); await makeChannel(A, c4, ['alice']); await listOf(A, [c3, c4]);   // Mona's page lists the channel (leaveChat finds it there) and leaves: a leave card
    const rot = A.S.db.rotateChat; A.S.db.rotateChat = (...a) => { A.S.me = { ...me }; return rot(...a); };
    await A.goLive(me);
    assert.deepEqual([reads, A.spy.rotate.length, (await A.meta(c3)).members, stamps(A)], [{ [c3]: 1 }, 1, ['alice'], {}], 'the leave applied; c3 not stamped; c4 never read');
  });
});

test('116. a failure on one channel leaves only its stamp unset and moves on: the others are run and stamped, and the next start tries the failed one again, once', async () => {
  await world({}, async (w) => {
    const c1 = w.cid, c2 = otherCid(c1, 0), c3 = otherCid(c1, 1), A = await w.page('alice', { owner: true }), D = await w.page('dave');
    for (const x of [c1, c2, c3]) await makeChannel(A, x, ['alice']);
    await D.joinPrivate(c2, await linkOf(A, c2)); await victim(D, c2);
    await listOf(A, [c1, c2, c3]); const col = A.S.db.collection; let reads = rollSpy(A, c1);   // c1's cards can't be read (offline)
    await A.goLive(A.S.me);
    assert.deepEqual([reads, Object.keys(stamps(A)).sort(), A.waitList().map((x) => x[0])], [{ [c1]: 1, [c2]: 1, [c3]: 1 }, [c2, c3].sort(), [c2]], 'c1 failed and is not stamped; c2 and c3 were run');
    A.S.db.collection = col; reads = rollSpy(A);   // the next start, the server back
    await A.goLive(A.S.me);
    assert.deepEqual([reads, Object.keys(stamps(A)).sort()], [{ [c1]: 1 }, [c1, c2, c3].sort()], 'c1 alone is tried again, once');
  });
});

test('149. the notice\'s Add tells apart the people already added (release 93b, item 3): two channels ticked; a failure before anyone is added keeps every box ticked and enabled and the line as it was; with the first channel\'s Add through and the second\'s cards unreadable, the sheet unticks and disables the first channel\'s boxes, says how many were added and to check the connection, and the button counts the rest; the next press reads only the second channel\'s cards and adds its people, so nobody is added twice or sent a second note and nothing is sealed again for the channel already done', async () => {
  await world({}, async (w) => {
    const c1 = w.cid, c2 = otherCid(c1, 0), A = await w.page('alice', { owner: true }), D = await w.page('dave'), Z = await w.page('zed');
    for (const x of [c1, c2]) await makeChannel(A, x, ['alice']);
    await D.joinPrivate(c1, await linkOf(A, c1)); await victim(D, c1); await Z.joinPrivate(c2, await linkOf(A, c2)); await victim(Z, c2);
    await listOf(A, [c1, c2]); await A.goLive(A.S.me);
    assert.deepEqual(A.waitList().map(([cid, x]) => [cid, x.hs]), [[c1, ['dave']], [c2, ['zed']]], 'Dave waits in the first channel, Zed in the second');
    A.spy.els.length = 0; await A.openWaiting(); const els = A.spy.els, boxes = els.filter((e) => e.tag === 'input'), go = els.find((e) => e.tag === 'button'), err = els.find((e) => e.cls === 'err');
    for (const b of boxes) { b.checked = true; b.onchange(); } assert.equal(go.textContent, 'Add 2 subscribers');
    const col = A.S.db.collection, state = () => [boxes.map((b) => [b.value, !!b.checked, !!b.disabled]), err.textContent, go.disabled, go.textContent];
    const press = async (failCid) => { A.S.db.collection = col; const reads = rollSpy(A, failCid); A.spy.inbox.length = 0; A.spy.toasts.length = 0; A.spy.updates.length = 0; await go.onclick(); return reads; };   // one press, with one channel's cards unreadable (offline), or none
    // the first channel's cards can't be read: nothing added, every box as it was, the old line
    let reads = await press(c1);
    assert.deepEqual([reads, (await A.meta(c1)).members, (await A.meta(c2)).members, A.spy.inbox, A.spy.updates, A.spy.toasts], [{ [c1]: 1 }, ['alice'], ['alice'], [], [], []], 'the first channel failed before anyone was added');
    assert.deepEqual(state(), [[['dave', true, false], ['zed', true, false]], 'Couldn’t add them. Check your connection and try again.', false, 'Add 2 subscribers'], 'both still ticked and enabled; no count to give');
    // the first channel's Add goes through, the second's cards can't be read
    reads = await press(c2);
    assert.deepEqual([reads, (await A.meta(c1)).members, (await A.meta(c2)).members, A.spy.inbox, A.spy.updates, A.spy.toasts, A.waitList().map((x) => x[0])], [{ [c1]: 1, [c2]: 1 }, ['alice', 'dave'], ['alice'], [[c1, ['dave'], true]], [['keys', 'meta']], [], [c2]], 'Dave added, with his note; Zed not, still waiting');
    assert.deepEqual(state(), [[['dave', false, true], ['zed', true, false]], '1 subscriber added. Couldn’t add the rest. Check your connection and try again.', false, 'Add 1 subscriber'], 'Dave\'s box unticked and disabled, Zed\'s ticked; the line says how many were added; the button counts Zed alone');
    // the server back: the second channel alone is read, Zed added once, Dave not again
    reads = await press(null);
    assert.deepEqual([reads, (await A.meta(c1)).members, (await A.meta(c2)).members, A.spy.inbox, A.spy.updates, A.spy.toasts, A.waitList()], [{ [c2]: 1 }, ['alice', 'dave'], ['alice', 'zed'], [[c2, ['zed'], true]], [['keys', 'meta']], [['Subscriber added']], []], 'only the second channel\'s cards read; Zed added with one note; nothing sealed again for Dave\'s channel; the notice gone');
    assert.ok(!(await D.shown(c1))._unlisted && !(await Z.shown(c2))._unlisted, 'both read themselves listed');
  });
});
