// Release 104, the fix round of 2026-11-13, F2 (the review's small point 2): the sign-out of a removal works on the removal's
// own account.
//
// A removal whose keys were replaced by another holder signs this device out of the account (signedOutHere, as written in the
// page; the stand-ins around it are removal-kit.js's outBuild). The sign-out worked on whichever account was the current one
// when it ran. On a device with a second account that could be the other account: it was then reloaded into, or erased.
// From this round the sign-out is told the account it is for: when that is not the current account, it does nothing. Both
// `lost` branches of rekeyRun (the write stage's and the chats stage's) say the removal's account. A call that names no
// account (keysMovedOn's) works as before. With no account current at all, a sign-out that names one does nothing (F2e).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world } from './channel-history-kit.js';
import { lostBuild, lostAtWrite, device, ownedIn, run, until, within, cut, SECURED, OUT_OTHER, KEY } from './removal-kit.js';

const snap = (A) => JSON.stringify([...A.store.entries()].sort());
const quiet = () => new Promise((res) => setTimeout(res, 400));
// alice's page on a device that also holds carol, each with entries of her own in the store
const two = async (w) => { const A = await w.page('alice', { owner: true, build: lostBuild() }); const carol = { handle: 'carol', kv: 1, sig: { x: 'cx', y: 'cy' } };
  A.ls.set(KEY + 'carol', { cHers: 1 }); A.ls.set('hush:rekey:carol', { done: 1 }); A.ls.set(KEY + 'alice', { cMine: 1 });
  device(A, [carol]); A.spy.toasts.length = 0; return { A, carol, alice: A.S.me }; };

test('F2a the sign-out asked for the removal\'s account while ANOTHER account is the current one: nothing reloads, nothing starts, no account leaves the device and the store is as it was. Twice: with the other account\'s profile as this device knows it (before this round: the tab reloaded), and with that profile at a higher key version under another key (before: the other account was erased from the device)', async () => {
  await world({}, async (w) => {
    const { A, carol } = await two(w); A.S.me = carol; const before = snap(A);
    await A.spy.signedOutHere('alice'); await quiet();
    assert.deepEqual(A.spy.out, [], 'no reload, no start, no onboarding'); assert.equal(snap(A), before, 'the store is as it was');
    A.S.dir.carol = { handle: 'carol', kv: 2, sig: { x: 'ox', y: 'oy' } };
    await A.spy.signedOutHere('alice'); await quiet();
    assert.deepEqual(A.spy.out, []); assert.equal(snap(A), before); assert.deepEqual(A.spy.toasts, []);
    assert.equal(A.S.me, carol, 'the other account is still the current one'); assert.equal(A.S.me.kv, 1, 'with its key version as it was');
    assert.deepEqual(A.S.ids.map((x) => x.handle), ['alice', 'carol']); assert.deepEqual(ownedIn(A, 'carol'), ['hush:noUse:carol', 'hush:rekey:carol']);
  });
});

test('F2b the sign-out as before (these pass before the change too): asked with no account named, as keysMovedOn asks, and asked for the account that IS the current one, it takes that account off the device when its profile shows another key at a higher version; the other account starts, with the existing toast, and keeps what is its own', async () => {
  for (const who of [undefined, 'alice']) await world({}, async (w) => {
    const { A } = await two(w);
    A.S.dir.alice = { handle: 'alice', kv: 2, sig: { x: 'ox', y: 'oy' } };
    await A.spy.signedOutHere(who); await until(() => A.spy.out.length, 5000);
    assert.deepEqual(A.spy.out, ['start:carol']); assert.deepEqual(A.spy.toasts, [[OUT_OTHER('alice')]]);
    assert.deepEqual(A.S.ids.map((x) => x.handle), ['carol']); assert.deepEqual(ownedIn(A), []); assert.deepEqual(ownedIn(A, 'carol'), ['hush:noUse:carol', 'hush:rekey:carol']);
  });
});

test('F2c the write stage\'s `lost`, made by the server (a second holder of the old keys replaced the account\'s keys before this device\'s profile write), on a device with a second account that becomes the current one during the branch\'s own profile read: the sheet says another device secured the account and the removal\'s record is ended, as before; the other account is not reloaded into, not erased, and keeps what is its own; the removal\'s account stays on the device with its old keys', async () => {
  await world({}, async (w) => {
    const { A, carol } = await two(w); const rec = await lostAtWrite(w, A);
    const doc = A.S.db.doc; let switched = 0;   // the branch's own read of the profile comes after S.rekeying is cleared: the account changes right then
    A.S.db.doc = (p) => { const d = doc(p); if (p !== 'directory/alice') return d; const g = d.get; d.get = async () => { const s = await g(); if (A.S.rekeying === false && !switched++) A.S.me = carol; return s; }; return d; };
    const r = await within(run(A, null, rec), 60000); await quiet();
    assert.equal(switched, 1, 'the account changed during the branch\'s read'); assert.deepEqual(r.fails, [SECURED]); assert.deepEqual(Object.keys(r.stored), ['done'], 'the record is ended');
    assert.deepEqual(A.spy.out, [], 'no reload, no start, no onboarding'); assert.deepEqual(A.spy.toasts, []);
    assert.equal(A.S.me, carol); assert.deepEqual(A.S.ids.map((x) => x.handle), ['alice', 'carol']); assert.deepEqual(A.ls.get('hush:ids', []).map((x) => [x.handle, x.kv || 1]), [['alice', 1], ['carol', 1]]);
    assert.deepEqual(ownedIn(A, 'carol'), ['hush:noUse:carol', 'hush:rekey:carol']); assert.deepEqual(ownedIn(A), ['hush:noUse:alice', 'hush:rekey:alice']);
  });
});

test('F2e the sign-out asked for the removal\'s account while NO account is the current one (the account was logged out in another tab of this browser meanwhile, and none has started yet): it does nothing and does not fail. (Before this round the sign-out took no name and failed there, on the account that was not set)', async () => {
  await world({}, async (w) => {
    const { A } = await two(w); A.S.me = null; const before = snap(A);
    await A.spy.signedOutHere('alice'); await quiet();
    assert.deepEqual(A.spy.out, [], 'no reload, no start, no onboarding'); assert.equal(snap(A), before, 'the store is as it was'); assert.deepEqual(A.spy.toasts, []);
    assert.equal(A.S.me, null); assert.deepEqual(A.S.ids.map((x) => x.handle), ['alice', 'carol']);
  });
});

test('F2d a check of the page\'s source, not of behaviour: both sign-outs of rekeyRun name the removal\'s account. (The chats stage\'s branch itself looks whether that account is still the current one right before its call, with nothing awaited in between, so no run can show its call apart from one that names no account)', () => {
  assert.deepEqual(cut('async function rekeyRun(', 'function rekeySummary(').match(/signedOutHere\([^)]*\)/g), ['signedOutHere(h)', 'signedOutHere(h)']);
});
