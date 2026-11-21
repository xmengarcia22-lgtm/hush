// Release 104, the fix round of 2026-11-13, F3 (the pictures' finding P1): the removal's sheet closes when no other account is
// left on the device. The chats stage's branch; the write stage's is in removal-nouse-sheet-b.test.js.
//
// A removal whose keys were replaced by another holder signs this device out. With one account on the device the sheet showed
// "Another device secured your account while this was running. This device can’t make changes any more." and the sign-up
// screen covered it a moment later; the sheet stayed in the page underneath and showed again over an account made there
// afterwards, where its sentence is untrue. From this round the sheet is closed instead when the account being signed out is
// the only one on the device; the sign-up screen says why, with its standing line. With another account on the device
// everything is as before: the sentence with its Close button, the toast, the next account.
//
// The sheet here is the page's own: el, html, sheet and rekeySheet run as written over a stand-in for the document
// (removal-kit.js, SHEET and fakeDoc). The refusal is the real one of X1, made by the server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { newKeys, outBuild, device, replaceAt, run, until, within, SHEET, fakeDoc, shown, SECURED, OUT_LAST, OUT_OTHER } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const setup = async (w, more) => { const { cid } = w; const A = await w.page('alice', { owner: true, build: outBuild(SHEET) }); await w.page('bob');
  await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); await newKeys(A); A.spy.toasts.length = 0;
  device(A, more); replaceAt(w, A, 'setOwner'); A.spy.doc = fakeDoc(); const ui = A.spy.sheetOf('Finishing device removal');
  assert.equal(shown(A.spy.doc).sheets, 1, 'the removal\'s sheet is in the page'); return { A, cid, ui }; };

test('F3a one account on the device, the chats stage: after the sign-out no sheet is left in the page, so none with the sentence of the write stage, and the sign-up screen shows its standing line. A new account made on the device afterwards finds no sheet of the removal', async () => {
  await world({}, async (w) => {
    const { A, cid, ui } = await setup(w);
    await within(run(A, [chan(cid)], null, ui), 100000);
    await until(() => A.spy.out.some((x) => /^onboard:/.test(x)), 5000);
    const s = shown(A.spy.doc);
    assert.equal(s.sheets, 0, 'no sheet is left in the page'); assert.deepEqual(s.text, []); assert.deepEqual(s.buttons, []);
    assert.equal(A.spy.out.at(-1), 'onboard:' + OUT_LAST, 'the sign-up screen, with its standing line'); assert.deepEqual(A.S.ids, []);
    // a new account on this device (put there by hand: the kit has no sign-up screen). Nothing of the removal is in the page for it to see
    A.S.me = { handle: 'dora', ...(await A.newIdentity()) }; A.S.ids = [A.S.me];
    assert.equal(shown(A.spy.doc).sheets, 0); assert.ok(!shown(A.spy.doc).text.includes(SECURED));
  });
});

test('F3b two accounts on the device, the chats stage (as before this round): the sheet stays in the page with the sentence of the write stage and its Close button, the refused account goes, the other account starts, with the existing toast; a tap on Close takes the sheet away', async () => {
  await world({}, async (w) => {
    const { A, cid, ui } = await setup(w, [{ handle: 'carol', kv: 1 }]);
    await within(run(A, [chan(cid)], null, ui), 100000);
    await until(() => A.spy.out.some((x) => /^start:/.test(x)), 5000);
    const s = shown(A.spy.doc);
    assert.equal(s.sheets, 1, 'the sheet is still in the page'); assert.deepEqual(s.text, ['Finishing device removal', SECURED, 'Close']); assert.deepEqual(s.buttons.map((b) => b.textContent), ['Close']);
    assert.deepEqual(A.spy.out, ['start:carol']); assert.deepEqual(A.spy.toasts, [[OUT_OTHER('alice')]]); assert.deepEqual(A.S.ids.map((x) => x.handle), ['carol']);
    s.buttons[0].onclick();
    assert.equal(shown(A.spy.doc).sheets, 0, 'Close takes it away');
  });
});
