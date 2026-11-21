// Release 104, item 5 (SPEC.md 14.15): the "out of date" error in the middle of a device removal, V1 to V4.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// The error PAUSES the removal. It marks nothing and files nothing. The error is the real server's own answer (`version`) to a
// reconnect's hello (the kit's versionGate); the page's adapter then closes for good. Afterwards a fresh page over the same
// store, on a connection the server accepts, goes on and finishes.
// The stop sentence then reads "Removing the device stopped (this copy of Hush is out of date). Close Hush and open it again to
// finish it." (the owner's decision of 2026-11-13, F6 of the fix round). Before, the brackets held the adapter's own sentence,
// which ends "Reload the page.": two instructions in one sheet. The adapter's error itself is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, draw, has, count, marks, newKeys, BOX, READ, MANAGE, oldOf, failDoc, realCapsBuild, run, until, within, drop, STOPPED, OUT_OF_DATE, OUT_DATED, versionGate, reload } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const other = () => 'cH' + randomBytes(8).toString('hex').slice(0, 11);
// the page's connection is closed by the server and its reconnect is refused as out of date: from here on the adapter is closed for good
const die = async (w, gate, A) => { gate.on = true; drop(w, 'alice'); await until(() => A.S.db.error, 20000); gate.on = false; };
const paused = (A, r, n = 0) => { assert.deepEqual(r.fails, [STOPPED(OUT_DATED)], 'the words for a run that stopped, with the approved reason in the brackets (the owner\'s decision of 2026-11-13) and not the adapter\'s own sentence, which gave a second instruction');
  assert.equal(r.stored.stage, 'rotate'); assert.equal(r.stored.rotated.length, n, 'the chat in hand is not in the record'); assert.deepEqual(marks(A), [], 'no mark'); assert.equal(r.asks.length, 0, 'no Try again was asked'); assert.equal(A.S.db.online, false); assert.equal(A.S.db.error, OUT_OF_DATE); };

test('V1 the "out of date" error in the middle of the owner step (the reconnect\'s hello is refused by the server, the adapter closes for good): the run stops with the stop sentence, its reason the approved words. The chat in hand is not in the record, nothing is marked. A fresh page over the same store, which the server accepts, goes on: that chat and the next are finished, no mark, what the removed device held opens nothing', async () => {
  const gate = versionGate();
  try { await world({}, async (w) => {
    const { cid } = w, c2 = other(); const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); await makeChannel(A, c2, ['alice', 'bob'], ['bob']);
    const old = await oldOf(A, cid), old2 = await oldOf(A, c2);
    await newKeys(A);
    const so = A.S.db.setOwner, codes = []; let done = false;
    A.S.db.setOwner = async (c, cap) => { if (!done) { done = true; await die(w, gate, A); } try { return await so(c, cap); } catch (e) { codes.push(e.code); throw e; } };
    const r = await within(run(A, [chan(cid, { name: 'One' }), chan(c2, { name: 'Two' })]), 100000);
    assert.deepEqual(codes, ['version']); assert.equal(gate.refused, 1);
    paused(A, r); assert.deepEqual(r.steps, ['Securing your chats (1 of 2)']); assert.equal(A.S.rekeying, true, 'as after any run that stopped: the page is still in its removal');
    assert.equal(level(w, cid, old.own), 'owner', 'the owner key was not replaced yet: the removal is not finished, and says so');
    const A2 = await reload(w, A, [cid, c2]); const r2 = await run(A2, null, r.stored), s = draw(A2, r2.rec);
    assert.ok(r2.through); assert.deepEqual(r2.rec.rotated, [{ cid, ok: true }, { cid: c2, ok: true }]); assert.deepEqual(marks(A2), []);
    assert.ok(!s.box.some((x) => BOX.test(x)) && !has(s, READ) && !has(s, MANAGE)); assert.equal(count(s), '2 chats are secured.');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm), level(w, c2, old2.own), level(w, c2, old2.adm)], [null, null, null, null]);
    assert.deepEqual([level(w, cid, await A2.ownerCap(cid)), level(w, c2, await A2.ownerCap(c2))], ['owner', 'owner']);
  }); } finally { gate.undo(); }
});

test('V2 the same error met by the key-change loop (it comes first for every chat; here a chat the account is an admin of, then one it owns): the run stops there. No chat is filed as a failed key change, nothing is marked; after a reload both chats are secured and the summary names none', async () => {
  const gate = versionGate();
  try { await world({}, async (w) => {
    const { cid } = w, c1 = other(); const A = await w.page('alice', { owner: true, build: realCapsBuild() }); const B = await w.page('bob', { owner: true });
    await makeChannel(B, c1, ['bob', 'alice'], ['alice']); await A.sync(c1); await A.shown(c1);
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A);
    const rc = A.S.db.rotateChat, codes = []; let done = false;
    A.S.db.rotateChat = async (c, spec) => { if (!done) { done = true; await die(w, gate, A); } try { return await rc(c, spec); } catch (e) { codes.push(e.code); throw e; } };
    const chats = [{ cid: c1, owner: false, admin: true, admins: ['alice'], members: ['bob', 'alice'], name: 'Bobs' }, chan(cid, { name: 'Mine' })];
    const r = await within(run(A, chats), 100000).catch((e) => { if (e.code !== 'testwait') throw e; return null; });
    assert.ok(r, 'the run must stop, not wait without end');
    paused(A, r); assert.deepEqual(r.steps, ['Securing your chats (1 of 2)']);
    const A2 = await reload(w, A, [c1, cid]); const r2 = await run(A2, null, r.stored), s = draw(A2, r2.rec);
    assert.ok(r2.through); assert.ok(r2.rec.rotated.every((d) => d.ok && !d.skip && !d.own)); assert.equal(r2.rec.rotated[0].card, 'adm'); assert.deepEqual(marks(A2), []);
    assert.ok(!has(s, READ) && !s.box.some((x) => BOX.test(x))); assert.equal(count(s), '2 chats are secured.');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]);
  }); } finally { gate.undo(); }
});

test('V3 the stop sits right before the mark is decided, so it also holds when the step failed for another reason (the signed list timed out after the three writes), and the adapter closes for good during the check\'s own link stop. Not marked for that: the run stops, the chat is not in the record; after a reload the step runs whole', async () => {
  const gate = versionGate();
  try { await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A);
    const f = failDoc(A, (v) => v && 'ometa' in v, 'timeout');             // the signed list: a time-out, every time
    const real = A.S.db.doc; let stops = 0;                                  // the link stop of the landed check: the adapter dies right before it is sent
    A.S.db.doc = (p) => { const d = real(p), u = d.update; d.update = async (v) => { if (v && v.invites === null && f.count() >= 1 && !stops++) await die(w, gate, A); return u(v); }; return d; };
    const r = await within(run(A, [chan(cid)]), 100000);
    assert.ok(stops >= 1 && f.count() >= 1); paused(A, r);
    const A2 = await reload(w, A, [cid]); const r2 = await run(A2, null, r.stored), s = draw(A2, r2.rec);
    assert.ok(r2.through); assert.deepEqual(r2.rec.rotated, [{ cid, ok: true }]); assert.deepEqual(marks(A2), []); assert.equal(count(s), '1 chat is secured.');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]); assert.equal(Object.keys((await A2.sync(cid)).invites || {}).length, 0);
  }); } finally { gate.undo(); }
});

test('V4 the chats stage of a kept removal, run on an adapter that is closed for good from the start (an out-of-date page): it stops at once with the same words, files nothing and marks nothing, however often it is run. (The kit leaves out the settings read that comes first at a real start; on a closed adapter that read asks Try again, as today)', async () => {
  const gate = versionGate();
  try { await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A); await die(w, gate, A);
    const rec = { stage: 'rotate', name: 'Old phone', rotated: [], chats: [{ type: 'channel', vis: 'private', owner: true, admin: false, admins: ['bob'], members: ['alice', 'bob'], name: 'History', unlocked: true, cid }] };
    const out = [];
    for (let i = 0; i < 2; i++) { const r = await within(run(A, null, i ? A.ls.get('hush:rekey:alice', null) : rec), 100000).catch((e) => { if (e.code !== 'testwait') throw e; return null; });
      out.push(r ? { fails: r.fails, rotated: r.stored.rotated, asks: r.asks } : 'did not end within 100 s'); if (!r) break; }
    for (const o of out) { assert.deepEqual(o.fails, [STOPPED(OUT_DATED)]); assert.deepEqual(o.rotated, []); assert.deepEqual(o.asks, []); } assert.deepEqual(marks(A), []);
  }); } finally { gate.undo(); }
});
