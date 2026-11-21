// Release 104, item 5 (SPEC.md 14.15): "sign in first" in the middle of the owner step, U2: the sign-in again itself fails.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// A call answered "sign in first" is waited out: the owner step signs in again and goes round (removal-nouse-signin-a.test.js).
// Here that sign-in fails. A time-out is waited out. A refusal for good (`denied`) ends the removal and signs this device out
// only when the account's keys really moved on (the owner's answer B, 2026-11-12; the real refusal, made by the server, is X1
// in removal-nouse-refused.test.js). The refusal here is MADE UP by the test: the server still holds this device's keys. From
// the fix round of 2026-11-13 (F1) the page reads the profile first, finds this device's own keys there, and takes the refusal
// for no key change: the run stops with the stop sentence, the record is kept, nobody is signed out and nothing reloads.
// (Before that round: the sentence of the write stage, untrue here; the record ended; a reload; the removal dropped for good.)
// The next start goes on with the removal and finishes the chat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, marks, oldOf, failCall, realCapsBuild, outBuild, device, run, within, kept } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
test('U2 the sign-in again itself fails. A time-out: waited out, signed in at the next round, through, no mark. A refusal for good (`denied`, made up here, the keys not replaced): the profile shows this device\'s own keys, so the run stops with the stop sentence, the record is kept with its stage, the chat is not filed and not marked, nobody is signed out and nothing reloads; the next run goes on from the record and secures the chat', async () => {
  await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A);
    const fo = failCall(A, 'setOwner', ['unauth']); const pv = A.S.db.prove; let n = 0; const seen = [];
    A.S.db.prove = (idn) => { if (!idn) return pv(idn); if (n++ === 0) { seen.push('timeout'); return Promise.reject(Object.assign(new Error('timeout'), { code: 'timeout' })); } return pv(idn).then((x) => { seen.push('ok'); return x; }); };
    const r = await run(A, [chan(cid)]);
    assert.deepEqual(seen, ['timeout', 'ok']); assert.ok(r.through && !r.rec.rotated[0].own); assert.deepEqual(marks(A), []);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]);
  });
  await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: outBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A);
    const seen = device(A), fo = failCall(A, 'setOwner', ['unauth']); const pv = A.S.db.prove;
    A.S.db.prove = (idn) => (idn ? Promise.reject(Object.assign(new Error('not this account’s key'), { code: 'denied' })) : Promise.resolve());
    const r = await within(run(A, [chan(cid)]), 50000).catch((e) => { A.S.db.prove = pv; fo.undo(); throw e; });   // a page that waits a final refusal out never comes back: the test says so after 50 s and lets the run end
    A.S.db.prove = pv; fo.undo();
    await kept(A, r, seen, 'not this account’s key');   // the stop sentence and not the sentence of the write stage; the record kept; no sign-out, no reload
    assert.deepEqual(marks(A), []);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], ['owner', 'admin'], 'the chat is not secured yet: what the removed device held still gives its levels');
    const r2 = await within(run(A, null, r.stored), 50000);   // the next start: the run goes on from the kept record
    assert.ok(r2.through, 'the removal goes on'); assert.deepEqual(r2.rec.rotated, [{ cid, ok: true }]); assert.deepEqual(marks(A), []);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null], 'now the chat is secured');
  });
});
