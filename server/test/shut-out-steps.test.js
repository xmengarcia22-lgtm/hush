// The steps the device-removed summary gives (rekeySummary: the group sentence, the not-listed-yet channel sentence and the admin
// sentence without a card), run in their order with the page's own functions, against a device that held the account's keys and
// the chat's keys before the removal ("the lost device"). What a sentence tells a person to ask for must do what it says:
//   a group you are a plain member of:   the admin accepts your new security code, blocks you, unblocks you and adds you again;
//   a private channel that had not finished adding you: once you are added, the same four steps;
//   a chat you are an admin of, with no card written (a group, a public channel): the owner accepts your new security code,
//   removes you as an admin and makes you one again.
// And why the accept comes first: added again, or made an admin again, before it, the person gets nothing (wrapKey wraps for no
// key this device has not accepted). A plain member is healed by the accept (rewrapFor); an admin is not.
//
// The buttons' own functions run, as written: Accept new code (acceptKey, with the rewrapFor it starts), Block from this group or
// channel (kickMember with ban), Unblock (unban), Add members or subscribers (openAddSubs with its Add button, addSubs), Remove admin
// and Make admin (setAdmins), and the removal's rotate stage with its summary (rekeyRun, rekeySummary). The page harness is
// channel-history-kit.js: a real server, real keys, nothing sealed by a stub.
//
// THE LOST DEVICE here is three things, each as far as the removal leaves it: the account keys from before the removal (does a wrap
// of the record open for them, do they open a post), the chat key it held, shown to the server as the chat's member key from a
// connection signed in under another name (the server ties a chat's member key and admin key to no account), and the admin secret
// it held, shown the same way.
//
// NOT SEEN HERE: the sentences themselves beyond their first words (words-a.test.js has every word); the buttons' confirm questions
// and toasts but for "Member added"; a block with no key change left (a group at epoch 31, a record with no room: kickMember then
// writes the lists only, and the steps shut nothing out); a lost device that used its keys before the steps were taken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { b64u, world, makeChannel, linkOf, lift, mkBuild, pageFor, oldServer } from './channel-history-kit.js';

// The admin's (or owner's) page: Accept new code as written (acceptKey), the rewrapFor it starts and does not wait for (watched
// here, as the harness watches wrapAll, so a test can wait for its end), and Unblock (unban). dmInfo answers for no one-on-one chat.
const adminBuild = mkBuild([lift('async function acceptKey(', 'async function rewrapFor('), lift('async function rewrapFor(', 'function keyWarnBox('), lift('async function unban(', 'const reconciled='),
  'const dmInfo=()=>null;{const r=rewrapFor;rewrapFor=h=>(S.rewrap=r(h))}Object.assign(S,{acceptKey,unban,cache:new Map(),warned:new Set(),verified:{}});'].join('\n'));

// Helpers shared with channel-history-removal.test.js and channel-history-waiting.test.js, copied as those files do.
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
const view = async (X, cid) => ({ ...(await X.shown(cid)), id: cid });   // the chat as X's chat list holds it
const send = async (X, cid, text) => { X.S.convs = [await view(X, cid)]; await X.sendBody(cid, text); };
// Add members / Add subscribers on X's page (openAddSubs) with `who` picked, and its Add button pressed.
const addPicked = async (X, cid, who) => { X.S.pick = who; X.S.convs = [await X.sync(cid)]; X.spy.els.length = 0; await X.openAddSubs(cid); await X.spy.els.find((e) => e.tag === 'button').onclick(); };
const newCid = (p) => p + randomBytes(6).toString('hex');
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));

// pinAll: h's key as X's page first saw it. changed(): the page has h's new profile and has not accepted the new code (keyChanged).
const pin = async (X, h) => { await X.loadDir([h], true); X.S.pins = { ...(X.S.pins || {}), [h]: { ecdh: X.S.dir[h].ecdh, sig: X.S.dir[h].sig } }; };
const changed = (X, h) => !!X.S.pins[h] && !!X.S.dir[h] && X.S.pins[h].sig.x !== X.S.dir[h].sig.x;
// Accept new code on X's page: the directory refresh has brought h's new profile, the page shows the change, and the profile's
// button runs acceptKey; the chat is in X's chat list (rewrapFor goes through the list), and rewrapFor is waited for.
async function accept(X, h, cid) {
  await X.loadDir([h], true); assert.equal(changed(X, h), true, X.handle + '\'s page shows ' + h + '\'s security code as changed');
  X.S.convs = [await view(X, cid)]; await X.S.acceptKey(h); await X.S.rewrap;
  assert.equal(changed(X, h), false, 'accepted');
}

// What X reads of the chat's posts sealed under the key of epoch e, through its own connection (null for a post it can't open);
// the server's refusal by its code when X's connection may not read the chat at all.
async function texts(X, cid, e, L) {
  const rec = await X.sync(cid), out = [], R = L || X;
  for (const d of (await X.S.db.collection('channels/' + cid + '/posts').limit(100).get()).docs) { const p = d.data(); if (p.e !== e) continue;
    const u = await R.unsealPost(rec, { ...p, _id: d.id }), ck = await R.convKey(rec, e);
    out.push(ck ? Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(u.iv, 'base64') }, ck.key, Buffer.from(u.ct, 'base64'))).toString() : null); }
  return out;
}
const reads = (X, cid, e) => texts(X, cid, e).catch((err) => 'refused: ' + ((err && err.code) || err));
// The lost device's account keys (`old`, the identity from before the removal) against the record and the sealed posts as A's
// connection hands them out: whether a wrap of epoch e opens for them, what they read of the posts under that key, and whether
// a wrap of the admin secret opens for them (a group's or a public channel's: adminSecret asks for no signed list there).
const lostPage = (h, old) => pageFor(null, h, { id: old });
const lostOpens = async (A, h, old, cid, e) => !!(await (await lostPage(h, old)).convKey(await A.sync(cid), e));
const lostReads = async (A, h, old, cid, e) => texts(A, cid, e, await lostPage(h, old));
const lostUnwraps = async (A, h, old, cid) => !!(await (await lostPage(h, old)).adminSecret(await A.sync(cid)));
// The lost device at the server: L, a page signed in under another name, shows the member key made from the chat key the device
// held (raw, of epoch e) and the admin secret it held, and nothing else; the level the server gives it now (null: the chat does not open).
function lostAt(L, { raw, e, secret }) {
  L.adminSecret = async () => secret || null; L.memberCap = async (c) => (raw ? L.memberCapFrom(c.id, e, raw) : null);
  return async (cid) => { await L.S.db.refreshChat(cid).catch(() => {}); return L.S.db.chatLevel(cid); };
}

// A group with Pat a plain member, Alice's page having pinned everyone's key; Pat removes a device. The removal changes nothing
// in the group (rekeyChat: skip 'member'), which is what the summary's sentence is about.
async function groupAfterRemoval(w) {
  const g = newCid('g'), A = await w.page('alice', { owner: true, build: adminBuild }), P = await w.page('pat'), C = await w.page('carol'), L = await w.page('lost');
  await makeChannel(A, g, ['alice', 'pat', 'carol'], [], 'group');
  await pin(A, 'pat'); await pin(A, 'carol');
  const old = P.id, raw0 = (await P.convKey(await P.sync(g), 0)).raw, lost = lostAt(L, { raw: raw0, e: 0 });
  await newKeys(P);
  const rec = await removal(P, [{ cid: g, type: 'group', members: ['alice', 'pat', 'carol'], name: 'Club' }]);
  assert.deepEqual(rec.rotated, [{ cid: g, skip: 'member' }], 'a plain member\'s removal changes nothing in the group');
  assert.ok(summary(P, rec).some((t) => t.startsWith('The removed device can still read new messages in these groups: Club. Ask an admin there to ')), 'the summary names the group and says what to ask for');
  await send(C, g, 'after the removal');
  assert.deepEqual([(await A.sync(g)).epoch, await lostOpens(A, 'pat', old, g, 0), await lostReads(A, 'pat', old, g, 0), await lost(g)], [0, true, ['after the removal'], 'member'],
    'before the steps: no key change, and the lost device reads a message sent after the removal; the server takes the member key it holds');
  return { g, A, P, C, old, lost };
}

test('G. the group sentence\'s steps, in its order (accept the new security code, block, unblock, add again): the block changes the group\'s key without the person, unblock and add change no key, the person\'s remaining device opens the group again and reads a message sent after, and the lost device is shut out: no wrap of the new key opens for its account keys, it reads nothing sent under it, and the server refuses the member key it holds', async () => {
  await world({}, async (w) => {
    const { g, A, P, old, lost } = await groupAfterRemoval(w);
    await accept(A, 'pat', g);
    assert.equal(await A.kickMember(g, 'pat', { ban: true }), undefined);          // Block from this group
    assert.deepEqual([(await A.sync(g)).epoch, (await A.meta(g)).members, (await A.meta(g)).banned, w.T.srv.store.isBanned(g, 'pat'), await P.holds(g, 1)], [1, ['alice', 'carol'], ['pat'], true, false], 'the block: a new key for the others, Pat off the list and blocked');
    await A.S.unban(g, 'pat');                                                       // Unblock
    await addPicked(A, g, ['pat']);                                                  // Add members, Pat picked
    assert.deepEqual(A.spy.toasts.at(-1), ['Member added']);
    assert.deepEqual([(await A.sync(g)).epoch, (await A.meta(g)).members, (await A.meta(g)).banned, w.T.srv.store.isBanned(g, 'pat'), A.spy.rotate.length], [1, ['alice', 'carol', 'pat'], [], false, 1], 'unblock and add: listed again, no block left, and no second key change');
    await send(A, g, 'after the steps');
    assert.deepEqual([await P.holds(g, 1), P.S.db.chatLevel(g), await reads(P, g, 1)], [true, 'member', ['after the steps']], 'Pat\'s remaining device opens the group under the new key and reads the message sent after');
    assert.deepEqual([await lostOpens(A, 'pat', old, g, 1), await lostReads(A, 'pat', old, g, 1), await lost(g)], [false, [null], null], 'SHUT OUT: no wrap of the new key opens for the lost device\'s keys, the message sent after stays closed to it, and the server refuses its member key');
  });
});

test('G2. why the accept comes first: the same block, unblock and add WITHOUT it list the person again ("Member added") but wrap the new key for no device of theirs, so they cannot open the group or read; once the admin accepts the new security code the keys are handed over (rewrapFor) and they read; the lost device stays shut out either way', async () => {
  await world({}, async (w) => {
    const { g, A, P, old, lost } = await groupAfterRemoval(w);
    await A.kickMember(g, 'pat', { ban: true });
    await A.S.unban(g, 'pat');
    await addPicked(A, g, ['pat']);
    assert.deepEqual([A.spy.toasts.at(-1), changed(A, 'pat')], [['Member added'], true], 'Add says it worked, with Pat\'s new code not accepted on Alice\'s page');
    await send(A, g, 'after the steps');
    assert.deepEqual([(await A.sync(g)).epoch, (await A.meta(g)).members, w.T.srv.store.isBanned(g, 'pat')], [1, ['alice', 'carol', 'pat'], false], 'listed again under the new key, not blocked');
    assert.deepEqual([await P.holds(g, 1), P.S.db.chatLevel(g), await reads(P, g, 1)], [false, null, 'refused: denied'], 'NO KEY: Pat is listed but holds no key of the group, so the group does not open and nothing can be read');
    assert.deepEqual([await lostOpens(A, 'pat', old, g, 1), await lost(g)], [false, null], 'the lost device is out all the same');
    await accept(A, 'pat', g);
    assert.deepEqual([await P.holds(g, 1), P.S.db.chatLevel(g), await reads(P, g, 1)], [true, 'member', ['after the steps']], 'HEALED: after the accept Pat reads, with no further step');
    assert.deepEqual([(await A.sync(g)).epoch, await lostOpens(A, 'pat', old, g, 1), await lostReads(A, 'pat', old, g, 1), await lost(g)], [1, false, [null], null], 'and the lost device still opens nothing');
  });
});

// The state the not-listed-yet sentence is about (channel-history-waiting.test.js, test 110): Dave joined a private channel by link,
// no admin's page has listed him, and he removes a device. `how`: 'open', his join card still goes through its open link, so the
// admin's next open lists him; 'add', the card names no link (as a release-91 page wrote it), so he waits and an admin adds him.
for (const how of ['open', 'add']) test('C (' + (how === 'open' ? 'the invite link still works: listed at the admin\'s next open' : 'no link behind the card: an admin adds him from Waiting to join') + '). the not-listed-yet channel sentence: being listed or added changes no key, so the lost device still reads; then the steps (accept the new security code, block, unblock, add again) change the key without him, his remaining device gets the new key and reads a post made after, and the lost device is shut out', async () => {
  await world({}, async (w) => {
    oldServer(w.T);   // as test 110: the server that still hands a subscriber the list (under today's rule his page reads none and writes a dev card: channel-history-nolist.test.js M6)
    const { cid } = w, A = await w.page('alice', { owner: true, build: adminBuild }), D = await w.page('dave'), L = await w.page('lost'); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob']);
    await pin(A, 'dave');   // Alice's page knew Dave before (a contact, another chat): it holds his key as it first saw it
    await D.joinPrivate(cid, await linkOf(A, cid));
    if (how === 'add') { const m = D.ls.get('hush:cardsOut:dave', {}); delete m[cid]; D.ls.set('hush:cardsOut:dave', m); await D.writeCard(await D.sync(cid), 'join', '', ''); await A.run(cid); }
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob'], 'Dave is not listed yet');
    const old = D.id, raw0 = (await D.convKey(await D.sync(cid), 0)).raw, lost = lostAt(L, { raw: raw0, e: 0 });
    await newKeys(D);
    const rec = await removal(D, [{ cid, members: ['alice', 'bob', 'dave'] }]);
    assert.deepEqual(rec.rotated, [{ cid, skip: 'unlisted', card: 'join' }]);
    assert.ok(summary(D, rec).some((t) => t.startsWith('The removed device can still read History')), 'the summary names the channel');
    // listed (the admin's next open) or added (Add subscribers, from Waiting to join): no key change
    if (how === 'open') await A.run(cid); else { await A.run(cid); assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob'], 'an open alone does not list him'); await addPicked(A, cid, ['dave']); }
    await send(A, cid, 'after he was added');
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await A.meta(cid)).members, await lostOpens(A, 'dave', old, cid, 0), await lostReads(A, 'dave', old, cid, 0), await lost(cid)], [0, 0, ['alice', 'bob', 'dave'], true, ['after he was added'], 'member'],
      'ADDED, NOTHING SHUT OUT: Dave is listed, no key changed, and the lost device reads a post made after; the server takes its member key');
    await accept(A, 'dave', cid);
    assert.equal(await A.kickMember(cid, 'dave', { ban: true }), undefined);        // Block from this channel
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, w.T.srv.store.isBanned(cid, 'dave')], [1, ['alice', 'bob'], true], 'the block: a new key without him');
    await A.S.unban(cid, 'dave');                                                    // Unblock
    await addPicked(A, cid, ['dave']);                                               // Add subscribers, Dave picked
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, (await A.meta(cid)).banned, w.T.srv.store.isBanned(cid, 'dave'), A.spy.rotate.length], [1, ['alice', 'bob', 'dave'], [], false, 1], 'unblock and add: listed again, no second key change');
    await send(A, cid, 'after the steps');
    assert.deepEqual([await D.holds(cid, 1), await reads(D, cid, 1)], [true, ['after the steps']], 'Dave\'s remaining device holds the new key and reads the post made after');
    assert.deepEqual([await lostOpens(A, 'dave', old, cid, 1), await lostReads(A, 'dave', old, cid, 1), await lost(cid)], [false, [null], null], 'SHUT OUT: the new key opens for no key of the lost device, the post stays closed to it, and the server refuses its member key');
  });
});

// Release 104 (item 7), the same person on today's server, where the member list goes to the owner and the admins only: Dave's
// page reads no list, so his removal writes a dev card over his join card (channel-history-nolist.test.js M6), and the summary's
// sentence for a dev card is: "Ask an admin of these channels to open the channel: ... If they see you under Waiting to join, they
// add you, then open the channel once more. That shuts the removed device out. Until an admin has accepted your new security code,
// new posts there may not show for you either." An admin's page counts a dev card from a person who is not listed as waiting to
// join (readRoll; removal-linkjoiner.test.js has it card by card). Alice's page held Dave's key before, so his new code needs her accept.
test('D. the dev-card channel sentence\'s steps on today\'s server, in its order (an admin opens the channel and sees him under Waiting to join, adds him, opens the channel once more): the first open and the Add change no key, so the lost device still reads; the open after the Add changes the key without the lost device, which is shut out; his remaining device gets the new key once the admin has accepted his new security code, and then reads a post made after', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build: adminBuild }), D = await w.page('dave'), L = await w.page('lost'); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob']);
    await pin(A, 'dave');   // Alice's page knew Dave before (a contact, another chat): it holds his key as it first saw it
    await D.joinPrivate(cid, await linkOf(A, cid));   // no admin's page has opened the channel since: not listed
    const old = D.id, raw0 = (await D.convKey(await D.sync(cid), 0)).raw, lost = lostAt(L, { raw: raw0, e: 0 });
    await newKeys(D);
    const rec = await removal(D, [{ cid }]);   // his page reads no list: the read stage names no member
    assert.deepEqual([rec.rotated, await A.cards(cid)], [[{ cid, card: 'dev' }], ['dave:dev']], 'the dev card, over his join card');
    assert.ok(summary(D, rec).some((t) => t.startsWith('Ask an admin of these channels to open the channel: History. If they see you under Waiting to join, they add you, then open the channel once more. That shuts the removed device out.')), 'the summary names the channel and says what to ask for');
    // an admin opens the channel and sees him under Waiting to join: no key change, nobody listed
    await A.run(cid); A.S.convs = [await view(A, cid)];
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await A.meta(cid)).members, A.waitList().map(([c, x]) => [c, x.hs])], [0, 0, ['alice', 'bob'], [[cid, ['dave']]]], 'the open: he waits to join, in the chat list\'s notice; no key changed, and the card listed nobody');
    // they add him
    await addPicked(A, cid, ['dave']);
    await send(A, cid, 'after he was added');
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await A.meta(cid)).members, await lostOpens(A, 'dave', old, cid, 0), await lostReads(A, 'dave', old, cid, 0), await lost(cid)], [0, 0, ['alice', 'bob', 'dave'], true, ['after he was added'], 'member'],
      'ADDED, NOTHING SHUT OUT YET: Dave is listed, no key changed, and the lost device reads a post made after; the server takes its member key');
    // then open the channel once more: his card is a listed person's now, and the key changes
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, A.spy.rotate.length, (await A.meta(cid)).members], [1, 1, ['alice', 'bob', 'dave']], 'the open after the Add: one key change, and he stays listed');
    await send(A, cid, 'after the steps');
    assert.deepEqual([await lostOpens(A, 'dave', old, cid, 1), await lostReads(A, 'dave', old, cid, 1), await lost(cid)], [false, [null], null], 'SHUT OUT: the new key opens for no key of the lost device, the post stays closed to it, and the server refuses its member key');
    // "Until an admin has accepted your new security code, new posts there may not show for you either"
    assert.equal(await D.holds(cid, 1), false, 'before the accept the new key is wrapped for no device of his: Alice\'s page has not accepted his new security code');
    await accept(A, 'dave', cid);
    assert.deepEqual([await D.holds(cid, 1), await reads(D, cid, 1)], [true, ['after the steps']], 'after the accept his remaining device holds the new key and reads the post made after, with no further step');
    assert.deepEqual([(await A.sync(cid)).epoch, await lostOpens(A, 'dave', old, cid, 1), await lost(cid)], [1, false, null], 'and the lost device still opens nothing');
  });
});

// A chat Pat is an admin of and Alice owns, where a removal writes no card: a group, or a public channel. Alice's page has pinned
// Pat's key. Pat removes a device; the lost device keeps the admin secret, and the server still takes it as the chat's admin key.
async function adminAfterRemoval(w, kind) {
  const cid = newCid(kind === 'group' ? 'g' : 'c'), A = await w.page('alice', { owner: true, build: adminBuild }), P = await w.page('pat'), L = await w.page('lost'); await w.page('carol');
  await makeChannel(A, cid, ['alice', 'pat', 'carol'], ['pat'], kind === 'group' ? 'group' : 'channel');
  if (kind === 'public') { await A.shown(cid); await A.setVisibility(cid, 'public'); await A.sync(cid); }
  await pin(A, 'pat');
  await P.sync(cid);
  const old = P.id, S0 = await P.adminSecret(await P.sync(cid)), lost = lostAt(L, { secret: S0 });
  assert.deepEqual([!!S0, P.S.db.chatLevel(cid)], [true, 'admin'], 'Pat is an admin, his device holds the admin secret');
  await newKeys(P);
  const rec = await removal(P, [{ cid, type: kind === 'group' ? 'group' : 'channel', vis: kind === 'public' ? 'public' : 'private', admin: true, admins: ['pat'], members: ['alice', 'pat', 'carol'], name: 'Club' }]);
  assert.deepEqual(rec.rotated, [{ cid, ok: true }], 'no card: nothing asks the owner\'s page');
  assert.ok(summary(P, rec).some((t) => t.startsWith('The removed device can still act as an admin of Club. Ask the owner to ')), 'the summary names the chat and says what to ask for');
  assert.deepEqual([await lost(cid), await lostUnwraps(A, 'pat', old, cid)], ['admin', true], 'before the steps: the admin secret the lost device holds is still the chat\'s admin key, and the record\'s wrap of it opens for its keys');
  const admins = async () => (kind === 'public' ? (await A.sync(cid)).admins : (await A.readOMeta(await A.sync(cid))).admins);
  return { cid, A, P, old, S0, lost, admins };
}

for (const kind of ['group', 'public']) test('A (' + (kind === 'group' ? 'a group' : 'a public channel') + '). the admin sentence\'s steps, in its order (the owner accepts the new security code, removes the person as an admin, makes them one again): Remove admin replaces the admin secret, so the one the lost device holds opens the chat at admin level no more, and Make admin hands a new one to the person\'s remaining device, which is an admin again', async () => {
  await world({}, async (w) => {
    const { cid, A, P, old, S0, lost, admins } = await adminAfterRemoval(w, kind);
    await accept(A, 'pat', cid);
    await A.setAdmins(cid, []);                                                      // Remove admin
    const S1 = A.unb64(A.ksGet(cid, 'a'));
    assert.deepEqual([await admins(), sameKey(S1, S0), await lost(cid), await lostUnwraps(A, 'pat', old, cid), await P.adminSecret(await P.sync(cid))], [[], false, null, false, null], 'Remove admin: a new admin secret for the owner alone; the lost device\'s gives no level any more');
    await A.setAdmins(cid, ['pat']);                                                 // Make admin
    const S2 = A.unb64(A.ksGet(cid, 'a'));
    assert.deepEqual([await admins(), sameKey(S2, S1), sameKey(S2, S0)], [['pat'], false, false], 'Make admin: Pat named again, under another new secret');
    assert.deepEqual([sameKey(await P.adminSecret(await P.sync(cid)), S2), P.S.db.chatLevel(cid)], [true, 'admin'], 'Pat\'s remaining device holds the new admin secret and is an admin at the server');
    assert.deepEqual([await lost(cid), await lostUnwraps(A, 'pat', old, cid)], [null, false], 'SHUT OUT: the admin secret the lost device holds opens the chat at no level, and no wrap of the new one opens for its keys');
  });
});

for (const kind of ['group', 'public']) test('A2 (' + (kind === 'group' ? 'a group' : 'a public channel') + '). why the accept comes first: removed as an admin and made one again BEFORE the owner accepted the new security code, the person is named an admin but holds no admin secret (the server gives their device member level), and accepting the code afterwards hands none over; Remove admin and Make admin once more, after the accept, does', async () => {
  await world({}, async (w) => {
    const { cid, A, P, old, S0, lost, admins } = await adminAfterRemoval(w, kind), plain = 'member';   // what the server gives a member who shows no admin key
    await A.setAdmins(cid, []);
    await A.setAdmins(cid, ['pat']);
    assert.deepEqual([await admins(), changed(A, 'pat'), await P.adminSecret(await P.sync(cid)), P.S.db.chatLevel(cid), await lost(cid), await lostUnwraps(A, 'pat', old, cid)], [['pat'], true, null, plain, null, false],
      'NAMED, NO SECRET: Pat is listed as an admin, but the new secret was wrapped for no device of his, and the server gives him no admin level; the lost device is out');
    await accept(A, 'pat', cid);
    assert.deepEqual([await admins(), await P.adminSecret(await P.sync(cid)), P.S.db.chatLevel(cid)], [['pat'], null, plain], 'NOT HEALED: the accept hands over chat keys only (rewrapFor), never the admin secret');
    await A.setAdmins(cid, []); await A.setAdmins(cid, ['pat']);
    assert.deepEqual([sameKey(await P.adminSecret(await P.sync(cid)), A.unb64(A.ksGet(cid, 'a'))), P.S.db.chatLevel(cid), sameKey(A.unb64(A.ksGet(cid, 'a')), S0), await lost(cid), await lostUnwraps(A, 'pat', old, cid)], [true, 'admin', false, null, false], 'the two steps again, after the accept: now he holds it, and the lost device is still out');
  });
});
