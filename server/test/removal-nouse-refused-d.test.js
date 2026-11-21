// Release 104, the fix round of 2026-11-13, F1 (the review's small point 1): the chats stage's refused sign-in ends the removal
// only when the account's keys really moved on.
//
// While a device removal is in its chats stage, its own account-key sign-in can be refused for good. When another holder of
// the new keys replaced them meanwhile, the removal ends and this device is signed out (the owner's answer B, 2026-11-12: X1,
// X4, X6). From this round the page reads the account's profile FIRST, while the removal's record still stands, and ends the
// removal only when that profile carries a key version above this device's AND a signing key that is not this device's (the
// comparisons keysMovedOn and signedOutHere make). In every other case the refusal is no key change this device can see: the
// run stops with the stop sentence, as any other stop of a run whose record has a stage, the record is kept, nobody is signed
// out, nothing reloads, and the next start goes on with the removal.
//
// Here: the profile names this device's own key at a higher version; the account has no profile entry on this page and the
// read fails; and the profile is the older one of a server put back from a backup (a lower version, another key).
// The profile that cannot be read after a real replacement is X5 (removal-nouse-refused-b.test.js); the made-up refusal with
// this device's keys current is U2 (removal-nouse-signin-b.test.js).
// Two more, the edges of the rule: another key at the SAME version is no version above this device's (F1d); and when the
// removal's account is no longer the current one after the branch's read (another account is, or none yet), nothing is ended
// and nothing is done to any other account (F1e).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, oldOf, outBuild, device, ownedIn, failCall, replaceAt, proofsOf, run, until, within, drop, kept, profileRow, STOPPED, KEY } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const setup = async (w) => { const { cid } = w; const A = await w.page('alice', { owner: true, build: outBuild() }); await w.page('bob');
  await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid); return { A, cid, old }; };
// a refusal MADE UP by the test, as U2's: the owner-key call is answered "sign in first" and the sign-in again `denied`; `at` runs at that sign-in
const refuse = (A, at = () => {}) => { const fo = failCall(A, 'setOwner', ['unauth']), pv = A.S.db.prove;
  A.S.db.prove = (idn) => { if (!idn) return Promise.resolve(); at(); return Promise.reject(Object.assign(new Error('not this account’s key'), { code: 'denied' })); };
  return () => { A.S.db.prove = pv; fo.undo(); }; };

test('F1a the refusal while the profile names THIS device\'s own key at a higher version (only the version number is behind): no key change, so the run stops with the stop sentence, the record is kept with its stage, nobody is signed out, nothing reloads and the account is still on the device', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A);
    const seen = device(A), undo = refuse(A, () => { A.kv.alice = 3; });   // from the refusal on, the profile as this page reads it carries version 3
    const r = await within(run(A, [chan(cid)]), 50000).finally(undo);
    await kept(A, r, seen, 'not this account’s key');
    assert.deepEqual([A.S.dir.alice.kv, A.S.me.kv, A.S.dir.alice.sig.x === A.S.me.sig.x], [3, 2, true], 'the profile that was read: a higher version, this device\'s own key');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], ['owner', 'admin'], 'the chat is not secured yet');
  });
});

test('F1b the refusal while the account has no profile entry on this page and the read of it fails: nothing says the keys moved on, so the run stops with the stop sentence, the record is kept with its stage, nobody is signed out and nothing reloads', async () => {
  await world({}, async (w) => {
    const { A, cid } = await setup(w); await newKeys(A);
    const doc = A.S.db.doc; let off = false, tries = 0;   // from the refusal on: no entry, and no read of the profile
    A.S.db.doc = (p) => { const d = doc(p); if (p !== 'directory/alice') return d; const g = d.get; d.get = async () => { if (!off) return g(); tries++; throw Object.assign(new Error('offline'), { code: 'offline' }); }; return d; };
    const seen = device(A), undo = refuse(A, () => { off = true; delete A.S.dir.alice; });
    const r = await within(run(A, [chan(cid)]), 50000).finally(undo);
    assert.equal(tries, 1, 'the profile was asked for once and could not be read'); assert.equal(A.S.dir.alice, undefined);
    await kept(A, r, seen, 'not this account’s key');
  });
});

test('F1c the refusal by a server put back from an older backup: its profile for the account is the one from before the removal (a lower version, the old key), so it refuses this device\'s new key for good. That is no newer key: the run stops with the stop sentence (the server\'s own words for the refusal in the brackets), the record is kept with its stage, nobody is signed out, nothing reloads and the account is still on the device', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w);
    const row = profileRow(w, 'alice');   // the profile as the backup holds it: the old keys, version 1
    await newKeys(A);
    const seen = device(A), proofs = proofsOf(A);
    assert.equal(row.back(), 1, 'the profile is put back'); assert.ok(drop(w, 'alice') >= 1, 'and the page\'s connection is dropped, as a server\'s restart drops it');
    await until(() => A.S.db.online && A.S.db.identityError, 20000);
    assert.equal(A.S.db.identityError.message, 'bad signature', 'the reconnect\'s sign-in is refused');
    const r = await within(run(A, [chan(cid)]), 100000);
    assert.deepEqual(proofs, ['denied:bad signature'], 'the removal signed in again once, and was refused for good');
    await kept(A, r, seen, 'bad signature');
    assert.deepEqual([A.S.dir.alice.kv, A.S.me.kv, A.S.dir.alice.sig.x === A.S.me.prev.sig.x], [1, 2, true], 'the profile that was read: a lower version, the key of before the removal');
    assert.equal(level(w, cid, old.own), 'owner', 'the chat is not secured yet');
  });
});

test('F1d the refusal while the profile names ANOTHER signing key at the version this device has: that is no version above this device\'s, so no key change this device can see: the run stops with the stop sentence, the record is kept with its stage, nobody is signed out and nothing reloads', async () => {
  await world({}, async (w) => {
    const { A, cid } = await setup(w); await newKeys(A);
    const doc = A.S.db.doc; let other = false;   // from the refusal on, the profile as this page reads it names another signing key, at the same version
    A.S.db.doc = (p) => { const d = doc(p); if (p !== 'directory/alice') return d; const g = d.get; d.get = async () => { const s = await g(); if (!other) return s; const v = s.data(); return { exists: true, data: () => ({ ...v, sig: { ...v.sig, x: 'another', y: 'key' } }) }; }; return d; };
    const seen = device(A), undo = refuse(A, () => { other = true; });
    const r = await within(run(A, [chan(cid)]), 50000).finally(undo);
    await kept(A, r, seen, 'not this account’s key');
    assert.deepEqual([A.S.dir.alice.kv, A.S.me.kv, A.S.dir.alice.sig.x], [2, 2, 'another'], 'the profile that was read: the same version, another key');
  });
});

test('F1e the refusal on a device with a second account, when the removal\'s account stops being the current one during the branch\'s own profile read, while that profile shows the other holder\'s keys. Twice: the second account has become the current one, and no account is current yet. Nothing is ended and nothing is done to the account that is current: the run stops with the stop sentence, the record is kept, nothing reloads or starts, no account leaves the device and the other account keeps what is its own', async () => {
  for (const none of [false, true]) await world({}, async (w) => {
    const { A, cid } = await setup(w); await newKeys(A); A.spy.toasts.length = 0;
    const carol = { handle: 'carol', kv: 1, sig: { x: 'cx', y: 'cy' } }, next = none ? null : carol;
    A.ls.set(KEY + 'carol', { cHers: 1 }); A.ls.set('hush:rekey:carol', { done: 1 });   // the other account's own entries
    const seen = device(A, [carol]), log = replaceAt(w, A, 'setOwner'), proofs = proofsOf(A);
    const doc = A.S.db.doc; let switched = 0;   // the first read of the profile after the refused sign-in is the branch's own: the account changes right then
    A.S.db.doc = (p) => { const d = doc(p); if (p !== 'directory/alice') return d; const g = d.get; d.get = async () => { const s = await g(); if (proofs.length && !switched++) A.S.me = next; return s; }; return d; };
    const r = await within(run(A, [chan(cid)]), 100000); await new Promise((res) => setTimeout(res, 400));
    assert.deepEqual(log, ['kv now 3', 'page came back: denied / bad signature, signed in: false', 'setOwner:unauth']); assert.deepEqual(proofs, ['denied:bad signature']);
    assert.equal(switched, 1, 'the account changed during the branch\'s read'); assert.equal(A.S.dir.alice.kv, 3, 'and the profile that was read shows the other holder\'s keys');
    assert.deepEqual([r.fails, r.closed], [[STOPPED('bad signature')], 0], 'the stop sentence, not the sign-out\'s sentence, and the sheet is not closed');
    assert.equal(r.stored.stage, 'rotate', 'the record is kept, with its stage'); assert.deepEqual(seen.rec.filter((x) => x !== 'rotate:0'), [], 'and was never ended'); assert.deepEqual(seen.marks, []);
    assert.deepEqual(A.spy.out, [], 'no reload, no start, no onboarding'); assert.deepEqual(A.spy.toasts, []);
    assert.equal(A.S.me, next, 'the current account is as the change left it'); assert.equal(carol.kv, 1, 'and the other account\'s key version is as it was');
    assert.deepEqual(A.S.ids.map((x) => x.handle), ['alice', 'carol']); assert.deepEqual(A.ls.get('hush:ids', []).map((x) => x.handle), ['alice', 'carol']);
    assert.deepEqual(ownedIn(A, 'carol'), ['hush:noUse:carol', 'hush:rekey:carol'], 'the other account keeps its own');
  });
});
