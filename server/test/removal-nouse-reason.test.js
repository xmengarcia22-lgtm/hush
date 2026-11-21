// Release 104, the fix round of 2026-11-13, F6 (the owner's decision of that day; the review's small point 3): the reason the
// stop sentence gives on an out-of-date page.
//
// A removal that stops with its record kept says "Removing the device stopped (X). Close Hush and open it again to finish it."
// X was whatever stopped the run. On an out-of-date page that was the adapter's own sentence, "This copy of Hush is out of date
// for the server. Reload the page.": two instructions in one sheet. From this round, while the adapter's out-of-date error
// stands (the test renderConv makes for its chip: the error says "out of date"), X is "this copy of Hush is out of date". In
// every other case X is what it was. The adapter's error and its banner are unchanged.
//
// The real error, made by the server, is V1 to V4 (removal-nouse-version.test.js) and X3 (removal-nouse-reload.test.js). Here:
// the sentence sign for sign, that it follows the adapter's error and not the words of what stopped the run, and that every
// other stop keeps its reason. A refused sign-in that is no key change keeps the refusal's own words: F1a to F1c
// (removal-nouse-refused-d.test.js), U2 and X5, which also check that no adapter error stands (removal-kit.js, kept).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { newKeys, marks, realCapsBuild, run, within, STOPPED, OUT_OF_DATE, OUT_DATED } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const NO_WS = 'This browser has no WebSocket support.';   // the adapter's other final error

test('F6a a removal that stops while the adapter\'s out-of-date error stands gives the approved reason, sign for sign, also when what stopped the run has words of its own (here the error is set by hand and the kit stops the run at the vault stage with "stop")', async () => {
  await world({}, async (w) => {
    const A = await w.page('alice', { owner: true, build: realCapsBuild() });
    A.S.db.error = OUT_OF_DATE;
    const r = await within(run(A, []), 30000).finally(() => { A.S.db.error = null; });
    assert.deepEqual(r.fails, ['Removing the device stopped (this copy of Hush is out of date). Close Hush and open it again to finish it.']);
    assert.equal(r.fails[0], STOPPED(OUT_DATED), 'the kit\'s constant is that sentence'); assert.equal(r.stored.stage, 'vault', 'the record is kept');
  });
});

test('F6b a stop for another reason keeps its reason, as before this round (passes before the change too): with no adapter error the brackets hold the words of what stopped the run; with the adapter\'s other final error, which does not say out of date, they hold the adapter\'s words', async () => {
  await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); await newKeys(A);
    const r0 = await within(run(A, []), 30000);
    assert.ok(!A.S.db.error, 'no adapter error'); assert.deepEqual(r0.fails, [STOPPED('stop')]);
    const rc = A.S.db.rotateChat; A.S.db.rotateChat = async () => { A.S.db.error = NO_WS; throw Object.assign(new Error('offline'), { code: 'offline' }); };   // the error stands when the first key change fails
    const r = await within(run(A, [chan(cid)]), 50000).finally(() => { A.S.db.rotateChat = rc; A.S.db.error = null; });
    assert.deepEqual(r.fails, [STOPPED(NO_WS)]); assert.equal(r.stored.stage, 'rotate'); assert.deepEqual(r.stored.rotated, []); assert.deepEqual(marks(A), []);
  });
});
