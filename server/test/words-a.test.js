// The words of release A (release 103): the page says the approved sentences, row by row.
//
// Release A changes only sentences a person reads in app/ui.js: one name "security code", no "key" and no "server" in
// sentences, the long sentences of the device-removed summary, the repair line, and three word fixes. The approved word
// table has 110 rows (108 with new words, 2 removed). fixtures/words-a.json is that table as a recorded list, made
// from it by a script; its head says what each field is. This test reads app/ui.js as written and proves for every
// row that the new words stand in the row's own unit and that the old words are gone. It runs nothing of the page but
// the few expressions named below, and it reads no file outside the repository.
//
// HOW EACH KIND OF ROW IS CHECKED
//   words    (94 rows) the sentence is one string, or pieces joined with values ('Its device code is '+key+'.').
//            The list gives it cut at its values. The test looks for the pieces in order, each value between its two
//            pieces and joined to them by + or ${ }, the first piece opening a string and the last one closing it. So a
//            short label such as 'Fix channel' is found only as a whole string, never as a word inside a comment, a
//            name or a longer sentence; a value left out or moved, or a word put in, is not found at all.
//            New: must stand in the unit the row names. Old: must stand nowhere in the file.
//   cases    (11 rows) the code puts the sentence together with a choice in it ("1 chat is secured." and "2 chats are
//            secured." are one expression). The list gives the expression as the file writes it; it must stand in the
//            unit, and run here with the row's values it must give the row's sentence. powerLead asks p.role twice
//            (for "the owner / now an admin" and for "Owners / Admins"); the list answers the two reads in turn, so
//            each of the table's six pairs of words is made, also the three no account sees.
//   markup   (3 rows) a string of HTML. As cases, and the string must keep the tags the old one had, in order, and
//            hold none of < > & " ' ` outside them.
//   removed  (2 rows, one entry of "How encryption works") the two strings stand nowhere, and the list ends with the
//            entry before them.
// And the page holds no "safety number" anywhere, in any string or comment.
//
// WHAT IT DOES NOT SEE: where on the screen a sentence stands, whether it fits, and whether it is true. A sentence
// outside the 110 rows is not looked at here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const UI = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const LIST = JSON.parse(readFileSync(new URL('./fixtures/words-a.json', import.meta.url), 'utf8'));

// the top-level unit of ui.js with this name: from its declaration to the line before the next top-level declaration
function unit(fn) {
  const lines = UI.split('\n');
  const a = lines.findIndex((l) => new RegExp('^(?:async function|function|const) ' + fn + '\\b').test(l));
  if (a < 0) return null;
  let b = a + 1; while (b < lines.length && !/^(?:async function |function |const |let |var )/.test(lines[b])) b++;
  return lines.slice(a, b).join('\n');
}

// the sentence as code: parts = [piece, value, piece, value, piece], see "words" above
const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function sentence(parts) {
  let s = ''; const n = parts.length;
  for (let i = 0; i < n; i++) {
    const p = parts[i];
    if (i % 2 === 0) { s += (i === 0 && p ? "['`]" : '') + rx(p) + (i === n - 1 && p ? "['`]" : ''); continue; }
    const first = i === 1 && !parts[0], last = i === n - 2 && !parts[n - 1];
    s += (first ? '(?:`\\$\\{|\\(|)' : "(?:\\$\\{|['`]\\+\\(?)") + rx(p) + (last ? '(?:\\}`|\\)|)' : "(?:\\}|\\)?\\+['`])");
  }
  return new RegExp(s);
}

// one expression of the page, run with the row's values
function run(code, args) {
  const a = { ...args };
  if (a.p && a.p.roles) { const r = [...a.p.roles]; a.p = { ...a.p, get role() { return r.shift(); } }; }
  return new Function(...Object.keys(a), 'return ' + code)(...Object.values(a));
}

// Redesign step E (release 106): row 936 stood in the contact card, which went with the Contacts tab, so 109 of the 110
// rows are left (2 markup rows, not 3); and the new words of row 889 no longer name a phone number.
test('the recorded list is the rows of release A still on the page: 109 of its 110, 107 with new words, 2 removed, each row once', () => {
  const kinds = {}; for (const r of LIST.rows) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  assert.deepEqual(kinds, { words: 94, cases: 11, markup: 2, removed: 2 });
  assert.equal(new Set(LIST.rows.map((r) => r.row)).size, 109);
  assert.ok(!LIST.rows.some((r) => r.row === '936'));
});

for (const r of LIST.rows) test(`row ${r.row}, ${r.fn} (${r.kind}): the new words stand and the old ones are gone`, () => {
  const u = unit(r.fn);
  assert.ok(u, 'the unit ' + r.fn + ' is in app/ui.js');
  if (r.kind === 'words') {
    assert.match(u, sentence(r.new), 'the new words stand in ' + r.fn);
    assert.doesNotMatch(UI, sentence(r.old), 'the old words stand nowhere');
    return;
  }
  if (r.kind === 'removed') assert.ok(u.includes(r.last), 'the list ends with the entry before the removed one');
  else {
    assert.ok(u.includes(r.code), 'the expression stands in ' + r.fn + ' as the list writes it');
    const got = run(r.code, r.args);
    if (r.kind === 'cases') assert.equal(got, r.gives);
    else {
      assert.deepEqual(got.match(/<[^>]*>/g), r.tags, 'the tags of the old string, in order');
      assert.doesNotMatch(got.replace(/<[^>]*>/g, ''), /[<>&"'`]/, 'nothing of markup outside the tags');
      assert.equal(got.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(), r.gives);
    }
  }
  for (const g of r.gone) assert.ok(!UI.includes(g), 'the old words stand nowhere: ' + g);
});

test('the page holds no "safety number": the one name is "security code"', () => {
  assert.doesNotMatch(UI, /safety number/i);
});

// The fix round (2026-11-11). The review of the first build found five of its sentences wrong or weaker than the ones they
// replaced, and new words were approved for them (rows 380, 1177, 1204, 1206 and 1209). The row tests above prove that the
// new words stand; this one proves that what the first build said stands nowhere, with its signs written either way. The
// list is the fixture's `replaced`.
test('the words the review replaced are gone: what the first build said in rows 380, 1177, 1204, 1206 and 1209 stands nowhere in app/ui.js', () => {
  assert.deepEqual(LIST.replaced.map((x) => x.row), ['380', '1177', '1204', '1206', '1209']);
  for (const x of LIST.replaced) { assert.ok(x.was.length, 'row ' + x.row + ' names its words'); for (const w of x.was) assert.ok(!UI.includes(w), 'row ' + x.row + ': still stands: ' + w); }
});
