// Release 93b (page), owner decision D1: the owner's Repair of a private channel whose current key every page refuses (SPEC.md 5.6
// "The owner's repair"; SECURITY.md "fails closed on purpose"). A holder of a stale admin secret (a lost admin device, say) is at admin
// level at the server and can make a key change whose commit no page accepts (badkey), which freezes the channel. Repair, in Channel
// info, makes a fresh key change whose chain row carries only her signed commit and no `b` (the refused key is chained to nothing),
// wrapped to the list she confirms in the sheet (shown as this device holds it, her signed admins always; never taken as sealed under
// the refused key without her look), and replaces the admin secret in the same run, so the stale one opens the channel at no level any
// more. The backfill (ensureChain) and the owner's re-signing of the head (setAdmins) keep a repair row without `b`: once it is below
// the head, a row below it that passes the strict check must not make a page chain the refused key over it. Tests 156 to 158.
// The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lift, b64u, world, makeChannel, linkOf } from './channel-history-kit.js';

const all = { name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob'], members: ['alice', 'bob', 'gus'], banned: [] };
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
const hi = (X, cid) => (X.rolesOf(cid) || {}).hi;
const badkey = (e) => !!e && e.message === 'badkey';
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const rowOf = async (X, cid, e) => { const s = await X.S.db.doc('channels/' + cid + '/chain/' + e).get(); return s.exists ? s.data() : null; };
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const record = async (X, cid) => ({ id: cid, ...(await X.S.db.preview(cid)).data() });
// A page showing the server an admin secret of its own as its admin cap (the removal tests' lostDevice): a stranger holding a stale one.
const lostDevice = (L, S) => { L.adminSecret = async () => S; L.memberCap = async () => null; return async (cid) => { await L.S.db.refreshChat(cid); return L.S.db.chatLevel(cid); }; };
// The account's new keys as a device removal leaves them (the removal tests' newKeys): published at kv+1, this connection signed in again with them.
async function newKeys(X) {
  await X.rekeyIdentity(X.S.me); X.S.keys.clear(); X.S.chanKeys.clear();
  await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() });
  const sk = await crypto.subtle.importKey('jwk', X.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await X.S.db.prove(null);
  await X.S.db.prove({ h: X.handle, pub: X.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  await X.loadDir([X.handle], true);
}

test('156. a channel frozen by a stale admin secret (a stranger at admin level changes the key, wrapped to everyone and himself, his list naming himself) is repaired by the owner from the sheet: it lists who gets the fresh key as this device holds the list, her signed admin ticked and not for unticking, and names the cost once; she unticks him; the repair is a key change at a new epoch whose row is her signed commit alone (no b: the refused key is chained to nothing), wrapped to the list she confirmed, no link carried; the admin secret is replaced in the same run, so his stale one opens the channel at no level any more; members seal at the new epoch and the mark follows; he holds no key for it; a member\'s backfill and her own write no row over the repair row, a link still carries every key she holds, and the next key change chains on from the repaired key', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus'), M = await w.page('mal');
    await makeChannel(A, cid, all.members, all.admins);
    for (const P of [A, B, G]) await read(P, cid);
    assert.equal(await A.rotateTo(await A.sync(cid), all), 1);   // epoch 1, row 1
    assert.equal(await A.ensureChain(await A.sync(cid)), true, 'row 0 backfilled: chained');
    for (const P of [B, G]) assert.ok(await P.sealKey(await P.sync(cid), 1));
    assert.deepEqual([hi(A, cid), hi(B, cid), hi(G, cid)], [1, 1, 1]);
    // Mal, a stranger holding the channel's admin secret from before (a lost admin device, say) and its current key: admin level at the server, so a key change of his own
    const S0 = A.unb64(A.ksGet(cid, 'a')), malLevel = lostDevice(M, S0), who = [...all.members, 'mal'];
    M.ksPut(cid, 1, A.ksGet(cid, 1));
    assert.equal(await malLevel(cid), 'admin', 'the stale secret opens the channel at admin level');
    const Kx = crypto.getRandomValues(new Uint8Array(32)); await M.loadDir(who, true);
    await M.S.db.rotateChat(cid, { epoch: 2, keys: await M.wrapAll(Kx, who, cid, 2), cap: await M.memberCapFrom(cid, 2, Kx), meta: await M.sealMeta(cid, 2, Kx, { ...all, members: who }), back: await M.chainRow(cid, 2, Kx, keyOf(A, cid, 1)) });
    M.ksPut(cid, 2, M.b64(Kx));
    // frozen everywhere: his commit is signed by no owner or admin on record, and the refused key raises no mark
    for (const P of [A, B, G]) await assert.rejects(P.sealKey(await P.sync(cid), 2), badkey, P.handle + ' refuses the current key');
    assert.deepEqual([hi(A, cid), hi(B, cid), hi(G, cid)], [1, 1, 1], 'the refused key raised no mark');
    const shownA = await A.shown(cid);
    assert.deepEqual([...shownA.members].sort(), [...who].sort(), 'her device\'s copy of the list is the one sealed under the refused key: it names him');
    // the sheet: who gets the fresh key, as this device holds the list; her signed admin ticked and not for unticking; the cost named once
    A.S.convs = [shownA]; A.spy.els.length = 0;
    A.openRepair(cid);
    const boxes = A.spy.els.filter((e) => e.tag === 'input'), texts = A.spy.els.map((e) => e.textContent);
    assert.deepEqual(boxes.map((b) => [b.value, b.checked, b.disabled]).sort(), [['bob', true, true], ['gus', true, false], ['mal', true, false]], 'the list to check');
    assert.equal(texts.filter((t) => /won’t see posts from before the fix/.test(t)).length, 1, 'the cost, said once');
    boxes.find((b) => b.value === 'mal').checked = false;
    const go = A.spy.els.find((e) => e.textContent === 'Fix channel');
    A.spy.rotate.length = 0; A.spy.admins.length = 0; A.spy.toasts.length = 0;
    await go.onclick();
    assert.deepEqual(A.spy.toasts.map((t) => t[0]), ['Channel fixed. Invite link reset. Share a new one.'], JSON.stringify(A.spy.toasts));
    // the repair: epoch 3, its row her signed commit alone, the fresh key wrapped to the list she confirmed, no link carried
    assert.equal(A.spy.rotate.length, 1, 'one key change');
    const spec = A.spy.rotate[0];
    assert.deepEqual([spec.epoch, Object.keys(spec.back), spec.invites, Object.keys(spec.keys).length], [3, ['c'], undefined, 3], 'no b, no invites, three wraps');
    assert.deepEqual(await rowOf(A, cid, 3), spec.back);
    assert.deepEqual([...(await A.meta(cid)).members].sort(), ['alice', 'bob', 'gus'], 'the list she confirmed, sealed at the repair');
    assert.equal(hi(A, cid), 3, 'her mark follows the key she made');
    const o = await A.openCommit(cid, 3, keyOf(A, cid, 3), spec.back.c);
    assert.deepEqual([o.f, o.m], ['alice', 'full'], 'her commit');
    // the admin secret replaced in the same run and the list signed again naming it: his stale one opens the channel at no level any more
    const S1 = A.unb64(A.ksGet(cid, 'a'));
    assert.deepEqual([A.spy.admins, sameKey(S1, S0), await malLevel(cid)], [[cid], false, null], 'the secret replaced; the stale one opens nothing');
    // members seal at the new epoch and their marks follow; he holds no key for it
    for (const P of [B, G]) { const c3 = await P.sync(cid); assert.equal(P.epochOf(c3), 3); assert.equal((await P.sealPost(c3, 'after the repair')).e, 3, P.handle + ' seals at 3'); assert.equal(hi(P, cid), 3); }
    assert.equal(await M.convKey(await record(M, cid), 3), null, 'mal: no wrap at the repaired epoch');
    assert.ok(sameKey(await B.verifiedAdmin(await B.sync(cid)), S1), 'bob holds the new admin secret the signed list names');
    // a member's backfill after the repair writes no row over the repair row, nor does her own (the run from before the repair counts no more); a link still carries every key she holds
    for (const P of [B, A]) { P.spy.chain.length = 0; assert.equal(await P.ensureChain(await P.sync(cid)), false, P.handle + ': the chain does not reach below the repair'); assert.deepEqual([P.spy.chain, P.walkBad.has(cid)], [[], false], P.handle + ': nothing written, the history not called broken'); }
    assert.deepEqual(Object.keys(await rowOf(A, cid, 3)), ['c'], 'the repair row stands');
    const raws = await (await w.page('nina')).inviteRaws(cid, await linkOf(A, cid));
    assert.deepEqual(Object.keys(raws).sort(), ['0', '1', '2', '3'], 'a link made after the repair hands on every key she holds');
    // the next ordinary key change chains on from the repaired key
    await A.rotateTo(await A.sync(cid), all);
    const c4 = await B.sync(cid);
    assert.equal(B.epochOf(c4), 4); assert.ok(await B.sealKey(c4, 4), 'Bob takes the next key too');
    assert.ok(sameKey(await B.openBack(cid, 4, keyOf(B, cid, 4), (await rowOf(B, cid, 4)).b), keyOf(B, cid, 3)), 'row 4 chains the repaired key');
  });
});

test('157. the backfill never chains a key below a repair row, and the owner\'s re-signing of the head keeps it without b: an admin\'s key change that only her device refuses (his new code isn\'t accepted there) is repaired; he gets nothing from the repair; once she accepts, her next open hands him the new admin secret by itself, and Send access again hands him the repaired key; Remove admin while the repair row is the head signs it again without b; after the next key change the row below the repair row (his own commit) passes the strict head check on his page and on hers, and neither backfill writes a row over the repair row', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), C = await w.page('carl'), G = await w.page('gus');
    const v = { ...all, admins: ['bob', 'carl'], members: ['alice', 'bob', 'carl', 'gus'] };
    await makeChannel(A, cid, v.members, v.admins);
    for (const P of [A, B, C, G]) await read(P, cid);
    assert.equal(await A.rotateTo(await A.sync(cid), v), 1);
    assert.equal(await A.ensureChain(await A.sync(cid)), true, 'row 0 backfilled: chained');
    // her device pinned Bob's key (pinAll); his account gets new keys (a device removal); his key change at 2 checks out everywhere but on her device
    await A.loadDir(['bob'], true); A.S.pins = { bob: { ecdh: A.S.dir.bob.ecdh, sig: A.S.dir.bob.sig } };
    await newKeys(B);
    assert.equal(await B.rotateTo(await B.sync(cid), B.metaOf(await B.shown(cid))), 2);
    await A.loadDir(['bob'], true);
    assert.equal(A.S.dir.bob.kv, 2);
    await assert.rejects(A.sealKey(await A.sync(cid), 2), badkey, 'refused on her device: his new code isn\'t accepted there');
    for (const P of [C, G]) assert.ok(await P.sealKey(await P.sync(cid), 2), P.handle + ' takes it');
    // she repairs instead of accepting: epoch 3, the row without b; he gets no wrap (his code isn't accepted) and no admin secret
    A.spy.admins.length = 0;
    assert.equal(await A.repairKey(cid, ['carl', 'gus']), 3);
    assert.deepEqual([Object.keys(await rowOf(A, cid, 3)), A.spy.admins], [['c'], [cid]]);
    for (const P of [C, G]) assert.ok(await P.sealKey(await P.sync(cid), 3), P.handle + ' seals at the repaired epoch');
    assert.equal(await B.convKey(await record(B, cid), 3), null, 'nothing for Bob yet');
    // she accepts his new code: her next open replaces the admin secret for his new keys by itself (item 1b), and Resend keys hands him the repaired key (every key she holds: the chain stops at the repair row)
    A.S.pins.bob = { ecdh: A.S.dir.bob.ecdh, sig: A.S.dir.bob.sig }; A.S.chanKeys.clear();
    await A.run(cid);
    await A.resendKeys(cid, 'bob');
    const c3 = await B.sync(cid);
    assert.ok(await B.convKey(c3, 3), 'Bob holds the repaired key'); assert.ok(await B.verifiedAdmin(c3), 'and the admin secret the signed list names');
    assert.equal(B.S.db.chatLevel(cid), 'admin');
    // Remove admin while the repair row is the head: the owner signs the head again, and keeps it without b
    A.spy.chain.length = 0;
    await A.setAdmins(cid, ['bob']);
    assert.deepEqual([A.spy.chain, Object.keys(await rowOf(A, cid, 3))], [[3], ['c']], 'signed again without b');
    // the next key change chains on from the repaired key; the repair row is below the head now, and the row below it (his own commit, his current key, an admin on record) passes the strict check on his page and on hers: neither backfill writes a row over the repair row
    assert.equal(await A.rotateTo(await A.sync(cid), { ...v, admins: ['bob'], members: ['alice', 'bob', 'gus'] }), 4);
    for (const P of [B, A]) { const c4 = await P.sync(cid); assert.equal(P.epochOf(c4), 4);
      assert.ok(await P.convKey(c4, 2), P.handle + ' holds the key below the repair row');
      P.spy.chain.length = 0;
      assert.equal(await P.ensureChain(c4), false, P.handle + ': the chain does not reach below the repair');
      assert.deepEqual([P.spy.chain, P.walkBad.has(cid)], [[], false], P.handle + ': nothing written over the repair row'); }
    assert.deepEqual(Object.keys(await rowOf(A, cid, 3)), ['c'], 'the repair row stands');
    assert.deepEqual(Object.keys(await rowOf(A, cid, 4)).sort(), ['b', 'c'], 'row 4 chains the repaired key');
  });
});

test('158. Channel info offers Repair only to the owner of a private channel whose current key this device refuses: nothing on a key that checks out, nothing on a page that isn\'t the owner\'s, a group or a public channel; pressing it opens the sheet', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), Z = await w.page('zed');
    await makeChannel(A, cid, ['alice', 'bob']);
    for (const P of [A, B]) await read(P, cid);
    assert.equal(await A.rotateTo(await A.sync(cid), { ...all, admins: [], members: ['alice', 'bob'] }), 1);
    // openConvInfo sits among the app's screens and is not lifted: the one statement that offers Repair runs as it stands in ui.js, with the page's own sealKey and epochOf and openConvInfo's flags
    const line = lift('function openConvInfo(', 'function pickPhoto(').split('\n').find((l) => l.includes('openRepair(cid)'));
    assert.ok(line, 'openConvInfo has the Repair line');
    const gate = async (P, c, f) => { const made = [], opened = []; let p = null;
      const el = (tag, cls, text) => ({ tag, cls, textContent: text || '', append() {} }), html = (tag, cls, h) => ({ tag, cls, h, append() {}, onclick: null });
      new Function('owner', 'grp', 'pub', 'sealKey', 'epochOf', 'c', 'cid', 'body', 'html', 'I', 'el', 'close', 'openRepair', 'mark', line)(!!f.owner, !!f.grp, !!f.pub, (...a) => (p = P.sealKey(...a)), P.epochOf, c, c.id, { isConnected: true }, html, { key: '<svg/>' }, el, () => {}, (id) => opened.push(id), { before: (a) => made.push(a) });
      if (p) await p.catch(() => {}); await new Promise((r) => setTimeout(r, 50));
      for (const a of made) a.onclick();
      return [made.map((a) => /Fix channel/.test(a.h)), opened]; };
    const own = { owner: true }, c1 = await A.sync(cid);
    assert.deepEqual(await gate(A, c1, own), [[], []], 'a key that checks out: no Repair');
    // the head's commit replaced by a stranger's (a planted head, as test 140 plants it): refused on her page
    const bad = await Z.chainRow(cid, 1, keyOf(A, cid, 1), keyOf(A, cid, 0)); await A.S.db.chain(cid, 1, bad.b, bad.c);
    const A2 = await w.reload(A); await read(A2, cid); const c2 = await A2.sync(cid);
    await assert.rejects(A2.sealKey(c2, 1), badkey, 'frozen on her page');
    assert.deepEqual(await gate(A2, c2, own), [[true], [cid]], 'the owner of a private channel whose key this device refuses: Repair, and pressing it opens the sheet');
    assert.deepEqual(await gate(A2, c2, { owner: false }), [[], []], 'not on a page that isn\'t the owner\'s');
    assert.deepEqual(await gate(A2, c2, { owner: true, grp: true }), [[], []], 'not on a group');
    assert.deepEqual(await gate(A2, c2, { owner: true, pub: true }), [[], []], 'not on a public channel');
    await assert.rejects(B.sealKey(await B.sync(cid), 1), badkey, 'frozen on Bob\'s page too');
    assert.deepEqual(await gate(B, await B.sync(cid), { owner: false }), [[], []], 'a member\'s page: nothing');
  });
});

test('159. the owner\'s confirmation wins over the list sealed under the refused key (the fresh review\'s S1): before the freeze the owner blocked zed, in the sealed list and at the server; a lost admin device\'s page blocks the real admin bob and the subscriber gus the same two ways (the server\'s block, then a key change every page refuses whose list marks them blocked); the sheet shows bob and gus ticked and says nothing of blocks; she unticks only the stranger and presses Repair: the fresh key is wrapped to her, bob and gus, the sealed list names them as members and keeps zed\'s block alone, the server\'s blocks on them are lifted after the admin secret is replaced (bob can act as an admin again once his page reads the new secret, gus is a member again), mal and zed stay out, the toast is the usual one, and her next open keeps bob an admin', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus'), M = await w.page('mal');
    const blocked = (h) => w.T.srv.store.isBanned(cid, h), level = async (P) => { await P.S.db.refreshChat(cid); return P.S.db.chatLevel(cid); }, denied = (e) => !!e && e.code === 'denied';
    await makeChannel(A, cid, all.members, all.admins);
    for (const P of [A, B, G]) await read(P, cid);
    // before the freeze the owner blocked zed: the sealed list and the server agree
    assert.equal(await A.rotateTo(await A.sync(cid), { ...all, banned: ['zed'] }), 1);
    await A.S.db.banChat(cid, 'zed', true);
    for (const P of [B, G]) assert.ok(await P.sealKey(await P.sync(cid), 1));
    // Mal, a lost admin device's page (the stale admin secret, the current key) at admin level: "Block from this channel" on bob and gus, the server's block first as kickMember places it, then a key change every page refuses, its list marking them blocked
    const S0 = A.unb64(A.ksGet(cid, 'a')), malLevel = lostDevice(M, S0), who = [...all.members, 'mal'];
    M.ksPut(cid, 1, A.ksGet(cid, 1));
    assert.equal(await malLevel(cid), 'admin', 'the stale secret opens the channel at admin level');
    for (const h of ['bob', 'gus']) await M.S.db.banChat(cid, h, true);
    const Kx = crypto.getRandomValues(new Uint8Array(32)); await M.loadDir(who, true);
    await M.S.db.rotateChat(cid, { epoch: 2, keys: await M.wrapAll(Kx, who, cid, 2), cap: await M.memberCapFrom(cid, 2, Kx), meta: await M.sealMeta(cid, 2, Kx, { ...all, members: who, banned: ['bob', 'gus', 'zed'] }), back: await M.chainRow(cid, 2, Kx, keyOf(A, cid, 1)) });
    M.ksPut(cid, 2, M.b64(Kx));
    await assert.rejects(A.sealKey(await A.sync(cid), 2), badkey, 'frozen on her page');
    const shownA = await A.shown(cid);
    assert.deepEqual([[...shownA.members].sort(), [...shownA.banned].sort()], [['alice', 'bob', 'gus', 'mal'], ['bob', 'gus', 'zed']], 'her copy of the list is the planter\'s, its banned list included');
    // the server: gus's member key is refused; bob's admin key still opens the chat (the server ties it to no account) but his admin actions are refused while the block stands; the stale secret is an admin
    assert.deepEqual([await level(B), await level(G), await malLevel(cid), ['bob', 'gus', 'zed'].map(blocked)], ['admin', null, 'admin', [true, true, true]], 'bob and gus blocked at the server, and zed from before');
    await assert.rejects(B.S.db.banChat(cid, 'zed', true), denied, 'an admin the server blocks can act no more');
    // the sheet: bob and gus ticked (nothing says they are blocked), mal ticked; she unticks mal alone
    A.S.convs = [shownA]; A.spy.els.length = 0;
    A.openRepair(cid);
    const boxes = A.spy.els.filter((e) => e.tag === 'input');
    assert.deepEqual(boxes.map((b) => [b.value, b.checked, b.disabled]).sort(), [['bob', true, true], ['gus', true, false], ['mal', true, false]], 'the sheet shows bob and gus as keeping access');
    boxes.find((b) => b.value === 'mal').checked = false;
    A.spy.rotate.length = 0; A.spy.admins.length = 0; A.spy.ban.length = 0; A.spy.toasts.length = 0;
    await A.spy.els.find((e) => e.textContent === 'Fix channel').onclick();
    assert.deepEqual(A.spy.toasts.map((t) => t[0]), ['Channel fixed. Invite link reset. Share a new one.'], JSON.stringify(A.spy.toasts));
    // the repair: one key change at 3 wrapped to her, bob and gus; the sealed list names them as members and keeps only the block from before the freeze; the admin secret replaced once
    const spec = A.spy.rotate[0], m = await A.meta(cid);
    assert.deepEqual([A.spy.rotate.length, spec.epoch, Object.keys(spec.keys).length, [...m.members].sort(), m.banned, A.spy.admins], [1, 3, 3, ['alice', 'bob', 'gus'], ['zed'], [cid]], 'three wraps; the list she confirmed, with zed\'s block alone; the secret replaced');
    // the server's blocks on the people she confirmed are lifted; zed's stands, and the stale secret opens nothing
    assert.deepEqual([await level(B), await level(G), await malLevel(cid), ['bob', 'gus', 'zed'].map(blocked)], ['admin', 'member', null, [false, false, true]], 'bob an admin again (his page reads the new secret), gus a member; mal and zed stay out');
    await B.S.db.banChat(cid, 'zed', true);
    assert.deepEqual(A.spy.ban.sort(), [['bob', false], ['gus', false]], 'the two blocks lifted from her connection, no other');
    for (const P of [B, G]) { assert.ok(await P.holds(cid, 3), P.handle + ' holds the repaired key'); assert.equal((await P.sealPost(await P.sync(cid), 'after the repair')).e, 3, P.handle + ' seals at 3'); }
    assert.equal(await M.convKey(await record(M, cid), 3), null, 'mal: no wrap at the repaired epoch');
    // her next open keeps bob an admin (he is listed and not blocked), and the lists as repaired
    await A.run(cid);
    const after = await A.shown(cid);
    assert.deepEqual([after.admins, [...after.members].sort(), after.banned], [['bob'], ['alice', 'bob', 'gus'], ['zed']], 'her next open keeps bob an admin and the lists as repaired');
  });
});
