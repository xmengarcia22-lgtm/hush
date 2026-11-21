// Release 92 (page), private channel history, people waiting to join and a device removal (SPEC.md 5.6 "Member cards", 14.15):
// a subscriber the list leaves out yet (waiting to join) who removes a lost device writes no dev card but their join card again,
// under the new account key, so they keep waiting and the summary says the removed device still reads the channel until the key
// next changes (fix M); an admin's removal whose key change fails stops every open link without listing whoever joined through one,
// and they wait, through the next key change, for an admin's Add. Kept apart from channel-history-removal.test.js so that neither
// nears the runner's 120 s. Tests 121 to 123 (the third review round): a pending leave card survives a device removal, listed or not,
// and the removal's mirror stage lifts the date-limit hold of the account's parked copies. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { b64u, world, makeChannel, linkOf, pageFor, oldServer } from './channel-history-kit.js';

// Helpers shared with channel-history-removal.test.js and channel-history-cards.test.js, copied as those files do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
const roll = async (A, cid, all) => { const c = await A.sync(cid); return A.readRoll(c, A.metaOf(await A.showMeta(c)), all); };
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
// Whether the account's old key (its lost device) opens a wrap of the record's for epoch e.
const lostOpens = async (B, old, cid, e) => { const L = await pageFor(null, B.handle, { id: old }); return !!(await L.convKey(await B.S.db.preview(cid).then((s) => ({ id: cid, ...s.data() })), e)); };
// Add subscribers on X's page (openAddSubs) with `who` picked, and Add pressed.
const addPicked = async (X, cid, who) => { X.S.pick = who; X.S.convs = [await X.sync(cid)]; X.spy.els.length = 0; await X.openAddSubs(cid); await X.spy.els.find((e) => e.tag === 'button').onclick(); };

test('110. a subscriber not listed yet (waiting to join) who removes a lost device writes no dev card but their join card again, under the new account key, so they still wait, no key changes, and the summary says the removed device still reads the channel, that removing it changed nothing there, how they come to be added, and what to ask the admin for once they are (accept the new security code, block, unblock, add again); added, they get the next key and the lost device doesn\'t', async () => {
  await world({}, async (w) => {
    // Today's server: under the rule his page reads no list, so the removal writes the dev card (channel-history-nolist.test.js M6).
    oldServer(w.T);
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), D = await w.page('dave');
    await makeChannel(A, cid, ['alice', 'bob']);
    await D.joinPrivate(cid, await linkOf(A, cid));
    // a release-91 page: the card carries no link and no m (as healCard writes for a joiner who noted none)
    const m = D.ls.get('hush:cardsOut:dave', {}); delete m[cid]; D.ls.set('hush:cardsOut:dave', m);
    await D.writeCard(await D.sync(cid), 'join', '', '');
    await A.run(cid);
    assert.deepEqual([(await A.meta(cid)).members, (await roll(A, cid)).wait.map((x) => x.f)], [['alice', 'bob'], ['dave']], 'Dave waits');
    const old = D.id; D.spy.card.length = 0;
    await newKeys(D);
    const rec = await removal(D, [{ cid, members: ['alice', 'bob', 'dave'] }]);   // the read stage counts him in (showMeta adds an unlisted key holder)
    assert.deepEqual([rec.rotated, D.spy.card, D.ls.get('hush:cardsOut:dave', {})[cid], await A.cards(cid)], [[{ cid, skip: 'unlisted', card: 'join' }], [cid], { k: 'join', e: 0, i: '', sent: D.ls.get('hush:cardsOut:dave', {})[cid].sent }, ['dave:join']], 'no dev card: the join card written again (its old signature would no longer check), as noted');
    const t = summary(D, rec);
    assert.ok(t.includes('The removed device can still read History. Removing it changed nothing there, because the channel hasn’t finished adding you. If your invite link still works, an admin adds you when they next open Hush. If it doesn’t, ask an admin to add you: you are under Waiting to join. Once you are added, ask the admin to accept your new security code, then block you, unblock you and add you again. That shuts it out.'), JSON.stringify(t));
    assert.ok(!t.some((x) => /Ask an admin of these channels to open the channel|Couldn’t secure these chats/.test(x)), JSON.stringify(t));
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await roll(A, cid)).wait.map((x) => x.f), await lostOpens(D, old, cid, 0)], [0, 0, ['dave'], true], 'no key change: Dave still waits, and the lost device holds the current key');
    await addPicked(A, cid, ['dave']);
    await leave(B, cid); await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, await D.holds(cid, 1), await lostOpens(D, old, cid, 1)], [1, ['alice', 'dave'], true, false], 'added, Dave gets the next key and the lost device does not');
  });
});

test('111. an admin\'s device removal whose key change fails stops every open link without listing whoever joined through one (the device\'s new keys open no `as`, and the lost device may have let them in): they wait, through the owner\'s replacement of the admin secret and the next leave\'s key change, for an admin\'s Add', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), B = await w.page('bob'), Z = await w.page('zed');
    await makeChannel(A, cid, ['alice', 'xena', 'zed'], ['xena']);
    const j = await linkOf(A, cid);
    await B.joinPrivate(cid, j);
    await X.sync(cid); await newKeys(X);
    X.spy.failRotate = ['toolarge'];
    const rec = await removal(X, [{ cid, admin: true, admins: ['xena'], members: ['alice', 'xena', 'zed'] }]);
    assert.deepEqual(rec.rotated, [{ cid, skip: 'error', msg: 'toolarge', card: 'adm' }]);
    const c = await A.sync(cid);
    assert.deepEqual([Object.keys(c.invites || {}), c.epoch, (await A.meta(cid)).members], [[], 0, ['alice', 'xena', 'zed']], 'the link stopped; Bob not listed');
    await A.run(cid);
    assert.deepEqual([A.spy.admins.length, (await A.meta(cid)).members, (await roll(A, cid)).wait.map((x) => x.f)], [1, ['alice', 'xena', 'zed'], ['bob']], 'the owner\'s page replaces the admin secret; Bob waits');
    await leave(Z, cid); await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, await B.holds(cid, 1), (await roll(A, cid)).wait.map((x) => x.f)], [1, false, ['bob']], 'cut off by the leave, and still waiting');
    await addPicked(A, cid, ['bob']);
    assert.deepEqual([(await A.meta(cid)).members, await B.holds(cid, 1)], [['alice', 'xena', 'bob'], true], 'Add brings him back');
  });
});

test('121. a listed subscriber whose leave card is still pending (leaveChat; no admin\'s page has acted) removes a lost device in the same session: the removal writes the leave card again, signed by the new account key, never a dev card over it, so the admin\'s next open drops them and neither device gets the new key', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'); await w.page('cyd');
    await makeChannel(A, cid, ['alice', 'bob', 'cyd']);
    await leave(B, cid);
    assert.deepEqual([await A.cards(cid), B.ls.get('hush:cardsOut:bob', {})[cid].k], [['bob:leave'], 'leave'], 'the leave card is pending');
    const old = B.id; B.spy.card.length = 0;
    await newKeys(B);
    const rec = await removal(B, [{ cid, members: ['alice', 'bob', 'cyd'] }]);   // the read stage still lists the channel: leaveChat forgets only the inbox pointer
    const o = B.ls.get('hush:cardsOut:bob', {})[cid];
    assert.deepEqual([rec.rotated, B.spy.card, B.spy.rotate, o.k, o.e, await A.cards(cid)], [[{ cid, skip: 'left', card: 'leave' }], [cid], [], 'leave', 0, ['bob:leave']], 'the leave card again, under the new key; no dev card');
    const t = summary(B, rec);
    assert.ok(!t.some((x) => /Ask an admin of these channels to open the channel|still read new messages in these groups|ask an admin to add you|Couldn’t secure these chats/.test(x)), JSON.stringify(t));
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, await B.holds(cid, 1), await lostOpens(B, old, cid, 1)], [1, ['alice', 'cyd'], false, false], 'the leave took effect: Bob dropped, and neither his device nor the lost one gets the new key');
    await B.resendCards();
    assert.equal(B.ls.get('hush:cardsOut:bob', {})[cid], undefined, 'the entry goes once the key has changed');
  });
});

test('122. an unlisted link joiner whose leave card is still pending removes a lost device: the leave card again, no join card over it, so they neither wait to join nor are listed, and the summary names no channel to add them to', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), D = await w.page('dave');
    await makeChannel(A, cid, ['alice']);
    await D.joinPrivate(cid, await linkOf(A, cid));
    await leave(D, cid);
    assert.deepEqual(await A.cards(cid), ['dave:leave']);
    await newKeys(D); D.spy.card.length = 0;
    const rec = await removal(D, [{ cid, members: ['alice', 'dave'] }]);
    assert.deepEqual([rec.rotated, D.spy.card, D.ls.get('hush:cardsOut:dave', {})[cid].k, await A.cards(cid)], [[{ cid, skip: 'left', card: 'leave' }], [cid], 'leave', ['dave:leave']], 'the leave card again, no join card');
    assert.ok(!summary(D, rec).some((x) => /ask an admin to add you|still read new messages in these groups/.test(x)));
    const r = await roll(A, cid);
    assert.deepEqual([r.join, r.wait, r.leave], [[], [], []], 'Dave, who left, neither waits nor is listed');
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members], [0, ['alice']], 'no key change, no listing');
  });
});

test('123. the removal\'s mirror stage, once the new keys are published, drops this account\'s copies of her lists waiting past the date limit (rolesLater), and no other account\'s: a copy signed under the key just replaced (a fast-clock device of hers, or the lost device dating its list ahead) holds her owner changes no more, so Make admin and Edit go through right after the removal', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob']);
    await A.shown(cid); await A.rolesQ.get(cid);
    A.rolesLater.set('alice:' + cid + ':ahead', true); A.rolesLater.set('olga:' + cid + ':ahead', true);   // as noteRoles parks a copy 5 to 10 minutes ahead: hers holds her owner changes (rolesHeld); Olga's belongs to another account signed in on this page before
    await assert.rejects(A.setAdmins(cid, ['bob']), (e) => e.message === 'nokey', 'held: no owner change dated by this clock');
    A.S.me.dev = { id: 'dev1', ecdh: A.S.me.ecdh, sig: A.S.me.sig, by: '', s: '', ts: Date.now() };   // what the mirror stage publishes about this device
    const rec = { stage: 'mirror', name: 'Old phone', rotated: [], chats: [] }, fails = [];
    A.S.contactsReady = true; A.S.vaultOk = true;
    await A.rekeyRun(rec, { step: (t) => { if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} });
    assert.deepEqual(fails, ['Removing the device stopped (stop). Close Hush and open it again to finish it.'], 'the mirror and rotate stages ran');
    A.S.rekeying = false;
    assert.deepEqual([[...A.rolesLater.keys()], A.rolesHeld(cid)], [['olga:' + cid + ':ahead'], false], 'her parked copies gone, the other account\'s kept');
    await A.setAdmins(cid, ['bob']);
    assert.deepEqual((await A.shown(cid)).admins, ['bob'], 'her owner change goes through');
  });
});
