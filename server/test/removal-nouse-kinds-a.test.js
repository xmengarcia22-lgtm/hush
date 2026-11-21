// Release 104, item 5 (SPEC.md 14.15): how the owner step of a device removal can end, K1 to K5.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// Each test asserts what the record, the server, the mark and the summary say. K1 and K5 guard what stays as it was (through;
// "too fast" and "offline" waited out); K2 to K4 are the failures that are marked. K6 to K8 are in removal-nouse-fresh.test.js,
// K9 to K15 in removal-nouse-kinds-b.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, removal, draw, has, count, marks, MANAGE, BOX, READ, oldOf, failCall, watchOwn, realCapsBuild } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const setup = async (w, build = realCapsBuild()) => { const { cid } = w; const A = await w.page('alice', { owner: true, build }); await w.page('bob'); await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); return { A, cid, old: await oldOf(A, cid) }; };
const marked = (A, rec, cid, why) => { const s = draw(A, rec); assert.equal(rec.rotated[0].own, 'error', why); assert.deepEqual(marks(A), [cid], 'the mark is set');
  assert.deepEqual(s.box.filter((x) => BOX.test(x)), ['Couldn’t secure these chats: ' + (rec.chats[0].name) + '. A device you removed may still have control there. Don’t use them any more. Start new chats with the same people.']);
  assert.ok(!has(s, MANAGE) && !has(s, READ) && !s.btn, 'no "may still be able to manage" line, not on the grey line, no button'); assert.equal(count(s), '0 chats are secured.'); return s; };
const clean = (A, rec, cid) => { const s = draw(A, rec); assert.deepEqual(marks(A), [], 'no mark'); assert.ok(!s.box.some((x) => BOX.test(x)) && !has(s, MANAGE) && !s.btn, 'no box, no line, no button'); return s; };

test('K1 through: a private channel of today. Nothing recorded, no mark, counted as secured; what the removed device held opens nothing', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A); const o = watchOwn(A);
    const rec = await removal(A, [chan(cid)]);
    assert.deepEqual(rec.rotated, [{ cid, ok: true }]); const s = clean(A, rec, cid); assert.equal(count(s), '1 chat is secured.');
    assert.deepEqual(o.seen, [['owner', 'ok']]); assert.deepEqual(o.fresh.filter((x) => x[0] === false), []);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm), level(w, cid, await A.ownerCap(cid))], [null, null, 'owner']);
    assert.equal(A.store.has('hush:noUse:alice'), false, 'a removal in which nothing failed stores nothing new');
  });
});

test('K2 a lost reply at the owner key (it landed, the answer never came): marked. The removed device\'s owner key is dead, its admin secret still opens the chat at admin level', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A); const f = failCall(A, 'setOwner', ['lost']);
    const rec = await removal(A, [chan(cid)]);
    marked(A, rec, cid, 'a time-out is a failure, and nothing is tried again'); assert.equal(f.calls.length, 1, 'one call, no retry');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm), level(w, cid, await A.ownerCap(cid))], [null, 'admin', 'owner']);
  });
});

test('K3 a time-out before the owner key was sent: marked. The removed device\'s owner key still gives owner level', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A); failCall(A, 'setOwner', ['timeout']);
    const rec = await removal(A, [chan(cid)]);
    marked(A, rec, cid, 'failed'); assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], ['owner', 'admin']);
  });
});

test('K4 the owner key lands, the admin secret does not (a code the page does not wait out): marked', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A); failCall(A, 'setAdmins', ['timeout']);
    const rec = await removal(A, [chan(cid)]);
    marked(A, rec, cid, 'failed'); assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, 'admin']);
  });
});

test('K5 "too fast" and "offline" are waited out as today (not failures): through, no mark', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A); const f = failCall(A, 'setOwner', ['ratelimit', 'offline']);
    const rec = await removal(A, [chan(cid)]);
    assert.deepEqual(rec.rotated, [{ cid, ok: true }]); clean(A, rec, cid); assert.equal(f.calls.length, 3); assert.equal(level(w, cid, old.own), null);
  });
});
