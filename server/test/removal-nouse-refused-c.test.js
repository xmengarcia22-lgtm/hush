// Release 104, item 5 (SPEC.md 14.15): a REAL refusal of the sign-in again, met in the key-change loop, X6.
// X1 (the same refusal met in the owner step) is in removal-nouse-refused.test.js; X4 and X5 in removal-nouse-refused-b.test.js.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: first the chat key
// (the key-change loop), then in a chat this account owns the owner key, the admin secret and the open invite links (the owner
// step). From the owner's answer C (2026-11-12) the key-change loop waits "sign in first" out as the owner step does: it signs
// in again and goes round. Here that sign-in is refused for good: right before the first chat's key change a second client
// holding the account's new keys replaces them once more. From the owner's answer B that refusal ends the removal and signs this
// device out. The sentence of the write stage shows when another account is on the device; here the account is the only one, so
// the removal's sheet is closed instead (the fix round of 2026-11-13, F3). No chat is filed, none is marked, and the owner step
// is never reached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, oldOf, outBuild, device, ownedIn, replaceAt, proofsOf, failCall, run, until, within, OUT_LAST } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });

test('X6 a real refusal met in the key-change loop: a second client replaces the account\'s keys right before the first chat\'s key change. The key change meets "sign in first", the loop signs in again, once, and is refused for good: the record is ended with no chat filed, nothing is marked, this device is signed out (its only account: the removal\'s sheet is closed and the onboarding screen says why), and the owner step is never reached. The chat is not secured', async () => {
  await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: outBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A);
    const seen = device(A), log = replaceAt(w, A, 'rotateChat'), own = failCall(A, 'setOwner', []), proofs = proofsOf(A);
    // A page that signs in a second time after a refusal for good would go round without end: the test says so at that second sign-in
    // (or after 40 s), and then lets the run end through the page's own stop for the "out of date" error
    let over = false; const again = (async () => { while (!over && proofs.length < 2) await new Promise((res) => setTimeout(res, 50)); if (!over) throw new Error('the page signed in again after a sign-in refused for good'); })();
    const r = await Promise.race([within(run(A, [chan(cid)]), 40000), again]).catch((e) => { A.S.db.error = 'the test is over'; throw e; }).finally(() => { over = true; });
    assert.deepEqual(log, ['kv now 3', 'page came back: denied / bad signature, signed in: false', 'rotateChat:unauth'], 'the key change met "sign in first", once');
    assert.deepEqual(proofs, ['denied:bad signature'], 'the key-change loop signed in again once, and was refused for good');
    assert.deepEqual(own.calls, [], 'the owner step was never reached');
    assert.deepEqual(r.fails, [], 'the sheet says nothing more: this is the only account on the device, so the sign-up screen says why (the fix round of 2026-11-13, F3)'); assert.equal(r.closed, 1, 'the removal\'s sheet is closed, without a tap');
    assert.deepEqual(r.steps, ['Securing your chats (1 of 1)']);
    assert.equal(seen.rec.at(-1), 'done', 'the record is ended'); assert.deepEqual(seen.rec.filter((x) => x !== 'done' && x !== 'rotate:0'), [], 'and no chat was ever filed in it');
    assert.deepEqual(seen.marks, [], 'no mark was written'); assert.equal(A.S.rekeying, false, 'S.rekeying is off');
    await until(() => A.spy.out.some((x) => /^onboard:/.test(x)), 5000);
    assert.deepEqual(A.spy.out, ['forgetDevice', 'unlockStore', 'dropUnsealed', 'onboard:' + OUT_LAST], 'signed out: the onboarding screen says why');
    assert.deepEqual(A.S.ids, []); assert.deepEqual(A.ls.get('hush:ids', null), []); assert.deepEqual(ownedIn(A), []);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], ['owner', 'admin'], 'what the removed device held still gives its levels: this chat is NOT secured');
  });
});
