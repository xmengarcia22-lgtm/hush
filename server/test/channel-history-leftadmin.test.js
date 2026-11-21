// Release 92 (page), private channel history: an admin who leaves (SPEC.md 5.6 "Member cards" and "Key chain"; release 92 fix
// round 3). Until the owner's page acts on her leave she still holds the admin secret and is named in the signed admin list, so a
// modified app of hers can open a link made meanwhile and make a key change every page takes. The owner's page finds her own
// signed leave card at any epoch it still lives but a public one (another admin's page that acts on it leaves it there), replaces
// the admin secret, makes a key change of its own without her and only then signs the list without her, at its record's rt plus
// one, so an owner device the server kept from a later change brings no admin back; it starts from the list as it is by then, so
// an admin change made while it read the cards stands. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { b64u, world, makeChannel, linkOf } from './channel-history-kit.js';

// Helpers shared with the other channel-history files, copied as the removal tests do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const otherCid = (cid, n) => cid.slice(0, -1) + 'xyzw'[n];
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
const rowOf = async (X, cid, e) => { const s = await X.S.db.doc('channels/' + cid + '/chain/' + e).get(); return s.exists ? s.data() : null; };
const badkey = (e) => !!e && e.message === 'badkey';
// Add subscribers as its sheet runs it (openAddSubs): `hs` picked, Add pressed; the error line, empty when they were added.
const addSubs = async (X, cid, hs) => { X.S.pick = hs; X.S.convs = [await X.sync(cid)]; X.spy.els.length = 0; X.openAddSubs(cid);
  const go = X.spy.els.find((e) => e.tag === 'button'), err = X.spy.els.find((e) => e.cls === 'err'); await go.onclick(); return err.textContent; };
// f runs once, inside X's next read of `who`'s directory entry (readRoll reads each card author's before it acts)
const midRead = (X, who, f) => { const doc = X.S.db.doc; let n = 0;
  X.S.db.doc = (p) => { const d = doc(p); if (!n && p === 'directory/' + who) { n++; const g = d.get; d.get = async () => { await f(); return g(); }; } return d; };
  return () => { X.S.db.doc = doc; return n; }; };
async function plainOf(X, cid, m) {   // the plaintext of a channel's ometa, opened with the key X holds for its epoch
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}
// The departed admin's modified app: a key of her own at the next epoch, wrapped to v.members, with meta of her choosing, her
// signed commit and `back` holding the key before (junk without one). The server takes it: she still holds the admin key.
async function plant(X, cid, v, before) {
  const e = (await X.sync(cid)).epoch + 1, raw = new Uint8Array(randomBytes(32));
  await X.loadDir(v.members, true);
  await X.S.db.rotateChat(cid, { epoch: e, keys: await X.wrapAll(raw, v.members, cid, e), cap: await X.memberCapFrom(cid, e, raw), meta: await X.sealMeta(cid, e, raw, v), back: await X.chainRow(cid, e, raw, before || new Uint8Array(randomBytes(32))) });
  return raw;
}

test('64. an admin who leaves: another admin\'s page acts on it as before (one leave key change, no link carried, the admin secret and the list left to the owner) and leaves her card; until the owner\'s page acts she opens a link made meanwhile and plants a key of her own naming her again, which every page takes; the owner\'s next open, a leave key change a moment before notwithstanding, finds her card two key changes on, replaces the admin secret, makes a key change of its own without her and signs the list without her: her old secret opens no later link, she holds no key of the new epoch, every page seals under the owner\'s key, and her card is gone', async () => {
  await world({ limits: { leaveRotateGapMs: 15 * 60e3 } }, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), Y = await w.page('yuri'), B = await w.page('bob');
    await makeChannel(A, cid, ['alice', 'xena', 'yuri', 'bob'], ['xena', 'yuri']);
    for (const P of [A, X, Y, B]) await read(P, cid);
    await leave(X, cid);
    await Y.run(cid);
    assert.deepEqual([Y.spy.rotate.map((r) => r.why), 'invites' in Y.spy.rotate[0], Y.spy.admins.length, await X.holds(cid, 1)], [['leave'], false, 0, false], 'Yuri\'s page: one leave key change without her, no link carried, the admin secret left to the owner');
    assert.deepEqual([await A.cards(cid), (await A.readOMeta(await A.sync(cid))).admins], [['xena:leave'], ['xena', 'yuri']], 'her card stays for the owner\'s page, which alone writes the list');
    // the window: a link Yuri makes, under the admin secret she still holds, and a key of her own that names her again
    const l = await linkOf(Y, cid), cx = await X.sync(cid), a = await X.adminSecret(cx);
    assert.equal(b64u(await X.openAs(a, cid, l.iid, cx.invites[l.iid].as)), l.secret, 'she opens a link made meanwhile');
    const K1 = (await X.inviteRaws(cid, l))[1]; X.ksPut(cid, 1, K1);
    const m1 = await X.meta(cid), K2 = await plant(X, cid, { ...m1, members: [...m1.members, 'xena'], admins: ['xena', 'yuri'] }, X.unb64(K1));
    for (const P of [Y, B]) assert.ok(sameKey((await P.sealKey(await P.sync(cid), 2)).raw, K2), P.handle + '\'s page takes her key');
    // the owner's open
    A.spy.admins.length = 0; A.spy.rotate.length = 0; A.spy.chain.length = 0;
    await A.run(cid);
    const c = await A.sync(cid), K3 = keyOf(A, cid, 3);
    assert.deepEqual([A.spy.admins.length, A.spy.rotate.map((r) => r.why), A.spy.chain, c.epoch, (await plainOf(A, cid, c.ometa)).admins, (await A.meta(cid)).members], [1, [undefined], [], 3, ['yuri'], ['alice', 'yuri', 'bob']], 'a new admin secret, a key change of the owner\'s (not marked leave, so the leave window doesn\'t hold it back) and the list without her; no row of hers signed again');
    assert.equal((await A.openCommit(cid, 3, K3, (await rowOf(A, cid, 3)).c)).f, 'alice');
    for (const P of [Y, B]) { await read(P, cid); assert.deepEqual([sameKey((await P.sealKey(await P.sync(cid), 3)).raw, K3), P.rolesOf(cid).a], [true, ['yuri']], P.handle + ' seals under the owner\'s key'); }
    assert.equal(await X.holds(cid, 3), false, 'she holds no key of the new epoch');
    const l2 = await linkOf(Y, cid), c2 = await A.sync(cid);   // she can't open the record any more: the owner's copy of it
    assert.deepEqual([await X.adminSecret(c2), await X.openAs(a, cid, l2.iid, c2.invites[l2.iid].as)], [null, null], 'no wrap of the new admin secret is hers, and her old one opens no later link');
    assert.deepEqual(await A.cards(cid), [], 'her card is gone once applied');
    await A.run(cid);
    assert.deepEqual([A.spy.admins.length, A.spy.rotate.length], [1, 1], 'nothing more at the next open');
  });
});

test('65. the departed admin plants a key whose meta leaves her out (her row\'s key before is junk): the owner\'s page drops her by that as before, but no longer signs her key again; its own key change follows, so Bob seals under the owner\'s key and her key\'s commit, still hers, checks out on no page', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), Y = await w.page('yuri'); let B = await w.page('bob');
    await makeChannel(A, cid, ['alice', 'xena', 'yuri', 'bob'], ['xena', 'yuri']);
    for (const P of [A, X, Y, B]) await read(P, cid);
    await leave(X, cid);
    await Y.run(cid);
    const K2 = await plant(X, cid, { name: 'History', owner: 'alice', members: ['alice', 'yuri', 'bob'], admins: ['xena', 'yuri'], banned: [] });
    A.spy.admins.length = 0; A.spy.rotate.length = 0; A.spy.chain.length = 0;
    await A.run(cid);
    const c = await A.sync(cid), K3 = keyOf(A, cid, 3);
    assert.deepEqual([A.spy.admins.length, A.spy.rotate.length, A.spy.chain, c.epoch, (await plainOf(A, cid, c.ometa)).admins], [1, 1, [], 3, ['yuri']], 'a new admin secret, a key change of the owner\'s, the list without her, and her row not signed again');
    assert.equal((await A.openCommit(cid, 2, K2, (await rowOf(A, cid, 2)).c)).f, 'xena', 'her key keeps her own commit');
    B = await w.reload(B); const cb = await B.sync(cid); await read(B, cid);
    assert.deepEqual([cb.epoch, sameKey((await B.sealKey(cb, 3)).raw, K3)], [3, true], 'Bob seals under the owner\'s key');
    await assert.rejects(B.sealKey({ ...cb, epoch: 2 }, 2), (e) => !!e && e.message === 'rollback', 'the record of epoch 2 is below the mark his check of epoch 3 raised (release 93b, the epoch-rollback guard)');
    B.ls.set('hush:roles:bob', { ...B.ls.get('hush:roles:bob', {}), [cid]: { ...B.rolesOf(cid), hi: undefined } });   // the mark put aside (never the key check's cache), so the check below reaches her commit
    await assert.rejects(B.sealKey({ ...cb, epoch: 2 }, 2), badkey, 'and her key would no longer pass his check');
  });
});

test('66. an admin who leaves, the owner\'s page the first to act: the admin secret replaced and the links stopped, then a key change that fails leaves her named, her card in place and her leave not applied, and the next open does it all; with no room for a key change (toolarge) the current key is signed again as before and the list goes without her, at the record\'s rt plus one', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), Y = await w.page('yuri'); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'xena', 'yuri', 'bob'], ['xena', 'yuri']);
    await linkOf(A, cid);
    for (const P of [A, X, Y]) await read(P, cid);
    await leave(X, cid);
    A.spy.failRotate.push('offline');
    await A.run(cid);
    let c = await A.sync(cid);
    assert.deepEqual([A.spy.admins.length, A.spy.rotate.length, c.epoch, (await A.readOMeta(c)).admins, await A.cards(cid), Object.keys(c.invites || {})], [1, 1, 0, ['xena', 'yuri'], ['xena:leave'], []], 'the admin secret replaced and the links stopped; the key change failed, so she stays named and her card waits');
    assert.equal(await X.adminSecret(await X.sync(cid)), null, 'her admin key is gone already');
    await A.run(cid);
    c = await A.sync(cid);
    assert.deepEqual([A.spy.admins.length, A.spy.rotate.map((r) => r.why), c.epoch, (await A.readOMeta(c)).admins, (await A.meta(cid)).members, await A.cards(cid), await X.holds(cid, 1)], [2, [undefined, undefined], 1, ['yuri'], ['alice', 'yuri', 'bob'], [], false], 'tried again at the next open: a key change without her, then the list');
    await read(Y, cid);
    assert.ok(sameKey((await Y.sealKey(await Y.sync(cid), 1)).raw, keyOf(A, cid, 1)), 'Yuri seals under it');
    await A.run(cid);
    assert.deepEqual([A.spy.admins.length, A.spy.rotate.length], [2, 2], 'nothing more');

    const d = otherCid(cid, 0);
    await makeChannel(A, d, ['alice', 'xena', 'yuri'], ['xena', 'yuri']);
    for (const P of [A, X]) await read(P, d);
    await X.rotateTo(await X.sync(d), X.metaOf(await X.shown(d)));   // the current key (epoch 1) carries her commit
    const t = A.rolesOf(d).t;
    await leave(X, d);
    A.spy.chain.length = 0; A.spy.failRotate.push('toolarge');
    await A.run(d);
    const cd = await A.sync(d), o = await plainOf(A, d, cd.ometa);
    assert.deepEqual([cd.epoch, A.spy.chain, (await A.openCommit(d, 1, keyOf(A, d, 1), (await rowOf(A, d, 1)).c)).f, o.admins, o.rt], [1, [1], 'alice', ['yuri'], t + 1], 'toolarge: her commit signed again by the owner, then the list without her, just after the record\'s rt');
  });
});

test('67. an owner device the server keeps from a later admin change (served the older signed ometa) acts on an admin\'s leave: it replaces the admin secret at that older list\'s rt and signs the list without the leaver at that rt plus one, so no page that saw the change takes the older list back, and the admin dropped since holds no secret any page trusts', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), A2 = await w.page('alice', { owner: true, id: A.id });
    const [B, X, Y] = [await w.page('bob'), await w.page('xena'), await w.page('yuri')];
    await makeChannel(A, cid, ['alice', 'bob', 'xena', 'yuri'], ['bob', 'xena', 'yuri']);
    for (const P of [A, A2, B, X, Y]) await read(P, cid);
    const old = (await A.sync(cid)).ometa, o0 = await plainOf(A, cid, old);
    await A.shown(cid); await A.setAdmins(cid, ['bob', 'yuri']);   // the first device drops Xena
    for (const P of [B, X, Y]) await read(P, cid);
    const o1 = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([B.rolesOf(cid).a, X.rolesOf(cid).a, o1.rt > o0.rt + 1], [['bob', 'yuri'], ['bob', 'yuri'], true]);
    await leave(Y, cid);
    const c = await A2.sync(cid); A2.S.chatDocs.set(cid, { ...c, ometa: old });
    await A2.rollRun(A2.S.chatDocs.get(cid));
    const o2 = await plainOf(A2, cid, (await A2.freshChan(cid)).ometa);
    assert.deepEqual([A2.spy.admins.length, A2.spy.rotate.length, o2.rt, o2.admins], [1, 1, o0.rt + 1, ['bob', 'xena']], 'it acts, and signs the list without Yuri at the older list\'s rt plus one');
    for (const P of [A, B, X]) await read(P, cid);
    assert.deepEqual([A.rolesOf(cid).a, B.rolesOf(cid).a, X.rolesOf(cid).a, B.rolesOf(cid).h, X.rolesOf(cid).h], [['bob', 'yuri'], ['bob', 'yuri'], ['bob', 'yuri'], o1.ah, o1.ah], 'no page that saw the drop takes the older list back');
    assert.equal(await X.verifiedAdmin(await X.sync(cid)), null, 'and Xena holds no admin secret a page trusts');
  });
});

test('68. an admin change the owner makes while its page reads the cards stands: the drop of an admin who left starts from the list as it is by then, so an admin just made keeps the new key and gets the new admin secret, and one just removed isn\'t named again', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), Y = await w.page('yuri'), C = await w.page('carol'), D = await w.page('dave');
    await makeChannel(A, cid, ['alice', 'xena', 'yuri', 'carol', 'dave'], ['xena', 'yuri', 'dave']);
    for (const P of [A, X, Y, C, D]) await read(P, cid);
    await leave(X, cid);
    const undo = midRead(A, 'xena', async () => { await A.shown(cid); await A.setAdmins(cid, ['xena', 'yuri', 'carol']); });   // Make admin for Carol, Remove admin for Dave, on another screen
    await A.run(cid);
    assert.equal(undo(), 1, 'the change landed while the run read her card');
    const c = await A.sync(cid);
    assert.deepEqual([c.epoch, (await plainOf(A, cid, c.ometa)).admins, (await A.meta(cid)).members], [1, ['yuri', 'carol'], ['alice', 'yuri', 'carol', 'dave']], 'one key change without her; Carol stays named and listed, Dave stays out of the list of admins');
    for (const P of [C, D, Y]) await read(P, cid);
    assert.deepEqual([await C.holds(cid, 1), !!(await C.verifiedAdmin(await C.sync(cid))), await D.verifiedAdmin(await D.sync(cid)), Y.rolesOf(cid).a, await X.holds(cid, 1)], [true, true, null, ['yuri', 'carol'], false], 'Carol holds the new key and the admin secret, Dave holds no secret a page trusts, and Xena no new key');
  });
});

test('69. an admin\'s leave card at an epoch whose key went public (a channel made public, then private again) counts for nothing on the owner\'s page: anyone holding that key could have sealed it, the server too with a directory key it serves', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), Y = await w.page('yuri');
    await makeChannel(A, cid, ['alice', 'xena', 'yuri'], ['xena', 'yuri']);
    for (const P of [A, X, Y]) await read(P, cid);
    const d = await X.sealCard(await X.sync(cid), 'leave');   // a leave card at epoch 0, never sent: the server's own
    await A.shown(cid); await A.setVisibility(cid, 'public'); await A.sync(cid); await A.setVisibility(cid, 'private');
    assert.equal(await addSubs(A, cid, ['xena', 'yuri']), '', 'both subscribers again');
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));   // epoch 2: a card at 0 is two keys back, where only the owner's any-epoch rule reads it
    await A.run(cid);
    const c0 = await A.sync(cid);
    assert.deepEqual([c0.epoch, Object.keys(c0.openKeys || {}), A.rolesOf(cid).a], [2, ['0'], ['xena', 'yuri']]);
    await read(X, cid); await X.S.db.card(cid, 0, d.iv, d.ct);
    assert.deepEqual(await A.cards(cid), ['xena:leave']);
    A.spy.admins.length = 0; A.spy.rotate.length = 0;
    await A.run(cid);
    const c = await A.sync(cid);
    assert.deepEqual([A.spy.admins.length, A.spy.rotate.length, c.epoch, (await plainOf(A, cid, c.ometa)).admins], [0, 0, 2, ['xena', 'yuri']], 'she stays an admin, and nothing changes');
  });
});
