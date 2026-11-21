// Release 92 (page), private channel history, a device removal's channels (SPEC.md 14.15, 5.6 "Member cards"): rekeyChat and
// rekeyRun's rotate stage on the remover's page (a subscriber's dev card, a non-owner admin's key change and adm card, the
// owner key and admin secret replaced whatever the key change did, links stopped after a failed one, no epoch cap in a
// channel, the summary), and the admins' pages acting on those cards (an adm card waiting on an owner's page that hasn't
// accepted its author's new security code), and the chat watch of a subscriber those pages left out (a new security code not
// accepted there: the channel waits, for 30 days from the first time it finds it locked, and comes back once an admin's page
// accepts it). The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { b64u, offline, world, makeChannel, linkOf, lift, mkBuild, pageFor } from './channel-history-kit.js';
import { sleep } from './helpers.js';

const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const badkey = (e) => !!e && e.message === 'badkey';
const packet = (X, j) => X.inviteRaws(j.cid, j);   // what a link hands out, as a page about to join reads it
const notfound = (e) => !!e && e.code === 'notfound';

// A device removal on X's page from its rotate stage on (rekeyRun resumed there), with the chats as its read stage lists them;
// it is stopped at the next stage (the vault), which these tests don't need. `rec.rotated` is what each chat came to.
async function removal(X, chats) {
  const rec = { stage: 'rotate', name: 'Old phone', rotated: [], chats: chats.map((x) => ({ type: 'channel', vis: 'private', owner: false, admin: false, admins: [], members: [], name: 'History', unlocked: true, ...x })) }, fails = [];
  const ui = { step: (t) => { if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} };
  X.S.contactsReady = true; X.S.vaultOk = true;
  await X.rekeyRun(rec, ui);
  assert.deepEqual(fails, ['Removing the device stopped (stop). Close Hush and open it again to finish it.'], 'the rotate stage ran to its end');
  assert.equal(X.S.rekeying, true); X.S.rekeying = false;
  return rec;
}
// The account's new keys as the removal's keys, write and mirror stages leave them: published at kv+1 over the old key's proof,
// this connection signed in again with the new one, and the caches the old keys filled dropped (rekeyCaches).
async function newKeys(X) {
  await X.rekeyIdentity(X.S.me); X.S.keys.clear(); X.S.chanKeys.clear();
  await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() });
  const sk = await crypto.subtle.importKey('jwk', X.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await X.S.db.prove(null);
  await X.S.db.prove({ h: X.handle, pub: X.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  await X.loadDir([X.handle], true);
}
const summary = (X, rec) => { X.spy.els.length = 0; X.rekeySummary(rec); return X.spy.els.map((e) => e.textContent).filter(Boolean); };
const newCid = (p = 'c') => p + randomBytes(6).toString('hex');

test('23. a device removal (rekeyChat): the owner\'s channel at epoch 40, chained under her replaced key, changes key; the owner key and admin secret are replaced also where the key change failed, and that channel\'s open links stop, also when the first try to stop them is lost; a subscriber writes a dev card from a fresh record; a non-owner admin changes the key and writes an adm card, also where the key change failed; the summary says whose device acts next, and names an owner key not replaced on its own', async () => {
  await world({ limits: { framesPerMin: 1000, queriesPerMin: 1000 } }, async (w) => {   // forty key changes in a few seconds pass one connection's frames and queries a minute (each key change reads the cards first, and from release 93b a refused read fails it rather than passing with no card)
    const { cid } = w, c3 = newCid(), c4 = newCid(), c5 = newCid(), c6 = newCid(), g = newCid('g');
    const A = await w.page('alice', { owner: true }), O = await w.page('olga', { owner: true });
    const [B, X, J] = [await w.page('bob'), await w.page('xena'), await w.page('june')]; await w.page('carol'); await w.page('yuri');
    await makeChannel(A, cid, ['alice', 'bob', 'carol']);
    const v = A.metaOf(await A.shown(cid));
    for (let i = 0; i < 40; i++) await A.rotateTo(A.S.chatDocs.get(cid), v);   // past a group's epoch 31, every row signed by Alice's key of today
    const l1 = await linkOf(A, cid);
    await makeChannel(A, c3, ['alice', 'bob']); const l3 = await linkOf(A, c3), a3 = A.ksGet(c3, 'a');
    await makeChannel(A, c5, ['alice', 'bob']);
    await makeChannel(A, g, ['alice', 'bob'], [], 'group');
    await makeChannel(O, c4, ['olga', 'xena', 'yuri'], ['xena', 'yuri']); const l4 = await linkOf(O, c4);
    await makeChannel(O, c6, ['olga', 'xena'], ['xena']); const l6 = await linkOf(O, c6);

    // Alice removes a device: new account keys first, then her chats. Another admin's key change answers the first try at
    // epoch 40 (conflict), the second channel's key change is refused for good and the first try to stop its links meets a
    // dropped connection, and the third one's owner key change meets a dropped connection (tried again after a pause) and
    // then a time-out (no answer: the step is not sent again).
    await newKeys(A);
    const owned = [], so = A.S.db.setOwner, n = A.spy.rotate.length, failOwn = { [c5]: ['offline', 'timeout'] };
    A.S.db.setOwner = async (c, cap) => { owned.push(c); const f = (failOwn[c] || []).shift(); if (f) throw Object.assign(new Error(f), { code: f }); return so(c, cap); };
    A.spy.failRotate = ['conflict', null, 'toolarge'];
    const dd = A.S.db.doc; let wipeFails = 1;
    A.S.db.doc = (p) => { const d = dd(p), u = d.update; d.update = (x) => (x && x.invites === null && wipeFails-- > 0 ? Promise.reject(offline()) : u(x)); return d; };
    const ra = await removal(A, [{ cid, owner: true, members: ['alice', 'bob', 'carol'] }, { cid: c3, owner: true, members: ['alice', 'bob'], name: 'Side' }, { cid: c5, owner: true, members: ['alice', 'bob'], name: 'Spare' }]);
    A.S.db.doc = dd;
    assert.equal(wipeFails, -1, 'the links of the failed one: the first stop lost, the owner\'s own step stopped them');
    assert.deepEqual(ra.rotated, [{ cid, ok: true }, { cid: c3, skip: 'error', msg: 'toolarge' }, { cid: c5, ok: true, own: 'error' }]);
    assert.deepEqual([A.spy.rotate.length - n, (await A.sync(cid)).epoch, (await A.sync(c5)).epoch], [4, 41, 1], 'a channel at epoch 40 is tried again from the fresh record, never skipped');
    A.S.chanKeys.clear();
    assert.ok(await A.sealKey(await A.sync(cid), 41), 'its new commit, signed by her new key');
    await assert.rejects(A.sealKey({ ...(await A.sync(cid)), epoch: 40 }, 40), (e) => !!e && e.message === 'rollback', 'the record of the epoch before is below the mark her removal\'s key change raised (release 93b, the epoch-rollback guard)');
    A.ls.set('hush:roles:alice', { ...A.ls.get('hush:roles:alice', {}), [cid]: { ...A.rolesOf(cid), hi: undefined } });   // the mark put aside (never the key check's cache), so the check below reaches the commit
    await assert.rejects(A.sealKey({ ...(await A.sync(cid)), epoch: 40 }, 40), badkey, 'the one before, signed by the key she replaced, counted only while the removal ran');
    assert.deepEqual([owned, A.spy.admins], [[cid, c3, c5, c5], [cid, c3]], 'the owner key and the admin secret replaced in the first two, the channel whose key change failed too; the third\'s owner key tried twice, and no admin secret after its time-out');
    assert.deepEqual(A.spy.card, [], 'the owner writes no card: her own page replaced the admin secret');
    assert.notEqual(A.ksGet(c3, 'a'), a3);
    assert.ok(sameKey(await A.adminSecret(await A.sync(c3)), A.unb64(A.ksGet(c3, 'a'))), 'wrapped to her new key');
    assert.equal((await A.sync(c3)).epoch, 0);
    for (const [c, l] of [[cid, l1], [c3, l3]]) { assert.deepEqual(Object.keys((await A.sync(c)).invites || {}), [], 'no open link left'); await assert.rejects(packet(J, l), notfound); }
    const ta = summary(A, ra);
    assert.ok(ta.includes('1 chat is secured.') && ta.includes('Couldn’t secure these chats: Side. The removed device may still read new messages there. Don’t write anything private in them; start new chats if you need to.'), JSON.stringify(ta));
    assert.ok(ta.includes('Couldn’t secure these chats: Spare. A device you removed may still have control there. Don’t use them any more. Start new chats with the same people.'), 'a chat whose key changed but whose owner key didn\'t is named for that alone');

    // Bob, a subscriber, removes a device: a dev card in the channel, nothing in the group. An admin's key change after his
    // page last read the channel leaves its copy one key behind, and that key no longer opens the chat (capsFor opens it from
    // the copy): the card goes out from a fresh one.
    await B.sync(cid); await B.sync(g);
    const pv = B.S.db.preview; B.S.db.preview = async (c) => (B.S.chatDocs.has(c) ? { exists: true, data: () => B.S.chatDocs.get(c) } : pv(c));
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    const rb = await removal(B, [{ cid, members: ['alice', 'bob', 'carol'] }, { cid: g, type: 'group', members: ['alice', 'bob'], name: 'Club' }]);
    assert.deepEqual(rb.rotated, [{ cid, card: 'dev' }, { cid: g, skip: 'member' }]);
    assert.deepEqual([B.spy.card, B.spy.rotate], [[cid], []], 'one card, in the channel; no key change');
    assert.deepEqual([B.ls.get('hush:cardsOut:bob', {})[cid].k, B.ls.get('hush:cardsOut:bob', {})[cid].e], ['dev', 42], 'noted, so a start writes it again until the key changes');
    assert.ok((await A.cards(cid)).includes('bob:dev'));
    const tb = summary(B, rb);
    assert.ok(tb.includes('Ask an admin of these channels to open the channel: History. If they see you under Waiting to join, they add you, then open the channel once more. That shuts the removed device out. Until an admin has accepted your new security code, new posts there may not show for you either. If that lasts more than 30 days, ask for a new invite link.'), JSON.stringify(tb));
    assert.ok(tb.includes('The removed device can still read new messages in these groups: Club. Ask an admin there to accept your new security code, then block you, unblock you and add you again. That shuts it out.'));

    // Xena, an admin but not the owner, removes a device: a key change with no link carried, then an adm card; in the second
    // channel the key change is refused for good, and the card goes out all the same (the lost device holds its admin key too).
    await X.sync(c4); await X.sync(c6); X.spy.failRotate = [null, 'toolarge'];
    const rx = await removal(X, [{ cid: c4, admin: true, admins: ['xena', 'yuri'], members: ['olga', 'xena', 'yuri'], name: 'Team' }, { cid: c6, admin: true, admins: ['xena'], members: ['olga', 'xena'], name: 'Crew' }]);
    assert.deepEqual(rx.rotated, [{ cid: c4, ok: true, card: 'adm' }, { cid: c6, skip: 'error', msg: 'toolarge', card: 'adm' }]);
    assert.deepEqual([X.spy.rotate.length, 'invites' in X.spy.rotate[0], (await X.sync(c4)).epoch, (await X.sync(c6)).epoch], [2, false, 1, 0]);
    await assert.rejects(packet(J, l4), notfound); await assert.rejects(packet(J, l6), notfound);
    assert.deepEqual([X.spy.card, X.spy.admins], [[c4, c6], []], 'an adm card in each, and never chat.admins: only the owner replaces the admin secret');
    for (const c of [c4, c6]) { assert.equal(X.ls.get('hush:cardsOut:xena', {})[c].k, 'adm'); assert.ok((await O.cards(c)).includes('xena:adm')); }
    const tx = summary(X, rx);
    assert.ok(tx.includes('The removed device can still act as an admin of Team, Crew until the owner next opens Hush and has accepted your new security code. If it’s an older channel, the owner first taps Edit, then Save. Then it is shut out. If the removed device is in the wrong hands, tell the owner now.') && tx.includes('Couldn’t secure these chats: Crew. The removed device may still read new messages there. Don’t write anything private in them; start new chats if you need to.'), JSON.stringify(tx));

    // The wording where no card was written (a group, or a channel taken first): its admin key waits for the owner.
    const tw = summary(A, { name: 'Old phone', chats: [{ cid: 'g1', type: 'group', vis: 'private', admin: true, name: 'Club' }, { cid: 'c9', type: 'channel', vis: 'private', admin: true, name: 'Lost' }], rotated: [{ cid: 'g1', ok: true }, { cid: 'c9', skip: 'taken' }] });
    assert.ok(tw.includes('The removed device can still act as an admin of Club, Lost. Ask the owner to accept your new security code, then remove you as an admin and make you one again.'), JSON.stringify(tw));
    assert.ok(!tw.some((t) => /next opens|You had left|next time you open/.test(t)), 'no card asks the owner');
  });
});

test('24. the cards a removal leaves, on the admins\' pages: a dev card makes one leave key change with no link and no joiner, also one written while another admin\'s carrying key change was in flight (one epoch back by then); an adm card makes the owner\'s page replace the admin secret and stop every open link, a non-owner admin\'s page neither; on an owner\'s page that hasn\'t accepted the author\'s new security code the card waits, whoever signed the head, so the new secret reaches them', async () => {
  await world({}, async (w) => {
    const { cid } = w, c4 = newCid();
    const A = await w.page('alice', { owner: true }), O = await w.page('olga', { owner: true });
    const [Y, B, F, J, X] = [await w.page('yuri'), await w.page('bob'), await w.page('fay'), await w.page('june'), await w.page('xena')];
    await makeChannel(A, cid, ['alice', 'yuri', 'bob', 'fay'], ['yuri']);
    const l1 = await linkOf(A, cid);
    await leave(F, cid);
    // Yuri's page acts on Fay's leave; Bob's removal writes its card after that page read the cards, before its key change landed.
    await B.sync(cid); let rb; const rc = Y.S.db.rotateChat;
    Y.S.db.rotateChat = async (...a) => { Y.S.db.rotateChat = rc; rb = await removal(B, [{ cid, members: ['alice', 'yuri', 'bob', 'fay'] }]); return rc(...a); };
    await Y.run(cid);
    assert.deepEqual(rb.rotated, [{ cid, card: 'dev' }]);
    assert.deepEqual([Y.spy.rotate.length, Y.spy.rotate[0].why, Object.keys(Y.spy.rotate[0].invites || {})], [1, 'leave', [l1.iid]], 'a leave alone: the link is carried');
    assert.equal((await A.sync(cid)).epoch, 1);
    await J.joinPrivate(cid, l1);                               // a joiner by the carried link, waiting at the current epoch
    A.kv.bob = 2;                                               // Bob's account key changed, as a removal changes it
    await A.run(cid);
    assert.deepEqual([A.spy.rotate.length, A.spy.rotate[0].why, 'invites' in A.spy.rotate[0], (await A.sync(cid)).epoch], [1, 'leave', false, 2], 'his card, one epoch back, makes one key change, with no link');
    await assert.rejects(packet(X, l1), notfound);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'yuri', 'bob'], 'and no joiner');
    assert.equal(await B.holds(cid, 2), true, 'Bob keeps the channel');
    assert.equal(await J.holds(cid, 2), false);
    assert.deepEqual(A.rolesOf(cid).dk, { bob: 2 });
    assert.deepEqual(await A.cards(cid), ['june:join'], 'the dev card is deleted');
    await A.run(cid); await Y.run(cid);
    assert.deepEqual([A.spy.rotate.length, Y.spy.rotate.length], [1, 1], 'once');

    await makeChannel(O, c4, ['olga', 'xena', 'yuri'], ['xena', 'yuri']);
    await X.sync(c4);
    await removal(X, [{ cid: c4, admin: true, admins: ['xena', 'yuri'], members: ['olga', 'xena', 'yuri'], name: 'Team' }]);
    const l4 = await linkOf(Y, c4), a0 = O.ksGet(c4, 'a');     // a link the other admin made after the removal's key change
    await Y.run(c4);
    assert.deepEqual([Y.spy.admins, Object.keys((await Y.sync(c4)).invites || {})], [[], [l4.iid]], 'a non-owner admin\'s page replaces no admin secret and stops no link');
    assert.ok((await O.cards(c4)).includes('xena:adm'), 'and leaves the card');
    await O.run(c4);
    assert.equal(O.spy.admins.length, 1, 'the owner\'s page: a new admin secret');
    assert.notEqual(O.ksGet(c4, 'a'), a0);
    assert.deepEqual([(await O.readOMeta(await O.sync(c4))).admins, Object.keys((await O.sync(c4)).invites || {})], [['xena', 'yuri'], []], 'Xena stays an admin; every open link stopped');
    await assert.rejects(packet(J, l4), notfound);
    assert.deepEqual(await O.cards(c4), [], 'the card is deleted once applied');
    await X.resendCards();
    assert.equal(X.ls.get('hush:cardsOut:xena', {})[c4], undefined, 'and Xena\'s page no longer writes it');

    // Olga's page has pinned Xena's key, and Xena's removal gave her account a new one. Her own commit holds the owner's page
    // back until Olga accepts the new code; under Yuri's key change the card still waits, as a new admin secret would go to no
    // key Olga hasn't accepted (wrapKey) and nothing would hand it to Xena later. Once accepted, the page acts on it.
    const c7 = newCid();
    O.S.pins = { xena: { ecdh: X.id.ecdh, sig: X.id.sig } };
    await makeChannel(O, c7, ['olga', 'xena', 'yuri'], ['xena', 'yuri']);
    await X.sync(c7); await newKeys(X);
    await removal(X, [{ cid: c7, admin: true, admins: ['xena', 'yuri'], members: ['olga', 'xena', 'yuri'], name: 'Crew' }]);
    const na = O.spy.admins.length;
    await O.run(c7);
    assert.equal(O.spy.admins.length, na, 'a head signed by a key the owner\'s page hasn\'t accepted: nothing yet');
    await Y.loadDir(['xena'], true); await Y.rotateTo(await Y.sync(c7), Y.metaOf(await Y.shown(c7)));
    const l8 = await linkOf(Y, c7);
    await O.run(c7);
    assert.equal(O.spy.admins.length, na, 'under Yuri\'s head too, while Xena\'s new code is unaccepted');
    assert.ok((await O.cards(c7)).includes('xena:adm'), 'the card stays');
    assert.ok(await X.adminSecret(await X.sync(c7)), 'and Xena keeps the admin secret');
    O.S.pins.xena = { ecdh: O.S.dir.xena.ecdh, sig: O.S.dir.xena.sig }; O.S.chanKeys.clear();   // Accept new code (acceptKey)
    await O.run(c7);
    assert.equal(O.spy.admins.length, na + 1, 'accepted: a new admin secret');
    assert.ok(sameKey(await X.adminSecret(await X.sync(c7)), O.unb64(O.ksGet(c7, 'a'))), 'wrapped to Xena\'s new key');
    assert.deepEqual([(await O.readOMeta(await O.sync(c7))).admins, Object.keys((await O.sync(c7)).invites || {})], [['xena', 'yuri'], []]);
    await assert.rejects(packet(J, l8), notfound);
    assert.deepEqual(await O.cards(c7), [], 'the card is deleted once applied');
  });
});

// The chat watch (watchInbox, with the note rule and noteOk) and rewrapFor, lifted for the pages these tests watch: the chat
// list a start shows, from this account's own note for each chat. dmInfo and setDmInfo answer for no one-on-one chat, and
// noKeyNotice is kept in S.nokey.
const watchBuild = mkBuild([lift('const isBlocked=', '\n'), lift('async function noteOk(', '/* Blocking'), lift('function notePointer(', '/* ---------- voice calls'),
  lift('async function rewrapFor(', 'function keyWarnBox('),
  'const dmInfo=()=>null,setDmInfo=()=>{},noKeyNotice=c=>S.nokey.push(c.id),ownNote=dropPointer;',
  'Object.assign(S,{nokey:[],watchInbox,rewrapFor,ownNote:(cid,type)=>ownNote(S.me.handle,{t:\'invite\',cid,from:S.me.handle,type})});'].join('\n'));
async function until(fn, what, ms = 8000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(40); } }
// X's chat watch over a note of its own for each chat: `lists` every list it shows, `dels` every note it deletes (a delete goes
// out inside the step that settles the chat, before the list is shown); `look` is the 15-second look again, at once, and
// `restart` the watch of the next start (a look again only refreshes a watch the server holds back, which reads nothing new);
// each resolves once the chat's record has been read again (the kit's noteChatDoc puts it back).
async function watching(w, X, cids) {
  const lists = [], dels = [], d0 = X.S.db.doc, notes = new Map(), cb = (l) => lists.push(l.map((c) => c.id));
  X.S.db.doc = (p) => { const d = d0(p); if (/^inbox\//.test(p)) { const del = d.delete; d.delete = (...a) => { dels.push(p.split('/').pop()); return del(...a); }; } return d; };
  X.S.contactsReady = true; X.S.vaultOk = true; X.S.prefs = X.S.prefs || {};
  const box = () => X.S.db.collection('inbox/' + X.handle + '/c').limit(500).get().then((s) => s.docs.map((d) => d.id));
  for (const cid of cids) { const was = await box(); await X.S.ownNote(cid, cid[0] === 'g' ? 'group' : 'channel'); notes.set(cid, (await box()).find((id) => !was.includes(id))); }
  let stop = X.S.watchInbox(X.S.me, cb); w.stops.push(() => stop());
  const shows = (cid) => (lists.at(-1) || []).includes(cid);
  await until(() => cids.every(shows), X.handle + '\'s chats to show');
  const reread = async (cid, go) => { X.S.chatDocs.delete(cid); const n = lists.length; go(); await until(() => X.S.chatDocs.has(cid) && lists.length > n, 'the record read again'); };
  return { lists, dels, shows, note: (cid) => notes.get(cid), kept: async (cid) => (await box()).includes(notes.get(cid)),
    look: (cid) => reread(cid, () => X.S.recheckChats()), restart: (cid) => reread(cid, () => { stop(); stop = X.S.watchInbox(X.S.me, cb); }) };
}
const watchWorld = (fn) => world({}, async (w) => { w.stops = []; try { await fn(w); } finally { for (const s of w.stops) s(); } });
// What X reads of the channel's posts sealed under the key of epoch e (null for one it can't open).
async function textsAt(X, cid, e) {
  const rec = await X.sync(cid), out = [];
  for (const d of (await X.S.db.collection('channels/' + cid + '/posts').limit(100).get()).docs) { const p = d.data(); if (p.e !== e) continue;
    const u = await X.unsealPost(rec, { ...p, _id: d.id }), ck = await X.convKey(rec, e);
    out.push(ck ? Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(u.iv, 'base64') }, ck.key, Buffer.from(u.ct, 'base64'))).toString() : null); }
  return out;
}
// Accept new code on A's page (acceptKey): the profile's keys pinned, then rewrapFor hands the chat keys on.
const accept = async (A, h, cid) => { A.S.pins[h] = { ecdh: A.S.dir[h].ecdh, sig: A.S.dir[h].sig }; A.S.chanKeys.clear(); A.S.convs = [{ ...(await A.shown(cid)), id: cid }]; await A.S.rewrapFor(h); };
const send = async (A, cid, text) => { A.S.convs = [{ ...(await A.shown(cid)), id: cid }]; await A.sendBody(cid, text); };
// Whether the account's old key (its lost device) opens a wrap of the record's for epoch e.
const lostOpens = async (B, old, cid, e) => { const L = await pageFor(null, B.handle, { id: old }); return !!(await L.convKey(await B.S.db.preview(cid).then((s) => ({ id: cid, ...s.data() })), e)); };

test('41. a subscriber\'s dev card on an admin\'s page that pinned his old key (pinAll): the key change leaves the lost device and him out (his new code isn\'t accepted there), his page keeps the channel\'s note without showing it or asking about older messages, and once that page accepts his code he reads the next post, with no new link', async () => {
  await watchWorld(async (w) => {
    const { cid } = w;
    const A = await w.page('alice', { owner: true, build: watchBuild }), B = await w.page('bob', { build: watchBuild }), C = await w.page('carol');
    await makeChannel(A, cid, ['alice', 'bob', 'carol']);
    await A.loadDir(['bob', 'carol'], true); A.S.pins = { bob: { ecdh: A.S.dir.bob.ecdh, sig: A.S.dir.bob.sig }, carol: { ecdh: A.S.dir.carol.ecdh, sig: A.S.dir.carol.sig } };
    assert.equal(await B.holds(cid, 0), true);
    const old = B.id; await newKeys(B);
    assert.deepEqual((await removal(B, [{ cid, members: ['alice', 'bob', 'carol'] }])).rotated, [{ cid, card: 'dev' }]);
    const bw = await watching(w, B, [cid]);
    await A.run(cid);
    const c = await A.sync(cid);
    assert.deepEqual([A.spy.rotate.length, A.spy.rotate[0].why, c.epoch], [1, 'leave', 1], 'the dev card: one key change');
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'carol'], 'Bob stays listed');
    assert.deepEqual([await lostOpens(B, old, cid, 1), await C.holds(cid, 1)], [false, true], 'the lost device is cut off at once');
    await until(() => !bw.shows(cid), 'the channel to leave Bob\'s list');
    assert.equal(await B.holds(cid, 1), false, 'no wrap for Bob either: his new code isn\'t accepted on Alice\'s page');
    assert.deepEqual([bw.dels, await bw.kept(cid)], [[], true], 'his note stays');
    await bw.look(cid);                                          // the record looked at again, as every 15 s
    assert.deepEqual([bw.dels, await bw.kept(cid), bw.shows(cid), B.S.nokey], [[], true, false, []], 'still kept and not shown; no "older messages won\'t open" sheet for a chat this device held a key for');
    await accept(A, 'bob', cid);
    await bw.look(cid);
    await until(() => bw.shows(cid), 'the channel back in Bob\'s list');
    assert.deepEqual([bw.dels, await bw.kept(cid), await lostOpens(B, old, cid, 1)], [[], true, false], 'the same note; the lost device still opens nothing');
    await send(A, cid, 'after accept');
    assert.deepEqual(await textsAt(B, cid, 1), ['after accept'], 'Bob reads the next post');
  });
});

test('42. a leave batch on an admin\'s page that hasn\'t accepted a subscriber\'s new code (no dev card): he is left out of the key change, his page keeps the channel\'s note, and accepting his code brings it back', async () => {
  await watchWorld(async (w) => {
    const { cid } = w;
    const A = await w.page('alice', { owner: true, build: watchBuild }), D = await w.page('dan', { build: watchBuild }), F = await w.page('fay');
    await makeChannel(A, cid, ['alice', 'dan', 'fay']);
    await A.loadDir(['dan'], true); A.S.pins = { dan: { ecdh: A.S.dir.dan.ecdh, sig: A.S.dir.dan.sig } };
    assert.equal(await D.holds(cid, 0), true);
    await newKeys(D);                                            // Dan set his account up again: a new code, no card
    const dw = await watching(w, D, [cid]);
    await leave(F, cid); await A.run(cid);
    assert.deepEqual([A.spy.rotate.length, A.spy.rotate[0].why, (await A.sync(cid)).epoch, (await A.meta(cid)).members], [1, 'leave', 1, ['alice', 'dan']], 'Fay\'s leave: one key change');
    await until(() => !dw.shows(cid), 'the channel to leave Dan\'s list');
    assert.equal(await D.holds(cid, 1), false);
    assert.deepEqual([dw.dels, await dw.kept(cid)], [[], true], 'his note stays');
    await dw.look(cid);
    assert.deepEqual([dw.dels, await dw.kept(cid), dw.shows(cid)], [[], true, false], 'also when the record is looked at again');
    await accept(A, 'dan', cid);
    await dw.look(cid);
    await until(() => dw.shows(cid), 'the channel back in Dan\'s list');
    await send(A, cid, 'welcome back');
    assert.deepEqual([dw.dels, await textsAt(D, cid, 1)], [[], ['welcome back']]);
  });
});

test('43. a block still drops the chat\'s note, once the page has its own profile; once the account has changed its keys, a block in a channel keeps it for 30 days from the first time the page finds the channel locked; a group drops it at once', async () => {
  await watchWorld(async (w) => {
    const { cid } = w, c2 = newCid(), g = newCid('g');
    const A = await w.page('alice', { owner: true }), B = await w.page('bob', { build: watchBuild }), E = await w.page('eve', { build: watchBuild }); await w.page('carol');
    await makeChannel(A, cid, ['alice', 'bob', 'carol']);
    await makeChannel(A, c2, ['alice', 'eve', 'carol']); await makeChannel(A, g, ['alice', 'eve', 'carol'], [], 'group');
    assert.equal(await B.holds(cid, 0), true);
    await B.loadDir(['bob'], true);
    const bw = await watching(w, B, [cid]);
    delete B.S.dir.bob;                                          // a start before this page has read its own profile
    await A.kickMember(cid, 'bob', { ban: true });
    await until(() => !bw.shows(cid), 'the channel to leave Bob\'s list');
    assert.deepEqual(bw.dels, [], 'not dropped while the page can\'t tell');
    await bw.look(cid);
    assert.deepEqual([bw.dels, await bw.kept(cid)], [[], true], 'nor when it looks again');
    await B.loadDir(['bob'], true);
    await bw.restart(cid);
    assert.deepEqual(bw.dels, [bw.note(cid)], 'at the next start his own profile shows no key change: blocked, the note goes');
    await until(async () => !(await bw.kept(cid)), 'the note gone from the server');

    // Eve set her account up again: a block in the channel can't be told from a key change that left her out for her new
    // code, so the note waits 30 days from the first time her page finds the channel locked; a group's goes at once.
    assert.deepEqual([await E.holds(c2, 0), await E.holds(g, 0)], [true, true]);
    await newKeys(E);
    const ew = await watching(w, E, [c2, g]);
    await A.kickMember(c2, 'eve', { ban: true }); await A.kickMember(g, 'eve');
    await until(() => !ew.shows(c2) && !ew.shows(g), 'both to leave Eve\'s list');
    assert.deepEqual(ew.dels, [ew.note(g)], 'the channel\'s note waits; the group\'s is gone');
    await ew.restart(c2);
    assert.deepEqual([ew.dels, await ew.kept(c2)], [[ew.note(g)], true], 'also at the next start');
    E.clock.skew = 31 * 864e5;
    await ew.restart(c2);
    assert.deepEqual(ew.dels, [ew.note(g), ew.note(c2)], '30 days on, the channel\'s note goes too');
  });
});

test('44. a leave batch more than 30 days after a subscriber\'s key change, on admins\' pages that haven\'t accepted it: his page notes nothing while the channel shows, keeps the channel\'s note for 30 days from the first time it finds the channel locked, ends that wait once the channel shows again (a later leave-out waits 30 days afresh), and drops the note once a wait passes 30 days', async () => {
  await watchWorld(async (w) => {
    const { cid } = w;
    const A = await w.page('alice', { owner: true, build: watchBuild }), X = await w.page('xena', { build: watchBuild }), D = await w.page('dan', { build: watchBuild }), F = await w.page('fay'), G = await w.page('gus');
    await makeChannel(A, cid, ['alice', 'xena', 'dan', 'fay', 'gus'], ['xena']);
    for (const P of [A, X]) { await P.loadDir(['dan'], true); P.S.pins = { dan: { ecdh: P.S.dir.dan.ecdh, sig: P.S.dir.dan.sig } }; }
    assert.equal(await D.holds(cid, 0), true);
    await newKeys(D);
    const k = 'hush:codeWait:dan', writes = [], set0 = D.ls.set; D.ls.set = (key, v) => { if (key === k) writes.push(v); return set0(key, v); };
    const dw = await watching(w, D, [cid]);
    D.clock.skew = 31 * 864e5;                                   // his key change was a month ago
    await dw.restart(cid);
    assert.deepEqual([writes, dw.shows(cid)], [[], true], 'nothing noted while the channel shows');
    await leave(F, cid); await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members], [1, ['alice', 'xena', 'dan', 'gus']], 'Fay\'s leave: one key change, Dan still listed');
    await until(() => !dw.shows(cid), 'the channel to leave Dan\'s list');
    assert.equal(await D.holds(cid, 1), false);
    assert.deepEqual([dw.dels, await dw.kept(cid), typeof D.ls.get(k, {})[cid]], [[], true, 'number'], 'his note stays: the 30 days start now');
    D.clock.skew += 29 * 864e5;
    await dw.restart(cid);
    assert.deepEqual([dw.dels, await dw.kept(cid), dw.shows(cid)], [[], true, false], '29 days on, still kept and not shown');
    await accept(A, 'dan', cid);
    await dw.look(cid);
    await until(() => dw.shows(cid), 'the channel back in Dan\'s list');
    assert.deepEqual([dw.dels, D.ls.get(k, {})], [[], {}], 'the wait ends once it shows');
    D.clock.skew += 40 * 864e5;
    await leave(G, cid); await X.run(cid);                       // Xena still has his old code
    assert.deepEqual([(await X.sync(cid)).epoch, (await X.meta(cid)).members], [2, ['alice', 'xena', 'dan']], 'Gus\'s leave, on Xena\'s page');
    await until(() => !dw.shows(cid), 'the channel to leave Dan\'s list again');
    assert.deepEqual([await D.holds(cid, 2), dw.dels, await dw.kept(cid)], [false, [], true], 'left out again, 40 days later: a new wait of 30 days');
    D.clock.skew += 31 * 864e5;
    await dw.restart(cid);
    assert.deepEqual([dw.dels, D.ls.get(k, {})], [[dw.note(cid)], {}], '31 days into that wait, the note goes, and so does the wait');
    await until(async () => !(await dw.kept(cid)), 'the note gone from the server');
  });
});

test('145. an admin whose leave card is still pending removes a lost device in the same page session (release 93b item 2): the removal\'s key change is made as for any admin, so the lost device opens no current key right after it, and the leave card goes out again under the new key in place of the adm card, so the leave still stands and the summary says so; the owner\'s next open drops him from the list and the admins and replaces the admin secret, and neither his device nor the lost one gets that key', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'); await w.page('cyd');
    await makeChannel(A, cid, ['alice', 'bob', 'cyd'], ['bob']);
    for (const P of [A, B]) { await P.shown(cid); await P.rolesQ.get(cid); }   // each page's roles record, as an open leaves it
    await leave(B, cid);
    assert.deepEqual(await A.cards(cid), ['bob:leave'], 'his leave card is pending');
    const old = B.id, a0 = A.ksGet(cid, 'a'); B.spy.card.length = 0; B.spy.rotate.length = 0;
    await newKeys(B);
    const rec = await removal(B, [{ cid, admin: true, admins: ['bob'], members: ['alice', 'bob', 'cyd'] }]);
    const c1 = await A.sync(cid), note = B.ls.get('hush:cardsOut:bob', {})[cid] || {};
    assert.deepEqual([rec.rotated, B.spy.rotate.length, c1.epoch, B.spy.card, [note.k, note.e], await A.cards(cid)], [[{ cid, ok: true, card: 'leave' }], 1, 1, [cid], ['leave', 1], ['bob:leave']],
      'LOST LEAVE: the removal made no key change, or wrote an adm card over the leave card');
    assert.deepEqual([await lostOpens(B, old, cid, 1), await B.holds(cid, 1)], [false, true], 'RV3: right after the removal the lost device opens no current key; his own device, which made it, does');
    const tb = summary(B, rec);
    assert.ok(tb.includes('You had left History. That still stands.'), JSON.stringify(tb));
    assert.ok(tb.some((t) => /^The removed device can still act as an admin of History until the owner next opens Hush and has accepted your new security code\./.test(t)) && !tb.some((t) => /Ask the owner to accept your new security code, then remove you as an admin/.test(t)), JSON.stringify(tb));
    // The owner's next open: her page has his new profile and has accepted his new code (acceptKey clears the checks).
    await A.loadDir(['bob'], true); A.S.chanKeys.clear();
    await A.run(cid);
    const c2 = await A.sync(cid);
    assert.deepEqual([c2.epoch, (await A.meta(cid)).members, (await A.readOMeta(c2)).admins, A.spy.admins.length, await A.cards(cid)], [2, ['alice', 'cyd'], [], 1, []], 'the leave took effect: dropped from the list and the admins by one admin-key change, the card deleted');
    assert.notEqual(A.ksGet(cid, 'a'), a0, 'the admin secret replaced');
    assert.deepEqual([await B.holds(cid, 2), await lostOpens(B, old, cid, 2)], [false, false], 'neither his device nor the lost one gets that key');
  });
});

// A lost admin device: a page signed in as a stranger whose caps show the server the admin key from the old secret S alone (the
// server ties the admin key to no account, so whoever holds S is an admin for as long as it is the key); the level it gets now.
const lostDevice = (L, S) => { L.adminSecret = async () => S; L.memberCap = async () => null; return async (cid) => { await L.S.db.refreshChat(cid); return L.S.db.chatLevel(cid); }; };

test('151. the owner\'s page replaces the admin secret by itself once an admin\'s account keys have changed (release 93b item 1b): Bob\'s device removal gives his account new keys and writes an adm card; the lost device (his old admin secret, signed in as a stranger) deletes it, and when his page writes it again at a start blocks him away (the block removes the card) and lets him back in, so no card is left and nothing shows who did it; the owner\'s page, his old key pinned, replaces nothing until she accepts his new code, under a head another admin signed; then her next open replaces the secret, wrapped to his new key and the other admin\'s, notes his key version, and the old secret opens the channel at no level any more; a block the lost device left on him goes with it; her next open replaces nothing more; his summary says the removed device can\'t quietly put that off', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), C = await w.page('carl'), L = await w.page('lost'); await w.page('gus');
    const members = ['alice', 'bob', 'carl', 'gus'];
    await makeChannel(A, cid, members, ['bob', 'carl']);
    for (const P of [A, B, C]) { await P.shown(cid); await P.rolesQ.get(cid); }   // each page's roles record, as an open leaves it
    const S0 = A.unb64(A.ksGet(cid, 'a')), old = B.id, lostLevel = lostDevice(L, S0);
    A.S.pins = { bob: { ecdh: old.ecdh, sig: old.sig } };            // his key as her page first saw it (pinAll)
    await newKeys(B);
    const rec = await removal(B, [{ cid, admin: true, admins: ['bob', 'carl'], members }]);
    assert.deepEqual([rec.rotated, (await A.sync(cid)).epoch, await A.cards(cid), await lostLevel(cid)], [[{ cid, ok: true, card: 'adm' }], 1, ['bob:adm'], 'admin'], 'his removal: the key changed, his adm card is there, and the lost device\'s old secret is still the channel\'s admin key');
    // The lost device, at admin level: the card deleted; his page writes it again at its next start; blocked away (the block removes the card) and let back in.
    const tags = async () => (await L.S.db.collection('channels/' + cid + '/roll').limit(10).get()).docs.map((d) => d.id);
    const [tag] = await tags(); await L.S.db.doc('channels/' + cid + '/roll/' + tag).delete();
    assert.deepEqual(await A.cards(cid), [], 'deleted');
    await B.resendCards();
    assert.deepEqual(await A.cards(cid), ['bob:adm'], 'written again at a start');
    await L.S.db.banChat(cid, 'bob', true); await L.S.db.banChat(cid, 'bob', false);
    assert.deepEqual([await A.cards(cid), await tags()], [[], []], 'blocked away: no card, and nothing to show who removed it');
    await C.loadDir(['bob'], true); await C.rotateTo(await C.sync(cid), C.metaOf(await C.shown(cid)));   // another admin's key change: the head is signed by him, not by Bob's new key
    await A.loadDir(['bob'], true);                                    // the directory refresh (refreshDir, every minute) brings her page his new keys and key version
    assert.equal(A.S.dir.bob.kv, 2);
    A.spy.admins.length = 0;
    await A.run(cid);
    assert.deepEqual([A.spy.admins, (await A.sync(cid)).epoch, await lostLevel(cid)], [[], 2, 'admin'], 'his new code not accepted here: nothing yet (the new secret would go to no key of his), and the lost device keeps admin level');
    await L.S.db.banChat(cid, 'bob', true);                            // and this time leaves him blocked
    assert.equal(w.T.srv.store.isBanned(cid, 'bob'), true, 'blocked at the server: his admin key still opens the chat (the server ties it to no account), but his key changes, cards and blocks are refused while it stands');
    A.S.pins.bob = { ecdh: A.S.dir.bob.ecdh, sig: A.S.dir.bob.sig }; A.S.chanKeys.clear();   // Accept new code (acceptKey)
    await A.run(cid);
    const S1 = A.unb64(A.ksGet(cid, 'a'));
    assert.deepEqual([A.spy.admins, sameKey(S1, S0), A.rolesOf(cid).ak, await lostLevel(cid)], [[cid], false, { bob: 2, carl: 1 }, null], 'DELAYED: accepted, with no card left, the admin secret is replaced by itself and his key version noted; the old secret opens the channel at no level any more');
    for (const P of [B, C]) { await P.shown(cid); await P.rolesQ.get(cid); await P.sync(cid); }   // the list signed again, read; then the chat opened again with the secret it names
    assert.deepEqual([sameKey(await B.verifiedAdmin(await B.sync(cid)), S1), B.S.db.chatLevel(cid), sameKey(await C.verifiedAdmin(await C.sync(cid)), S1), w.T.srv.store.isBanned(cid, 'bob')], [true, 'admin', true, false], 'wrapped to his new key and to Carl, his own device an admin under it, and the block the lost device left on him lifted with the replacement');
    await A.run(cid);
    assert.deepEqual([A.spy.admins, (await A.sync(cid)).epoch], [[cid], 2], 'once: the noted version stops a second replacement, and no key changed');
    const tb = summary(B, rec);
    assert.ok(tb.includes('The removed device can still act as an admin of History until the owner next opens Hush and has accepted your new security code. If it’s an older channel, the owner first taps Edit, then Save. Then it is shut out. If the removed device is in the wrong hands, tell the owner now.'), JSON.stringify(tb));
  });
});
