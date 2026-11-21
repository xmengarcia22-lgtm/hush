// Release 104, item 5 (SPEC.md 14.15): what the holder of a removed device can still do in a marked chat, and what not.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// With the old owner key (O1), with the old admin secret (O2), what becomes of the chat's invite links (O3), and that a chat
// made AFTER the removal is made from the new account secret alone (O4). These are the facts the sentences rest on.
// The server runs with powerNeedsSecure on, as live: an owner or admin key from an account without the secured mark gives member level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf, pageFor } from './channel-history-kit.js';
import { level, newKeys, removal, marks, oldOf, failCall, realCapsBuild } from './removal-kit.js';

const chan = (cid) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'] });
const setup = async (w) => { const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob'); await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid);
  await A.S.db.doc('secure/alice').set({ ts: Date.now() }); w.T.srv.limits.powerNeedsSecure = true; return { A, cid, id1: A.id, dev1: await oldOf(A, cid) }; };
const denied = (p, what) => assert.rejects(p, (e) => e.code === 'denied', what);
// the holder of the removed device, signed in to an account of its own, offering one key the device held
const holder = async (w, cid, cap) => { const M = await w.page('mallory'); M.spy.capsFor = async () => [cap]; return M; };

test('O1 the owner key was never replaced (the chat that K3 marks). From any account of its own the removed device\'s holder opens the chat at owner level with the old owner key, once that account carries the secured mark any account sets for itself; it then blocks a member, replaces the admin secret, changes a setting, takes the owner key and deletes the chat. It never gets the new chat key', async () => {
  await world({}, async (w) => {
    const { A, cid, id1, dev1 } = await setup(w);
    await newKeys(A); const f = failCall(A, 'setOwner', ['timeout']); const rec = await removal(A, [chan(cid)]); f.undo();
    assert.equal(rec.rotated[0].own, 'error'); assert.equal(rec.rotated[0].ok, true);
    const c1 = await A.sync(cid); assert.equal(A.epochOf(c1), 1, 'the key change went through'); assert.equal(Object.keys(c1.invites || {}).length, 0, 'no invite link is open: the key change reset them');
    const M = await holder(w, cid, dev1.own);
    assert.equal(await M.S.db.refreshChat(cid), true); assert.equal(M.S.db.chatLevel(cid), 'member'); assert.deepEqual(M.spy.power, [[cid, 'owner']], 'held back: the account is not secured');
    await M.S.db.doc('secure/mallory').set({ ts: Date.now() });
    await M.S.db.refreshChat(cid); assert.equal(M.S.db.chatLevel(cid), 'owner', 'owner level, from an account that is no member');
    // it reads the whole record, sealed; the new chat key opens for the account's current keys and not for the removed device's
    const d = (await M.S.db.doc('channels/' + cid).get()).data(), doc = { id: cid, ...d }; assert.ok(d.keys && d.meta && d.akeys, 'the record whole, as the server keeps it (sealed)');
    const dir = { alice: A.S.dir.alice, bob: A.S.dir.bob };
    const now = await pageFor(null, 'alice', { id: A.S.me }); now.S.dir = dir; assert.ok(await now.convKey(doc, 1), 'control: a page with the account\'s current keys and an empty key store unwraps the new chat key');
    const old = await pageFor(null, 'alice', { id: id1 }); old.S.dir = dir; assert.equal(await old.convKey(doc, 1), null, 'the removed device\'s keys unwrap nothing of it');
    old.S.dir = { alice: { ...dir.alice, ecdh: id1.ecdh, sig: id1.sig }, bob: dir.bob }; old.S.keys.clear(); old.S.chanKeys.clear(); assert.equal(await old.convKey(doc, 1), null, 'nor with the profile as it knew it');
    // what the server lets it do at owner level
    await M.S.db.banChat(cid, 'bob', true); assert.equal(w.T.srv.store.isBanned(cid, 'bob'), true, 'it blocked a member');
    await M.S.db.doc('channels/' + cid).update({ invites: null }); await M.S.db.doc('channels/' + cid).update({ ttl: 86400 }); assert.equal(w.T.srv.store._chatDoc(cid).doc.ttl, 86400, 'it changed a setting only the owner may change (the message timer)');
    await M.S.db.setAdmins(cid, {}, 'm'.repeat(43)); assert.equal(level(w, cid, dev1.adm), null, 'it replaced the admin secret: the admins are out');
    await M.S.db.setOwner(cid, await M.ownerCap(cid)); assert.equal(level(w, cid, dev1.own), null);
    assert.equal(await A.S.db.refreshChat(cid), true); assert.equal(A.S.db.chatLevel(cid), 'member', 'the real owner is left at member level');
    await denied(A.S.db.doc('channels/' + cid).delete(), 'and cannot delete the chat any more');
    await M.S.db.refreshChat(cid); await M.S.db.doc('channels/' + cid).delete(); assert.equal(level(w, cid, dev1.own), 'nochat', 'it deleted the chat for everyone');
  });
});

test('O2 the owner key was replaced, the admin secret was not (the chat that K4 marks). With the old admin secret the holder gets admin level: it blocks a member and stops links; it cannot take the owner key, replace the admin secret, change the owner\'s settings or delete the chat', async () => {
  await world({}, async (w) => {
    const { A, cid, dev1 } = await setup(w);
    await newKeys(A); const f = failCall(A, 'setAdmins', ['timeout']); const rec = await removal(A, [chan(cid)]); f.undo();
    assert.equal(rec.rotated[0].own, 'error'); assert.deepEqual([level(w, cid, dev1.own), level(w, cid, dev1.adm)], [null, 'admin']);
    const M = await holder(w, cid, dev1.adm); await M.S.db.doc('secure/mallory').set({ ts: Date.now() });
    assert.equal(await M.S.db.refreshChat(cid), true); assert.equal(M.S.db.chatLevel(cid), 'admin');
    await M.S.db.banChat(cid, 'bob', true); assert.equal(w.T.srv.store.isBanned(cid, 'bob'), true);
    await M.S.db.doc('channels/' + cid).update({ invites: null });
    await denied(M.S.db.setOwner(cid, await M.ownerCap(cid)), 'the owner key'); await denied(M.S.db.setAdmins(cid, {}, 'm'.repeat(43)), 'the admin secret');
    await denied(M.S.db.doc('channels/' + cid).update({ ttl: 86400 }), 'an owner setting'); await denied(M.S.db.doc('channels/' + cid).delete(), 'the chat');
    assert.equal(level(w, cid, await A.ownerCap(cid)), 'owner', 'the owner key stays the account\'s new one');
    const M2 = await w.page('nokey'); M2.spy.capsFor = async () => [dev1.own]; assert.equal(await M2.S.db.refreshChat(cid), false, 'the old owner key opens nothing');
  });
});

test('O3 this account was refused at every level it needs (someone took the owner key first; the page is left at member level): the key change fails too and the chat\'s open invite link STAYS open, because stopping it needs admin level', async () => {
  await world({}, async (w) => {
    const { A, cid } = await setup(w); const other = await pageFor(null, 'zed'); await A.S.db.setOwner(cid, await other.ownerCap(cid));
    assert.equal(Object.keys((await A.sync(cid)).invites || {}).length, 1);
    await newKeys(A); const rec = await removal(A, [chan(cid)]);
    assert.equal(rec.rotated[0].own, 'error'); assert.equal(rec.rotated[0].skip, 'error'); assert.deepEqual(marks(A), [cid]);
    const inv = (w.T.srv.store._chatDoc(cid).doc || {}).invites || {};
    assert.equal(Object.keys(inv).length, 1, 'the link is still open');
  });
});

test('O4 a chat made after the removal is made from the new account secret: its owner key is the new one, and the removed device\'s secrets give no owner key, no admin secret and no chat key for it (a group and a private channel)', async () => {
  await world({}, async (w) => {
    const { A, cid, id1 } = await setup(w);
    await newKeys(A); const f = failCall(A, 'setOwner', ['timeout']); await removal(A, [chan(cid)]); f.undo();
    await A.loadDir(['alice', 'bob'], true);
    for (const [id2, type] of [['gN' + w.cid.slice(2), 'group'], ['cN' + w.cid.slice(2), 'channel']]) {
      await A.createChatDoc(id2, type, 'private', { name: 'Team again', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice', 'bob'], banned: [] });
      const old = await pageFor(null, 'alice', { id: id1 }), now = await pageFor(null, 'alice', { id: A.S.me }), dir = { alice: A.S.dir.alice, bob: A.S.dir.bob };
      assert.equal(level(w, id2, await A.ownerCap(id2)), 'owner', 'the owner key comes from the new account secret');
      assert.equal(level(w, id2, await old.ownerCap(id2)), null, 'the owner key the removed device can work out for this chat opens nothing');
      const d = w.T.srv.store._chatDoc(id2).doc, doc = { id: id2, ...d };
      now.S.dir = dir; assert.ok(await now.convKey(doc, 0), 'control: the current keys unwrap the chat key');
      for (const view of [dir, { alice: { ...dir.alice, ecdh: id1.ecdh, sig: id1.sig }, bob: dir.bob }]) { old.S.dir = view; old.S.keys.clear(); old.S.chanKeys.clear(); assert.equal(await old.convKey(doc, 0), null, 'the removed device unwraps no chat key (' + type + ')'); }
      if (d.akeys) { const sec = await now.adminSecret(doc).catch(() => null), osec = await old.adminSecret(doc).catch(() => null); assert.ok(sec, 'control: the current keys unwrap the admin secret'); assert.equal(osec, null, 'the removed device does not'); }
      assert.ok(!marks(A).includes(id2), 'the new chat carries no mark');
    }
  });
});
