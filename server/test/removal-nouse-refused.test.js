// Release 104, item 5 (SPEC.md 14.15): a REAL refusal of the sign-in again, produced by the server.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// While the removal is in its chats stage, a second client holding the account's new keys replaces them once more (kv + 1).
// The server closes this page's connection (4401), the reconnect's sign-in is refused, the owner-key call meets "sign in
// first", and the step's own sign-in again is refused for good. (From the fifth review of the plan, which ran it.)
//
// From the owner's answer B (2026-11-12) that refusal signs this device out: the removal's record is ended, and the account is
// taken off this device as a sign-out does (signedOutHere, as written in the page). With another account on the device the
// sheet says "Another device secured your account while this was running. This device can’t make changes any more." (X4).
// Here the account is the only one on the device: from the fix round of 2026-11-13 (F3) the removal's sheet is closed instead,
// and the sign-up screen says why, with its standing line. The chat in hand is NOT secured: the owner key the removed device
// held still gives owner level, and nothing on this device can change that any more. The account now belongs to whoever
// replaced its keys. X4 and X5 are in removal-nouse-refused-b.test.js; the sheet itself is in removal-nouse-sheet.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, oldOf, outBuild, device, ownedIn, replaceAt, proofsOf, run, until, within, OUT_LAST, KEY } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });

test('X1 a real refusal of the sign-in again, made by the server: a second client replaces the account\'s keys once more during the owner step. The page\'s connection is closed, the reconnect\'s sign-in is refused, the owner-key call meets "sign in first" and the step\'s own sign-in again is refused for good: the record is ended and this device is signed out. It is the only account on the device, so the removal\'s sheet is closed and the onboarding screen says why. No chat is filed or marked on the way, and the chat in hand is not secured', async () => {
  await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: outBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A);
    A.ls.set(KEY + 'alice', { cOther: 1 });   // a mark an earlier removal left on this device
    const seen = device(A), log = replaceAt(w, A, 'setOwner'), proofs = proofsOf(A);
    const r = await within(run(A, [chan(cid)]), 100000);
    assert.deepEqual(log, ['kv now 3', 'page came back: denied / bad signature, signed in: false', 'setOwner:unauth'], 'the owner-key call met "sign in first", once');
    assert.deepEqual(proofs, ['denied:bad signature'], 'the step signed in again once, and was refused for good');
    assert.deepEqual(r.fails, [], 'the sheet says nothing more: not the sentence of the write stage (this is the only account on the device, so the sign-up screen says why), and not the stop sentence'); assert.equal(r.closed, 1, 'the removal\'s sheet is closed, without a tap');
    assert.deepEqual(r.steps, ['Securing your chats (1 of 1)']);
    assert.equal(seen.rec.at(-1), 'done', 'the record is ended'); assert.deepEqual(seen.rec.filter((x) => x !== 'done' && x !== 'rotate:0'), [], 'and no chat was ever filed in it');
    assert.deepEqual(seen.marks, [], 'no mark was written'); assert.equal(A.S.rekeying, false, 'S.rekeying is off');
    await until(() => A.spy.out.some((x) => /^onboard:/.test(x)), 5000);
    assert.deepEqual(A.spy.out, ['forgetDevice', 'unlockStore', 'dropUnsealed', 'onboard:' + OUT_LAST], 'the last account on the device: its keys are wiped and the onboarding screen says why');
    assert.deepEqual(A.S.ids, [], 'the account is gone from the page'); assert.deepEqual(A.ls.get('hush:ids', null), [], 'and from the store'); assert.equal(A.S.me, null);
    assert.deepEqual(ownedIn(A), [], 'nothing filed under the username is left: the ended record and the marks went with the account (forgetAccountData)');
    assert.equal(level(w, cid, old.own), 'owner', 'the owner key the removed device held still gives owner level: this chat is NOT secured');
  });
});
