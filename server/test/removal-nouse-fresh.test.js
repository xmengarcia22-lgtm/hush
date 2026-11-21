// Release 104, item 5 (SPEC.md 14.15): the owner step of a device removal is refused while the chat is open, K6 to K8.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// A refusal of the owner key says nothing by itself: the first open of a group with no readable signed list is at admin level.
// So the step opens the chat afresh with every key the page holds. Owner level: it runs again (three times at most). No answer:
// waited out like any dropped call. An open that answered below owner level is the refusal, and the chat is marked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf, pageFor } from './channel-history-kit.js';
import { level, newKeys, removal, draw, has, marks, MANAGE, BOX, READ, oldOf, watchOwn, realCapsBuild, makeOldGroup } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const setup = async (w, build = realCapsBuild()) => { const { cid } = w; const A = await w.page('alice', { owner: true, build }); await w.page('bob'); await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); return { A, cid, old: await oldOf(A, cid) }; };
const clean = (A, rec, cid) => { const s = draw(A, rec); assert.deepEqual(marks(A), [], 'no mark'); assert.ok(!s.box.some((x) => BOX.test(x)) && !has(s, MANAGE) && !s.btn, 'no box, no line, no button'); return s; };

test('K6 a private group with no signed list, opened at admin level first: refused, the fresh open answers at owner level, the step runs again and goes through. No mark', async () => {
  await world({}, async (w) => {
    const cid = 'g' + w.cid.slice(1), A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob');   // a group is made at a group's address (release 107)
    await makeOldGroup(A, cid, ['alice', 'bob'], ['bob']); const old = await oldOf(A, cid);
    await newKeys(A); const o = watchOwn(A);
    const rec = await removal(A, [chan(cid, { type: 'group', name: 'Old group' })]);
    assert.deepEqual(rec.rotated, [{ cid, ok: true }]); clean(A, rec, cid);
    assert.deepEqual(o.seen, [['admin', 'denied'], ['owner', 'ok']]);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm), level(w, cid, await A.ownerCap(cid))], [null, null, 'owner']);
  });
});

test('K7 the same group, and the fresh open gets NO answer (the server\'s wrong-key limit, used up by another connection of the same address): waited out, then through. No mark', async () => {
  await world({ limits: { openFailsPerMin: 3 } }, async (w) => {
    const cid = 'g' + w.cid.slice(1), A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob'); const Z = await w.page('zed');   // as K6: a group's address
    await makeOldGroup(A, cid, ['alice', 'bob'], ['bob']); const old = await oldOf(A, cid);
    await newKeys(A);
    const so = A.S.db.setOwner, rf = A.S.db.refreshChat, seen = [], fresh = []; let burnt = false;
    A.S.db.setOwner = async (c, cap) => { try { const r = await so(c, cap); seen.push('ok'); return r; } catch (e) { seen.push(e.code);
      if (e.code === 'denied' && !burnt) { burnt = true; Z.spy.capsFor = async () => ['x'.repeat(43), 'y'.repeat(43), 'z'.repeat(43), 'w'.repeat(43)]; await Z.S.db.refreshChat(cid).catch(() => {}); } throw e; } };
    A.S.db.refreshChat = async (c) => { const r = await rf(c); fresh.push([r, A.S.db.chatLevel(c)]); return r; };
    const rec = await removal(A, [chan(cid, { type: 'group', name: 'Old group' })]);
    assert.ok(fresh.some((x) => x[0] === false), 'a fresh open got no answer'); assert.deepEqual(rec.rotated, [{ cid, ok: true }]); clean(A, rec, cid);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, await A.ownerCap(cid))], [null, 'owner']);
  });
});

test('K8 an answered refusal: someone replaced the owner key first. Refused, the fresh open answers below owner level: marked', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); const other = await pageFor(null, 'zed'); await A.S.db.setOwner(cid, await other.ownerCap(cid));
    await newKeys(A); const o = watchOwn(A);
    const rec = await removal(A, [chan(cid)]);
    assert.equal(rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]); const s = draw(A, rec); assert.equal(s.box.filter((x) => BOX.test(x)).length, 1); assert.ok(!has(s, MANAGE) && !has(s, READ), 'named once: in the box, not on the grey line');
    assert.deepEqual(o.fresh, [[true, 'member']], 'one fresh open, ANSWERED below owner level (the new account keys unwrap no admin secret yet, so member level)'); assert.equal(o.seen.length, 1, 'the owner key is not sent again');
    assert.equal(level(w, cid, await other.ownerCap(cid)), 'owner');
  });
});
