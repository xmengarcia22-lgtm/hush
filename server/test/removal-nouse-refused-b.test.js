// Release 104, item 5 (SPEC.md 14.15): a REAL refusal of the sign-in again, X4 and X5. X1 is in removal-nouse-refused.test.js.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held. While it is in
// its chats stage, a second client holding the account's new keys replaces them once more; the step's own sign-in again is
// then refused for good. From the owner's answer B (2026-11-12) that refusal signs this device out, with the sentence of the
// write stage: "Another device secured your account while this was running. This device can’t make changes any more."
//
// X4: the device holds a second account. Only the refused account goes; the other one starts, with the existing toast.
// X5: at that moment this account's profile cannot be read. From the fix round of 2026-11-13 (F1) the page reads the profile
// BEFORE it ends anything. With no profile read it cannot see that the keys moved on, so the run stops with the stop sentence,
// the record is kept and nobody is signed out. The next start goes on with the removal: its sign-in is refused again, the
// profile is read, shows the other holder's keys, and the removal ends in the sign-out then.
// (Before that round: the write stage's sentence, the record ended, and a reload of the tab.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, oldOf, outBuild, device, ownedIn, replaceAt, proofsOf, run, until, within, kept, SECURED, OUT_LAST, OUT_OTHER, KEY } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const setup = async (w) => { const { cid } = w; const A = await w.page('alice', { owner: true, build: outBuild() }); await w.page('bob');
  await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid); await newKeys(A); A.spy.toasts.length = 0; return { A, cid, old }; };

test('X4 the refusal on a device that holds a second account: the sheet says another device secured the account, the record is ended, the refused account is taken off the device and the other account starts, with the existing toast. What the other account keeps on the device is not touched', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w);
    A.ls.set(KEY + 'carol', { cHers: 1 }); A.ls.set('hush:rekey:carol', { done: 1 });   // the other account's own entries
    const seen = device(A, [{ handle: 'carol', kv: 1 }]), log = replaceAt(w, A, 'setOwner'), proofs = proofsOf(A);
    const r = await within(run(A, [chan(cid)]), 100000);
    assert.deepEqual(log, ['kv now 3', 'page came back: denied / bad signature, signed in: false', 'setOwner:unauth']); assert.deepEqual(proofs, ['denied:bad signature']);
    assert.deepEqual(r.fails, [SECURED]); assert.equal(r.closed, 0, 'the sheet stays, with the sentence and its Close button'); assert.equal(seen.rec.at(-1), 'done'); assert.deepEqual(seen.marks, []); assert.equal(A.S.rekeying, false);
    await until(() => A.spy.out.some((x) => /^start:/.test(x)), 5000);
    assert.deepEqual(A.spy.out, ['start:carol'], 'the other account starts; the device\'s own keys are not wiped'); assert.deepEqual(A.spy.toasts, [[OUT_OTHER('alice')]], 'the existing toast');
    assert.deepEqual(A.S.ids.map((x) => x.handle), ['carol']); assert.deepEqual(A.ls.get('hush:ids', []).map((x) => x.handle), ['carol']);
    assert.deepEqual(ownedIn(A), [], 'nothing of the refused account is left'); assert.deepEqual(ownedIn(A, 'carol'), ['hush:noUse:carol', 'hush:rekey:carol'], 'the other account keeps its own');
    assert.equal(level(w, cid, old.own), 'owner', 'the chat is NOT secured');
  });
});

test('X5 the refusal while this account\'s profile cannot be read: the page cannot see that the keys moved on, so the run stops with the stop sentence (the server\'s own words for the refusal in the brackets), the record is kept with its stage, nobody is signed out and nothing reloads. At the next start the run goes on from the record, the sign-in is refused again, the profile is read and shows the other holder\'s keys: the record is ended and this device is signed out then', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w);
    const seen = device(A), log = replaceAt(w, A, 'setOwner'), proofs = proofsOf(A);
    // from the moment the keys were replaced, a read of this account's profile fails (as with no connection), until dir.ok
    const doc = A.S.db.doc, dir = { ok: false, tries: 0 };
    A.S.db.doc = (p) => { const d = doc(p); if (p !== 'directory/alice') return d; const g = d.get; d.get = async () => { if (dir.ok || !log.length) return g(); dir.tries++; throw Object.assign(new Error('offline'), { code: 'offline' }); }; return d; };
    const r = await within(run(A, [chan(cid)]), 100000);
    assert.deepEqual(proofs, ['denied:bad signature']); assert.equal(dir.tries, 1, 'the profile was asked for once and could not be read');
    await kept(A, r, seen, 'bad signature');   // the stop sentence, the record kept, no sign-out, no reload, the account still on the device
    // the next start (on this page object: the kit has no reload): the run goes on from the kept record, as finishRekey starts it
    dir.ok = true; seen.rec.length = 0;
    const r2 = await within(run(A, null, r.stored), 100000);
    assert.deepEqual(proofs, ['denied:bad signature', 'denied:bad signature'], 'the sign-in is refused again'); assert.deepEqual([r2.fails, r2.closed], [[], 1], 'now the profile shows the other holder\'s keys: the removal ends, and on a device with this one account its sheet is closed (F3)');
    assert.equal(seen.rec.at(-1), 'done', 'the record is ended'); assert.deepEqual(seen.marks, []); assert.equal(A.S.rekeying, false);
    await until(() => A.spy.out.some((x) => /^onboard:/.test(x)), 5000);
    assert.deepEqual(A.spy.out, ['forgetDevice', 'unlockStore', 'dropUnsealed', 'onboard:' + OUT_LAST], 'signed out now');
    assert.deepEqual(A.S.ids, []); assert.deepEqual(ownedIn(A), []);
    assert.equal(level(w, cid, old.own), 'owner', 'the chat is NOT secured');
  });
});
