// Release 104, the fix round of 2026-11-13, F4 and F5: two styles the device-removed summary sets from the script
// (rekeySummary, run as written in the page; this release leaves app/styles.css untouched).
//
// F4 (the pictures' finding P3): a chat name of one long word ran out of the summary's box and off the screen. The summary's
// node now lets long words break (overflow-wrap: anywhere), so every line of the summary that names chats is covered.
// F5 (the owner's decision of 2026-11-13): the "Couldn’t secure these chats" box carries the two colours of the page's red
// warning look (.keywarn in app/styles.css: its background and its border colour). The summary's two other warning boxes,
// and every other line, stay as they were.
//
// The kit's page has no stylesheet and no layout. These tests show what the script sets on which element, and nothing about
// how a browser draws it: that long names wrap and that the box looks red is shown by the picture walk in a real browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageFor } from './channel-history-kit.js';
import { draw, BOX, TAKEN } from './removal-kit.js';

const LONG = 'Supercalifragilisticexpialidocious'.repeat(2).slice(0, 60);   // one word of 60 signs, as in the pictures
// a finished removal with every kind of line that names chats, and all three warning boxes
const rec = () => ({ name: 'Old phone', pwSkipped: true,
  chats: [{ cid: 'c1', name: LONG, type: 'group', owner: true }, { cid: 'c2', name: 'Two', type: 'group' }, { cid: 'c3', name: 'Three', type: 'group' }, { cid: 'c4', name: 'Four', type: 'group' }],
  rotated: [{ cid: 'c1', ok: true, own: 'error' }, { cid: 'c2', skip: 'taken' }, { cid: 'c3', ok: true }, { cid: 'c4', skip: 'member' }] });
const RED = { background: 'color-mix(in srgb,var(--danger) 10%,transparent)', borderColor: 'color-mix(in srgb,var(--danger) 35%,transparent)' };

test('F4 the summary\'s node lets long words break: the script sets overflow-wrap: anywhere on the node rekeySummary returns, the one every line of the summary hangs under, and on nothing else', async () => {
  const A = await pageFor(null, 'alice'), s = draw(A, rec());
  assert.equal(s.els[0], s.n, 'the node is the first element the summary makes');
  assert.equal(s.n.style.overflowWrap, 'anywhere');
  assert.ok(s.t.some((x) => x.includes(LONG)), 'the long name is in the summary');
  assert.deepEqual(s.els.filter((e) => e !== s.n && 'overflowWrap' in e.style), [], 'no line sets it for itself');
});

test('F5 the "Couldn’t secure these chats" box carries the two colours of the page\'s red warning look, set by the script on that one element; they are .keywarn\'s own, as app/styles.css has them. The summary\'s two other warning boxes and every other line carry no style from the script', async () => {
  const A = await pageFor(null, 'alice'), s = draw(A, rec()), boxes = s.els.filter((e) => e.cls === 'warnbox');
  assert.equal(boxes.length, 3, 'three warning boxes'); assert.ok(BOX.test(boxes[0].textContent) && TAKEN.test(boxes[1].textContent) && /^Set a new password in Settings/.test(boxes[2].textContent));
  assert.deepEqual(boxes[0].style, RED, 'the box of the chats that must not be used: red');
  assert.deepEqual([boxes[1].style, boxes[2].style], [{}, {}], 'the two other boxes: plain');
  assert.deepEqual(s.els.filter((e) => e !== s.n && e !== boxes[0] && Object.keys(e.style).length), [], 'no other line carries a style');
  const css = readFileSync(new URL('../../app/styles.css', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith('.keywarn{'));
  assert.ok(css.includes(';background:' + RED.background + ';border:1px solid ' + RED.borderColor + ';'), 'the two values are the stylesheet\'s own for .keywarn');
});
