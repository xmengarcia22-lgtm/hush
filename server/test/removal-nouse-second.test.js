// Release 104, item 5 (SPEC.md 14.15): a second device removal after a first one whose owner step failed for a chat.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// Two cases, by what the first removal left behind (S1 and S1b: the owner key never replaced; S2: the owner key replaced, the
// admin secret not), and a control (S3). As in a real removal the page signs in afresh with the new keys (a new connection),
// and while a removal runs the page offers the owner key of the keys before first (capsFor).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, removal, draw, has, count, marks, MANAGE, BOX, oldOf, failCall, watchOwn, realCapsBuild, chatNote } from './removal-kit.js';

const chan = (cid) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'] });
const setup = async (w) => { const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob'); await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); return { A, cid }; };
// every chat.open the server answers for this chat, from any connection: the level it gave, or 'wrong'
const watchOpens = (w, cid) => { const st = w.T.srv.store, real = st.openChat.bind(st), seen = []; st.openChat = (a, actor) => { try { const r = real(a, actor); if (a.cid === cid) seen.push(r.level); return r; } catch (e) { if (a.cid === cid) seen.push(e.code === 'denied' ? 'wrong' : e.code); throw e; } }; return seen; };
const second = async (A) => { A.S.rekeying = true; await newKeys(A); };   // the second removal's key stage: rekeyRun sets S.rekeying before the keys change

test('S1 (a) the first removal never replaced the owner key. Until the next removal this device still opens the chat at owner level with the key before. The second removal forgets that key: both keys it offers are wrong, the step is refused, the mark stays, the owner right is gone from this account for good', async () => {
  await world({}, async (w) => {
    const { A, cid } = await setup(w); const dev1 = await oldOf(A, cid);
    await newKeys(A); const f = failCall(A, 'setOwner', ['timeout']);
    const rec1 = await removal(A, [chan(cid)]); f.undo();
    assert.equal(rec1.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]); assert.equal(level(w, cid, dev1.own), 'owner', 'the first removed device\'s owner key is still the chat\'s');
    // between the removals
    const seen = watchOpens(w, cid);
    assert.equal(await A.S.db.refreshChat(cid), true); assert.equal(A.S.db.chatLevel(cid), 'owner', 'this device: owner level, with the owner key of the keys before');
    assert.deepEqual(seen, ['wrong', 'owner'], 'the new owner key is tried first and is wrong, then the old one opens');
    const dev2own = await A.ownerCap(cid);   // what the SECOND removed device will hold
    seen.length = 0;
    await second(A); const o = watchOwn(A);
    const rec2 = await removal(A, [chan(cid)]);
    assert.equal(rec2.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid], 'the mark stays');
    const s = draw(A, rec2); assert.equal(s.box.filter((x) => BOX.test(x)).length, 1); assert.ok(!has(s, MANAGE)); assert.equal(count(s), '0 chats are secured.');
    assert.deepEqual(chatNote(A, cid).length, 1);
    assert.deepEqual([level(w, cid, dev1.own), level(w, cid, dev2own), level(w, cid, await A.ownerCap(cid)), level(w, cid, await A.ownerCapOld(cid))], ['owner', null, null, null], 'only the FIRST removed device holds the owner key now');
    assert.equal(level(w, cid, dev1.adm), 'admin', 'the admin secret was never replaced: both removed devices and this page hold it');
    assert.equal(o.seen.length, 1, 'the owner key is sent once'); assert.equal(o.seen[0][1], 'denied');
    assert.ok(seen.filter((x) => x === 'wrong').length >= 2, 'at least the two owner keys were refused');
    await assert.rejects(A.S.db.doc('channels/' + cid).delete(), (e) => e.code === 'denied', 'Delete for everyone is refused from here on');
    assert.notEqual(level(w, cid, dev1.own), 'nochat');
  });
});

test('S1b (a) between the removals the person can still delete the chat for everyone from this device', async () => {
  await world({}, async (w) => {
    const { A, cid } = await setup(w); const dev1 = await oldOf(A, cid);
    await newKeys(A); const f = failCall(A, 'setOwner', ['timeout']);
    const rec = await removal(A, [chan(cid)]); f.undo(); assert.equal(rec.rotated[0].own, 'error');   // a guard of the server's rule: the mark itself is S1's
    await A.S.db.doc('channels/' + cid).delete();
    assert.equal(level(w, cid, dev1.own), 'nochat', 'the chat is gone for everyone, the removed device included');
  });
});

test('S2 (b) the first removal replaced the owner key but not the admin secret. The second removal\'s owner step goes through: the admin secret is replaced, the mark comes off, and nothing a removed device holds opens the chat at owner or admin level', async () => {
  await world({}, async (w) => {
    const { A, cid } = await setup(w); const dev1 = await oldOf(A, cid);
    await newKeys(A); const f = failCall(A, 'setAdmins', ['timeout']);
    const rec1 = await removal(A, [chan(cid)]); f.undo();
    assert.equal(rec1.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]); assert.deepEqual([level(w, cid, dev1.own), level(w, cid, dev1.adm)], [null, 'admin']);
    const dev2own = await A.ownerCap(cid);
    const seen = watchOpens(w, cid);
    await second(A); const o = watchOwn(A);
    const rec2 = await removal(A, [chan(cid)]);
    assert.deepEqual(rec2.rotated, [{ cid, ok: true }]); assert.deepEqual(marks(A), [], 'the mark is taken off'); assert.equal(A.store.get('hush:noUse:alice'), '{}', 'the entry stays, empty');
    const s = draw(A, rec2); assert.ok(!s.box.some((x) => BOX.test(x)) && !has(s, MANAGE)); assert.equal(count(s), '1 chat is secured.'); assert.deepEqual(chatNote(A, cid), []);
    assert.deepEqual([level(w, cid, dev1.own), level(w, cid, dev1.adm), level(w, cid, dev2own), level(w, cid, await A.ownerCap(cid))], [null, null, null, 'owner']);
    assert.deepEqual(o.seen, [['owner', 'ok']], 'the owner key is sent once, at owner level');
    assert.ok(!seen.includes('wrong'), 'no wrong key: the owner key of the keys before is offered first while a removal runs');
  });
});

test('S3 the control: a chat whose owner step went through at the first removal goes through at the second too; never a mark', async () => {
  await world({}, async (w) => {
    const { A, cid } = await setup(w); const dev1 = await oldOf(A, cid);
    await newKeys(A); const rec1 = await removal(A, [chan(cid)]); assert.deepEqual(rec1.rotated, [{ cid, ok: true }]); assert.deepEqual(marks(A), []);
    await second(A); const rec2 = await removal(A, [chan(cid)]);
    assert.deepEqual(rec2.rotated, [{ cid, ok: true }]); assert.deepEqual(marks(A), []); assert.deepEqual([level(w, cid, dev1.own), level(w, cid, dev1.adm), level(w, cid, await A.ownerCap(cid))], [null, null, 'owner']);
    assert.equal(A.store.has('hush:noUse:alice'), false, 'two removals in which nothing failed store nothing new');
  });
});
