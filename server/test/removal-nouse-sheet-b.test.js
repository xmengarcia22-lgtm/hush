// Release 104, the fix round of 2026-11-13, F3 (the pictures' finding P1): the removal's sheet closes when no other account is
// left on the device. The write stage's branch; the chats stage's is in removal-nouse-sheet.test.js.
//
// The write stage's `lost` (in the page since release 21): the removal made its new keys on this device, and before its profile
// write a second holder of the OLD keys replaced the account's keys. The server then knows neither this device's new keys nor
// its old ones. The removal puts the old keys back, ends its record and signs this device out. The sheet showed "Another device
// secured your account while this was running. This device can’t make changes any more."; with one account on the device the
// sign-up screen covered it and the sheet stayed in the page underneath. From this round the sheet is closed instead when the
// account being signed out is the only one on the device. With another account on the device everything is as before.
//
// The sheet is the page's own (removal-kit.js, SHEET and fakeDoc); the `lost` is made by the server's own answers (lostAtWrite).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world } from './channel-history-kit.js';
import { lostBuild, lostAtWrite, device, ownedIn, run, until, within, SHEET, fakeDoc, shown, SECURED, OUT_LAST, OUT_OTHER } from './removal-kit.js';

const setup = async (w, more) => { const A = await w.page('alice', { owner: true, build: lostBuild(SHEET) }); A.spy.toasts.length = 0;
  device(A, more); const rec = await lostAtWrite(w, A); A.spy.doc = fakeDoc(); const ui = A.spy.sheetOf('Finishing device removal');
  assert.equal(shown(A.spy.doc).sheets, 1, 'the removal\'s sheet is in the page'); return { A, rec, ui }; };

test('F3c one account on the device, the write stage: the removal puts the old keys back and ends its record; after the sign-out no sheet is left in the page, so none with the sentence of the write stage, and the sign-up screen shows its standing line', async () => {
  await world({}, async (w) => {
    const { A, rec, ui } = await setup(w);
    await within(run(A, null, rec, ui), 60000);
    await until(() => A.spy.out.some((x) => /^onboard:/.test(x)), 5000);
    const s = shown(A.spy.doc);
    assert.equal(s.sheets, 0, 'no sheet is left in the page'); assert.deepEqual(s.text, []); assert.deepEqual(s.buttons, []);
    assert.deepEqual(A.spy.out, ['forgetDevice', 'unlockStore', 'dropUnsealed', 'onboard:' + OUT_LAST], 'signed out: the sign-up screen, with its standing line');
    assert.deepEqual(A.S.ids, []); assert.deepEqual(ownedIn(A), []); assert.equal(A.S.rekeying, false);
  });
});

test('F3d two accounts on the device, the write stage (as before this round): the sheet stays in the page with the sentence of the write stage and its Close button, the refused account goes, the other account starts, with the existing toast; a tap on Close takes the sheet away', async () => {
  await world({}, async (w) => {
    const { A, rec, ui } = await setup(w, [{ handle: 'carol', kv: 1 }]);
    await within(run(A, null, rec, ui), 60000);
    await until(() => A.spy.out.some((x) => /^start:/.test(x)), 5000);
    const s = shown(A.spy.doc);
    assert.equal(s.sheets, 1, 'the sheet is still in the page'); assert.deepEqual(s.text, ['Finishing device removal', SECURED, 'Close']); assert.deepEqual(s.buttons.map((b) => b.textContent), ['Close']);
    assert.deepEqual(A.spy.out, ['start:carol']); assert.deepEqual(A.spy.toasts, [[OUT_OTHER('alice')]]); assert.deepEqual(A.S.ids.map((x) => x.handle), ['carol']); assert.equal(A.S.rekeying, false);
    s.buttons[0].onclick();
    assert.equal(shown(A.spy.doc).sheets, 0, 'Close takes it away');
  });
});
