// Release 104, item 5 (SPEC.md 14.15): the "out of date" stop and the reload, with a REAL device key.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// As V1 (removal-nouse-version.test.js), with no hand-over of the admin secret on the reload: the account's profile lists this
// device from the start (as on a phone), so every copy of the admin secret is wrapped to the device key, which a removal keeps.
// The run stops on the "out of date" error in the owner step; a fresh page over the same store (the same identity, device
// included) then takes the removal up by itself.
// (From the fifth review of the plan, which ran it on the same page statements.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, marks, oldOf, realCapsBuild, run, within, until, drop, versionGate, STOPPED, OUT_OF_DATE, OUT_DATED } from './removal-kit.js';

const build = realCapsBuild('spy.verifiedDevs=verifiedDevs;');
const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const pubDev = async (A) => { A.S.ids = [A.S.me]; if (A.S.me.dev) A.S.me.dev.forSig = ''; const d = await A.ensureDev(A.S.me);
  await A.S.db.doc('directory/alice').update({ devs: { [d.id]: A.devEntry(d) } }); await A.loadDir(['alice', 'bob'], true); return (await A.spy.verifiedDevs('alice')).length; };

test('X3 the "out of date" stop in the owner step, then a reload on a page with a real device key and no admin secret handed over: the fresh page takes the removal up by itself and finishes both chats, no mark, what the removed device held opens nothing', async () => {
  const gate = versionGate();
  try { await world({}, async (w) => {
    const { cid } = w, c2 = 'cH' + randomBytes(8).toString('hex').slice(0, 11);
    const A = await w.page('alice', { owner: true, build }); await w.page('bob');
    const d0 = await pubDev(A);
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); await makeChannel(A, c2, ['alice', 'bob'], ['bob']);
    const old = await oldOf(A, cid), old2 = await oldOf(A, c2);
    await newKeys(A); const d1 = await pubDev(A);
    const so = A.S.db.setOwner; let done = false;
    A.S.db.setOwner = async (c, cap) => { if (!done) { done = true; gate.on = true; drop(w, 'alice'); await until(() => A.S.db.error, 20000); gate.on = false; } return so(c, cap); };
    const r = await within(run(A, [chan(cid, { name: 'One' }), chan(c2, { name: 'Two' })]), 100000);
    assert.deepEqual([d0, d1], [1, 1], 'the profile lists this device, before and after the key change');
    assert.deepEqual(r.fails, [STOPPED(OUT_DATED)], 'the approved reason (the owner\'s decision of 2026-11-13), not the adapter\'s own sentence'); assert.equal(A.S.db.error, OUT_OF_DATE, 'the adapter\'s error is as it was'); assert.deepEqual(r.stored.rotated, []);
    const A2 = await w.page('alice', { store: A.store, id: A.S.me, owner: true, build }); await A2.loadDir(['alice', 'bob'], true); A2.S.ids = [A2.S.me];
    const r2 = await within(run(A2, null, r.stored), 100000);
    assert.ok(r2.through); assert.deepEqual(r2.rec.rotated, [{ cid, ok: true }, { cid: c2, ok: true }]); assert.deepEqual(marks(A2), []);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm), level(w, c2, old2.own), level(w, c2, old2.adm)], [null, null, null, null]);
  }); } finally { gate.undo(); }
});
