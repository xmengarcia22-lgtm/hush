// Release 92 (page), private channel history: links holding one key (SPEC.md 5.3 `invites`, 5.6 "Join by link", "Invite
// someone") and links that survive leaves (5.6 "Links across a key change", "Remove or ban"). The page harness is
// channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { lift, mkBuild, build, b64u, offline, world, makeChannel, linkOf } from './channel-history-kit.js';

// Helpers shared with channel-history-page.test.js, copied as the removal tests do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const otherCid = (cid, n) => cid.slice(0, -1) + 'xyzw'[n];
// A key change as a page from before the chain made one: no row (the server takes it while the channel has none).
async function oldRotate(A, cid) {
  const c = await A.sync(cid), v = A.metaOf(await A.showMeta(c)), e = A.epochOf(c) + 1, raw = crypto.getRandomValues(new Uint8Array(32));
  await A.loadDir(v.members, true);
  await A.S.db.rotateChat(cid, { epoch: e, keys: await A.wrapAll(raw, v.members, cid, e), cap: await A.memberCapFrom(cid, e, raw), meta: await A.sealMeta(cid, e, raw, v) });
  A.ksPut(cid, e, A.b64(raw)); return e;
}
const badkey = (e) => !!e && e.message === 'badkey';
const dirOf = (X) => ({ handle: X.handle, ecdh: X.id.ecdh, sig: X.id.sig, kv: 1 });
// A key change as a server could plant one (sent here through the owner's connection): the next epoch under Kx, wrapped to
// `members`, with meta and an ometa naming `admins` under Kx (the ometa signed by the puppet's page, not the owner's), and its
// row signed by the puppet, who holds the key before.
async function plantEpoch(A, Pp, cid, Kx, members, admins) {
  const c = await A.sync(cid), e = A.epochOf(c) + 1, v = A.metaOf(await A.showMeta(c));
  assert.ok(await Pp.holds(cid, e - 1)); await A.loadDir(members, true);
  const back = await Pp.chainRow(cid, e, Kx, keyOf(Pp, cid, e - 1));
  await A.S.db.rotateChat(cid, { epoch: e, keys: await A.wrapAll(Kx, members, cid, e), cap: await A.memberCapFrom(cid, e, Kx), meta: await A.sealMeta(cid, e, Kx, v), back });
  await A.S.db.doc('channels/' + cid).update({ ometa: await Pp.sealOMeta(cid, e, Kx, { ...v, admins }) });
  return e;
}

// ---- links holding one key (SPEC.md 5.3 `invites`, 5.6 "Join by link"; release 92 slice 4) ----

// The release-90 page's joinPrivate, verbatim from adeb006 (app/ui.js lines 936-944): what a tab left open since then runs
// when it joins. Kept here rather than read with git, so the test runs without the repository's history.
const JOIN90 = `async function joinPrivate(cid,j){
  const raws=await inviteRaws(cid,j);
  const wraps={};for(const [e,r] of Object.entries(raws)){wraps[e]=await wrapKey(unb64(r),S.me.handle,cid,Number(e));ksPut(cid,e,r)}
  await S.db.joinChat(cid,j.iid,await joinProof(j.secret,cid,j.iid),wraps); // proves the link to the server and files our own wraps
  const full=await freshChan(cid);noteChatDoc(full);await S.db.refreshChat(cid);
  try{await S.db.collection('channels/'+cid+'/posts').add(await sealSvc(full,'join',0))}catch{} // members (and an admin, who writes us into the list) see we joined
  await dropPointer(S.me.handle,{t:'invite',cid,from:S.me.handle,type:typeOf(full)});
  S.previews.set(cid,await showMeta(full));openConv(cid);
}`;
const build90 = mkBuild(JOIN90);
const packet = (X, j) => X.inviteRaws(j.cid, j);   // what a link hands out, as a page about to join reads it
const wrapsAt = async (X, cid) => Object.fromEntries(Object.entries((await X.sync(cid)).keys).map(([e, m]) => [e, Object.keys(m).length]));   // wraps per epoch
const rotate = async (X, cid) => X.rotateTo(await X.sync(cid), X.metaOf(await X.shown(cid)));
// A second device of X's account, trusted, on the profile as X's page sees it; X's page gets a device of its own too. Both
// entries are signed by the account key.
async function twoDevices(X) {
  X.S.ids = []; const other = await X.ensureDev({ ...X.id, handle: X.handle });
  X.S.ids = []; await X.ensureDev(X.S.me); X.S.me.trust = [other.id];
  X.S.dir[X.handle] = { ...dirOf(X), devs: { [other.id]: X.devEntry(other) } };
  return other;
}
// Every update of a chat record X's page sends from here on.
const updatesOf = (X) => { const out = [], doc = X.S.db.doc; X.S.db.doc = (p) => { const d = doc(p), u = d.update; d.update = (v) => { out.push(v); return u(v); }; return d; }; return out; };

test('16. a channel link holds the current key alone ({ e: k }, one entry); a link holding every key (from before release 92, or made while the chain could not be checked) still joins; a release-90 page joins with a release-92 link; a group link still holds every key', async () => {
  await world({}, async (w) => {
    const { cid } = w; let A = await w.page('alice', { owner: true }); const B = await w.page('bob'), C = await w.page('carol'), O = await w.page('olaf', { build: build90 });
    await makeChannel(A, cid, ['alice']);
    await rotate(A, cid); await rotate(A, cid);   // epoch 2, its rows 1 and 2 written by the key changes
    const j = await linkOf(A, cid), K = [0, 1, 2].map((e) => A.b64(keyOf(A, cid, e)));
    assert.deepEqual(await packet(B, j), { 2: K[2] }, 'one entry: the current epoch and its key');
    assert.deepEqual(A.spy.chain, [0], 'the chain was made whole first (row 0, missing, backfilled)');
    let n = await wrapsAt(A, cid);
    await B.joinPrivate(cid, j);
    assert.deepEqual(await wrapsAt(A, cid), { ...n, 2: n[2] + 1 }, 'the joiner wrapped the current key alone');
    // A tab left open since release 90 reads the same map, wraps its one key and joins.
    n = await wrapsAt(A, cid);
    await O.joinPrivate(cid, j);
    assert.deepEqual(await wrapsAt(A, cid), { ...n, 2: n[2] + 1 });
    const O2 = await w.page('olaf', { id: O.id });   // another device of the same account: its key comes from that wrap
    assert.ok(sameKey((await O2.convKey(await O2.sync(cid), 2)).raw, keyOf(A, cid, 2)), 'the release-90 page\'s wrap opens');

    // A link holding every key, as a release-90 admin's page makes one, or as this one does while the chain can't be read.
    A = await w.reload(A); const mget = A.S.db.mgetChat; A.S.db.mgetChat = async () => { throw offline(); };
    const jAll = await linkOf(A, cid); A.S.db.mgetChat = mget;
    assert.deepEqual(await packet(C, jAll), { 0: K[0], 1: K[1], 2: K[2] }, 'every key held');
    n = await wrapsAt(A, cid); C.S.db.mgetChat = async () => { throw offline(); };   // no walk: the older keys can come from the link alone
    await C.joinPrivate(cid, jAll);
    assert.deepEqual(await wrapsAt(A, cid), { ...n, 2: n[2] + 1 }, 'the joiner still wraps the current key alone');
    for (const e of [0, 1, 2]) assert.equal(C.ksGet(cid, e), K[e], 'and keeps every key the link held: ' + e);

    // A group's link holds every key, as before.
    const g = 'g' + cid.slice(1);
    await A.createChatDoc(g, 'group', 'private', { name: 'G', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice'], banned: [] });
    await rotate(A, g); await rotate(A, g);
    assert.deepEqual(Object.keys(await packet(C, await linkOf(A, g))).sort(), ['0', '1', '2']);
  });
});

test('17. a channel joiner wraps the current key alone, for each of their devices, and notes them as wrapped, so syncWraps doesn\'t wrap it again; a link made for another epoch is read once more, then refused as out of date, and the join sheet says so', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), E = await w.page('erin'), F = await w.page('fred');
    await makeChannel(A, cid, ['alice']);
    await rotate(A, cid); await rotate(A, cid);
    const e2 = await twoDevices(E), j = await linkOf(A, cid); await twoDevices(F);
    let n = await wrapsAt(A, cid);
    await E.joinPrivate(cid, j);
    assert.deepEqual(await wrapsAt(A, cid), { ...n, 2: n[2] + 2 }, 'two wraps, one per device, both of the current key');
    const noted = E.ls.get('hush:wrapped:erin', {})[cid];
    assert.deepEqual([Object.keys(noted), [...noted[2]].sort()], [['2'], [E.S.me.dev.id, e2.id].sort()], 'noted as wrapped for both devices');
    // syncWraps, as opening the chat runs it: the keys before it, walked back through the chain, go to the other device as
    // before release 92; the current one, wrapped at the join, doesn't go again.
    const se = updatesOf(E);
    await E.syncWraps(await E.shown(cid));
    assert.deepEqual(se.map((v) => Object.keys(v.keys).sort()), [['0', '1']], 'no wrap of the current key');
    // Without the note (what a join left before), the current key would go to the other device a second time.
    await F.joinPrivate(cid, j); F.ls.set('hush:wrapped:fred', null);
    const sf = updatesOf(F);
    await F.syncWraps(await F.shown(cid));
    assert.deepEqual(sf.map((v) => Object.keys(v.keys).sort()), [['0', '1', '2']]);

    // A link carried across a key change: Gina's and Hank's pages read it a moment before, when it held the key of epoch 2;
    // the record is at 3 by now, and its copy of the link re-sealed for the new key (as a carrying key change leaves it).
    const G = await w.page('gina'), H = await w.page('hank');
    const j3 = await linkOf(A, cid), was = await G.S.db.inviteBlob(cid, j3.iid), { ph, ts } = (await A.sync(cid)).invites[j3.iid];
    await rotate(A, cid);
    const iv = randomBytes(12), ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await A.inviteKey(Buffer.from(j3.secret, 'base64url'), cid, j3.iid), Buffer.from(JSON.stringify({ 3: A.b64(keyOf(A, cid, 3)) })));
    await A.S.db.doc('channels/' + cid).update({ invites: { [j3.iid]: { iv: A.b64(iv), ct: A.b64(ct), ph, ts } } });
    const stale = (X, times) => { const real = X.S.db.inviteBlob; let k = 0; X.S.db.inviteBlob = async (...a) => (k++ < times ? was : real(...a)); return { reads: () => k, undo: () => { X.S.db.inviteBlob = real; } }; };
    const sg = stale(G, 1); n = await wrapsAt(A, cid);
    await G.joinPrivate(cid, j3);
    assert.equal(sg.reads(), 2, 'read once more');
    assert.deepEqual(await wrapsAt(A, cid), { ...n, 3: n[3] + 1 }, 'joined at the record\'s epoch');
    const sh = stale(H, 2), joins = [], join = H.S.db.joinChat; H.S.db.joinChat = async (...a) => { joins.push(a[0]); return join(...a); };
    await assert.rejects(H.joinPrivate(cid, j3), (e) => e.code === 'stale');
    assert.deepEqual([sh.reads(), joins], [2, []], 'read twice, then refused before any join');
    sh.undo();
    // The join sheet's error line: out of date, and a channel with no room left for the joiner's wraps.
    const press = async (X) => { X.spy.els.length = 0; X.confirmJoin({ id: cid, type: 'channel', name: 'History' }, j3);
      const go = X.spy.els.find((e) => e.tag === 'button'), err = X.spy.els.find((e) => e.cls === 'err'); await go.onclick(); return err.textContent; };
    const s2 = stale(H, 2);
    assert.equal(await press(H), 'This invite link is out of date. Ask for a new one.');
    s2.undo(); H.S.db.joinChat = async () => { throw Object.assign(new Error('toolarge'), { code: 'toolarge' }); };
    assert.equal(await press(H), 'This channel has no room for you right now. Ask an admin to add you.');
  });
});

// Add subscribers as its sheet runs it (openAddSubs): `hs` picked, Add pressed; the error line, empty when they were added.
const addSubs = async (X, cid, hs) => { X.S.pick = hs; X.S.convs = [await X.sync(cid)]; X.spy.els.length = 0; X.openAddSubs(cid);
  const go = X.spy.els.find((e) => e.tag === 'button'), err = X.spy.els.find((e) => e.cls === 'err'); await go.onclick(); return err.textContent; };

test('18. Add and Resend hand on the current key alone once the chain reaches every key held (ensureChain), every key otherwise, and nothing under a current key whose commit doesn\'t check out', async () => {
  await world({}, async (w) => {
    const { cid } = w; let A = await w.page('alice', { owner: true }); const B = await w.page('bob'); await w.page('carol'); await w.page('dave'); await w.page('erin');
    await makeChannel(A, cid, ['alice', 'bob']);
    await rotate(A, cid); await rotate(A, cid);
    const K = [0, 1, 2].map((e) => A.b64(keyOf(A, cid, e)));
    assert.deepEqual(await A.handRaws(await A.sync(cid)), { 2: K[2] }, 'the current key alone');
    let n = await wrapsAt(A, cid);
    assert.equal(await addSubs(A, cid, ['carol']), '');
    assert.deepEqual(await wrapsAt(A, cid), { ...n, 2: n[2] + 1 }, 'Add: one wrap, of the current key');
    assert.ok((await A.meta(cid)).members.includes('carol'), 'and listed');
    n = await wrapsAt(A, cid);
    await A.resendKeys(cid, 'bob');
    assert.deepEqual(await wrapsAt(A, cid), { ...n, 2: n[2] + 1 }, 'Resend: one wrap, of the current key');

    // The chain can't be read (offline, on a fresh load): every key, as before.
    A = await w.reload(A); const mget = A.S.db.mgetChat; A.S.db.mgetChat = async () => { throw offline(); };
    assert.deepEqual(await A.handRaws(await A.sync(cid)), { 0: K[0], 1: K[1], 2: K[2] }, 'every key held');
    n = await wrapsAt(A, cid);
    assert.equal(await addSubs(A, cid, ['dave']), '');
    assert.deepEqual(await wrapsAt(A, cid), { 0: n[0] + 1, 1: n[1] + 1, 2: n[2] + 1 }, 'Add: every key');
    n = await wrapsAt(A, cid);
    await A.resendKeys(cid, 'bob');
    assert.deepEqual(await wrapsAt(A, cid), { 0: n[0] + 1, 1: n[1] + 1, 2: n[2] + 1 }, 'Resend: every key');
    A.S.db.mgetChat = mget;

    // A gap the chain can't bridge: a channel from before the chain at epoch 5, with no wrap of epoch 3 for this device and
    // only the keys of 4 and 5 opened so far. The wraps of 0 to 2 would still open, so every key goes, as allRaws gave it;
    // once nothing below the gap opens, the current key alone.
    const g = otherCid(cid, 1);
    await makeChannel(A, g, ['alice']);
    for (let i = 0; i < 5; i++) await oldRotate(A, g);
    const G = [0, 1, 2, 3, 4, 5].map((e) => A.b64(keyOf(A, g, e))), gr = await A.sync(g);
    const forget = async () => { const m = A.ls.get('hush:ks:alice', {}); for (const e of [0, 1, 2, 3]) delete m[g][e]; A.ls.set('hush:ks:alice', m); A = await w.reload(A); };
    await forget();
    assert.deepEqual(await A.handRaws({ ...gr, keys: { ...gr.keys, 3: {} } }), { 0: G[0], 1: G[1], 2: G[2], 4: G[4], 5: G[5] }, 'every key this device can open');
    await forget();
    assert.deepEqual(await A.handRaws({ ...gr, keys: { ...gr.keys, 0: {}, 1: {}, 2: {}, 3: {} } }), { 5: G[5] }, 'nothing below the gap opens');

    // A current key the server planted, with a row a subscriber signed: no link, Add or Resend hands it on.
    await A.shown(cid); await A.rolesQ.get(cid);
    await plantEpoch(A, B, cid, randomBytes(32), ['alice', 'bob'], ['bob']);
    const c3 = await A.sync(cid); n = await wrapsAt(A, cid);
    await assert.rejects(A.handRaws(c3), badkey);
    await assert.rejects(A.resendKeys(cid, 'bob'), badkey);
    await assert.rejects(A.createInvite(cid), badkey);
    assert.equal(await addSubs(A, cid, ['erin']), 'Couldn’t add them. Check your connection and try again.');
    assert.deepEqual([await wrapsAt(A, cid), Object.keys((await A.sync(cid)).invites || {}).length], [n, 0], 'nothing wrapped, no link');
  });
});

const notfound = (e) => !!e && e.code === 'notfound';
const secretOf = (l) => Buffer.from(l.secret, 'base64url');

test('19. a channel link carries `as`, so another admin\'s device rebuilds the same link from the record (the newest first) and can revoke it; a link without `as`, or one sealed under another secret, isn\'t rebuilt; a page without the admin secret makes no channel link', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), B = await w.page('bob');
    await makeChannel(A, cid, ['alice', 'xena', 'bob'], ['xena']);
    const l1 = await linkOf(A, cid), l2 = await linkOf(A, cid), rec = await A.sync(cid), a = A.unb64(A.ksGet(cid, 'a'));
    for (const l of [l1, l2]) {
      assert.equal(Buffer.from(rec.invites[l.iid].as, 'base64').length, 44, 'iv, the 16-byte secret and the tag');
      assert.equal(b64u(await A.openAs(a, cid, l.iid, rec.invites[l.iid].as)), l.secret, 'it opens to the link\'s secret');
    }
    assert.equal(await A.openAs(a, cid, l1.iid, rec.invites[l2.iid].as), null, 'only under its own link id');
    assert.equal(await A.openAs(a, otherCid(cid, 1), l2.iid, rec.invites[l2.iid].as), null, 'and its own channel');
    const got = await X.keptLink(await X.sync(cid));
    assert.equal(X.linkFor(cid, got), A.linkFor(cid, l2), 'another admin\'s device: the same link, the newest');
    assert.deepEqual(X.ls.get('hush:inv:' + cid), { iid: l2.iid, secret: l2.secret, h: 'xena' }, 'kept for its invite sheet');
    const A2 = await w.page('alice', { id: A.id, owner: true });   // the owner's account on a page that never saw the link
    assert.equal(A2.linkFor(cid, await A2.keptLink(await A2.sync(cid))), A.linkFor(cid, l2));
    await X.revokeInvite(cid, got.iid);
    assert.deepEqual(Object.keys((await A.sync(cid)).invites), [l1.iid], 'Revoke works for a link another admin made');
    assert.equal(X.linkFor(cid, await X.keptLink(await X.sync(cid))), A.linkFor(cid, l1), 'then the older one shows');
    await A.S.db.doc('channels/' + cid).update({ invites: { [l1.iid]: { as: A.b64(randomBytes(44)) } } });
    assert.equal(await X.keptLink(await X.sync(cid)), null, 'an `as` that doesn\'t open');
    await A.S.db.doc('channels/' + cid).update({ invites: { [l1.iid]: { as: await A.sealAs(randomBytes(32), cid, l1.iid, secretOf(l1)) } } });
    assert.equal(await X.keptLink(await X.sync(cid)), null, 'one sealed under another admin secret');
    await A.S.db.doc('channels/' + cid).update({ invites: { [l1.iid]: { as: await A.sealAs(a, cid, l1.iid, randomBytes(32)) } } });
    assert.equal(await X.keptLink(await X.sync(cid)), null, 'one that opens to something else than a 16-byte secret');
    await A.S.db.doc('channels/' + cid).update({ invites: { [l1.iid]: { as: null } } });
    assert.equal(await X.keptLink(await X.sync(cid)), null, 'one without `as` (a release-90 page\'s)');
    assert.equal(await B.keptLink(await B.sync(cid)), null, 'a subscriber holds no admin secret');
    await assert.rejects(B.createInvite(cid), (e) => e.message === 'nokey');
    assert.deepEqual(Object.keys((await A.sync(cid)).invites), [l1.iid], 'and made no link');
  });
});

test('20. a leave\'s key change carries every link with `as`, its proof unchanged and sealed for the new key alone, and the old URL still joins; a link without `as` is gone; one revoked meanwhile: once more from a fresh record, then with no links; a removal and a dev card carry none', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true });
    const [F, G, H, I, J] = [await w.page('fay'), await w.page('gina'), await w.page('hank'), await w.page('ivan'), await w.page('june')]; await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob', 'fay', 'hank', 'ivan']);
    const l0 = await linkOf(A, cid);
    await A.S.db.doc('channels/' + cid).update({ invites: { [l0.iid]: { as: null } } });   // a link from before release 92
    const l1 = await linkOf(A, cid), l2 = await linkOf(A, cid), was = (await A.sync(cid)).invites;
    await leave(F, cid);
    await A.run(cid);
    assert.deepEqual([A.spy.rotate.length, A.spy.rotate[0].why], [1, 'leave']);
    const sent = A.spy.rotate[0].invites;
    assert.deepEqual(Object.keys(sent).sort(), [l1.iid, l2.iid].sort(), 'every link with `as`');
    for (const l of [l1, l2]) {
      const x = sent[l.iid];
      assert.deepEqual([x.ph, x.ts, x.as], [was[l.iid].ph, was[l.iid].ts, was[l.iid].as], 'the same link: its proof, time and `as`');
      assert.notEqual(x.ct, was[l.iid].ct);
      assert.deepEqual(await packet(J, l), { 1: A.b64(keyOf(A, cid, 1)) }, 'sealed for the new key alone');
    }
    assert.deepEqual(Object.keys((await A.sync(cid)).invites).sort(), [l1.iid, l2.iid].sort());
    await assert.rejects(packet(J, l0), notfound, 'the link without `as` is gone');
    assert.equal(A.ls.get('hush:inv:' + cid).iid, l2.iid, 'the owner\'s page still shows its link');
    await G.joinPrivate(cid, l1);
    assert.equal(await G.holds(cid, 1), true, 'chat.invite and chat.join with the old URL, at the new epoch');

    // l1 revoked by another page after this one read the record: the server refuses the carry, a fresh record carries l2.
    await leave(H, cid);
    await A.sync(cid);
    await A.S.db.doc('channels/' + cid).update({ invites: { [l1.iid]: null } });
    await A.rollRun(await A.showMeta(A.S.chatDocs.get(cid)));
    assert.deepEqual(A.spy.rotate.slice(1).map((r) => Object.keys(r.invites || {}).sort()), [[l1.iid, l2.iid].sort(), [l2.iid]], 'refused, then once more from the fresh record');
    assert.equal((await A.sync(cid)).epoch, 2);
    assert.deepEqual(Object.keys((await A.sync(cid)).invites), [l2.iid]);
    assert.deepEqual(await packet(J, l2), { 2: A.b64(keyOf(A, cid, 2)) });

    // refused twice: the key change goes ahead with no links
    await leave(I, cid);
    A.spy.failRotate = ['invalid', 'invalid'];
    await A.run(cid);
    assert.deepEqual(A.spy.rotate.slice(3).map((r) => Object.keys(r.invites || {})), [[l2.iid], [l2.iid], []], 'once more, then with none');
    assert.equal((await A.sync(cid)).epoch, 3);
    assert.deepEqual(Object.keys((await A.sync(cid)).invites || {}), []);
    await assert.rejects(packet(J, l2), notfound);
    assert.equal(A.ls.get('hush:inv:' + cid, null), null, 'and the owner\'s page forgets its link');

    // a removal carries none, and neither does a dev card's key change
    const l3 = await linkOf(A, cid); let n = A.spy.rotate.length;
    await A.kickMember(cid, 'bob');
    assert.deepEqual([A.spy.rotate.length - n, 'invites' in A.spy.rotate[n]], [1, false], 'a removal');
    await assert.rejects(packet(J, l3), notfound);
    const l4 = await linkOf(A, cid); n = A.spy.rotate.length;
    A.kv.gina = 2; await G.writeCard(await G.sync(cid), 'dev');
    await A.run(cid);
    assert.deepEqual([A.spy.rotate.length - n, A.spy.rotate[n].why, 'invites' in A.spy.rotate[n]], [1, 'leave', false], 'a lost device');
    await assert.rejects(packet(J, l4), notfound);
  });
});

test('21. adding an admin seals every `as` again under the new admin secret (the link itself unchanged); dropping one with setAdmins, or acting on an adm card, stops every open link', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), Y = await w.page('yuri'); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'xena', 'yuri', 'bob']);
    const l1 = await linkOf(A, cid), l2 = await linkOf(A, cid), was = (await A.sync(cid)).invites, a0 = A.unb64(A.ksGet(cid, 'a'));
    assert.equal(await A.setAdmins(cid, ['xena']), false, 'adding stops no link, so "Make admin" says nothing of links');
    const rec = await A.sync(cid), a1 = await X.adminSecret(await X.sync(cid));
    assert.ok(a1 && !sameKey(a0, a1), 'a new admin secret, which Xena opens');
    for (const l of [l1, l2]) {
      const x = rec.invites[l.iid];
      assert.deepEqual([x.iv, x.ct, x.ph, x.ts], [was[l.iid].iv, was[l.iid].ct, was[l.iid].ph, was[l.iid].ts], 'the link itself unchanged');
      assert.equal(b64u(await A.openAs(a1, cid, l.iid, x.as)), l.secret, 'its `as` opens under the new secret');
      assert.equal(await A.openAs(a0, cid, l.iid, x.as), null, 'not under the old one');
    }
    assert.equal(X.linkFor(cid, await X.keptLink(rec)), A.linkFor(cid, l2), 'so the new admin\'s device shows the link');
    assert.equal(A.ls.get('hush:inv:' + cid).iid, l2.iid);

    assert.equal(await A.setAdmins(cid, []), true, 'dropping one says the open links stopped, for "Remove admin"\'s toast');
    assert.deepEqual([(await A.readOMeta(await A.sync(cid))).admins, Object.keys((await A.sync(cid)).invites || {})], [[], []], 'Xena dropped: every link stopped');
    assert.equal(A.ls.get('hush:inv:' + cid, null), null);
    await assert.rejects(packet(Y, l1), notfound);

    assert.equal(await A.setAdmins(cid, ['yuri']), false);
    await A.sync(cid);                                          // the record as the chat watch delivers it, so the next one is a drop
    assert.equal(await A.setAdmins(cid, []), false, 'a drop with no open link stops none');
    assert.deepEqual((await A.readOMeta(await A.sync(cid))).admins, [], 'and it was a drop');
    await A.setAdmins(cid, ['yuri']);
    const l3 = await linkOf(A, cid);
    await Y.writeCard(await Y.sync(cid), 'adm');                // Yuri removed a device: the lost one holds the admin secret
    const n = A.spy.admins.length;
    await A.run(cid);
    assert.equal(A.spy.admins.length, n + 1, 'a new admin secret');
    assert.deepEqual([(await A.readOMeta(await A.sync(cid))).admins, Object.keys((await A.sync(cid)).invites || {})], [['yuri'], []], 'Yuri stays an admin; every link stopped');
    await assert.rejects(packet(X, l3), notfound);
    assert.deepEqual(await A.cards(cid), [], 'the adm card is deleted once applied');
    const l4 = await linkOf(A, cid);
    assert.deepEqual(Object.keys((await A.sync(cid)).invites), [l4.iid], 'a new link works');
  });
});

test('21. "Remove admin" whose setAdmins stopped open links: its toast, which replaces rotateAdmins\' own, says so and offers "New link"; otherwise it names the change alone', async () => {
  const src = lift("act(isAdm?'Remove admin':'Make admin',", ",'adm'));"), named = lift('async function toggleAdmin(', '\n}\n') + '\n}\n'; // release 105: the button's write has a name of its own, so it is cut out with the button
  const press = async (isAdm, stopped) => {
    const toasts = [], made = [];
    await new Function('act', 'isAdm', 'confirm', 'c', 'h', 'cid', 'setAdmins', 'close', 'toast', 'toastErr', 'displayName', 'openConvInfo', 'openInvite', named + 'return ' + src + ')')(
      (label, fn) => fn, isAdm, () => true, { admins: isAdm ? ['xena'] : [] }, 'xena', 'cX', async () => stopped, () => {}, (...a) => toasts.push(a),
      (...a) => toasts.push(['failed', ...a]), (x) => 'Xena', () => {}, (...a) => made.push(a))();
    const t = toasts.at(-1); if (t[2]) t[2]();
    return [toasts.length, t[0], t[1], t[3], made];
  };
  assert.deepEqual(await press(true, true), [1, 'Xena is no longer an admin. Open invite links stopped working.', 'New link', 8000, [['cX', { auto: true }]]]);
  assert.deepEqual(await press(true, false), [1, 'Xena is no longer an admin', undefined, undefined, []]);
  assert.deepEqual(await press(false, false), [1, 'Xena is now an admin', undefined, undefined, []]);
});

test('22. a link read is cleared from the address bar, NAV\'s history state kept: at boot right after the hash is read, and in hashchange, which hands on the hash it read before clearing (signed out, it is kept in memory)', () => {
  assert.match(lift('const hj=', '\n'), /^const hj=\/join=\|add=\/\.test\(location\.hash\)\?location\.hash:null;dropHash\(\);/, 'at boot, before either branch');
  const location = { hash: '', pathname: '/app/', search: '?v=2' }, calls = [], joins = [], on = {}, S = { me: { handle: 'alice' }, pendingJoin: null };
  const history = { state: { nav: 3 }, replaceState: (s, t, u) => { calls.push([s, t, u]); location.hash = ''; } };
  const dropHash = new Function('location', 'history', 'S', 'handleJoin', 'addEventListener', lift('const dropHash=', '\n') + '\n' + lift("addEventListener('hashchange',", '\n') + '\nreturn dropHash;')(
    location, history, S, (h) => joins.push([h, location.hash]), (k, fn) => { on[k] = fn; });
  location.hash = '#settings'; dropHash();
  assert.deepEqual([calls.length, location.hash], [0, '#settings'], 'at boot, a fragment that is no link stays');
  const link = '#join=cAbcdef12.iNvItE000001.' + 'x'.repeat(22);
  location.hash = link; on.hashchange();
  assert.deepEqual(joins, [[link, '']], 'handleJoin gets the link, the address bar no longer has it');
  assert.deepEqual(calls, [[{ nav: 3 }, '', '/app/?v=2']], 'cleared once, with the history state as it was');
  location.hash = '#add=bob_1'; on.hashchange();
  assert.deepEqual([joins[1], calls.length], [['#add=bob_1', ''], 2]);
  location.hash = '#settings'; on.hashchange();
  assert.deepEqual([joins.length, calls.length, location.hash], [2, 2, '#settings'], 'anything else stays');
  S.me = null; location.hash = '#join=cAbcdef12'; on.hashchange();
  assert.deepEqual([joins.length, calls.length, S.pendingJoin, location.hash], [2, 3, '#join=cAbcdef12', ''], 'signed out: in memory only');
});
