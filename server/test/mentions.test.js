// @mentions (SPEC.md 12.3): the page's mention block lifted out of app/ui.js. A mention is found from the text
// alone, with no lookup; only a tap looks a handle up, and that part needs the page, so it is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const a = src.indexOf('/* ===== HUSH MENTIONS BEGIN ===== */'), b = src.indexOf('/* ===== HUSH MENTIONS END ===== */');
assert.ok(a > 0 && b > a, 'mention markers present in app/ui.js');
const block = src.slice(a, b);
const { splitMentions } = new Function(block + '\nreturn { splitMentions };')();
const parts = (t) => splitMentions(t).map((s) => (s.h ? '@' + s.h : s.t));

test('an @username becomes a link from the text alone, keeping the typed capitals and the text around it', () => {
  assert.deepEqual(splitMentions('hi @Olivia!'), [{ t: 'hi ' }, { t: '@Olivia', h: 'olivia' }, { t: '!' }]);
  assert.deepEqual(parts('@ann and @bob_2'), ['@ann', ' and ', '@bob_2']);
  assert.deepEqual(parts('(@ann) @bob, @cat.'), ['(', '@ann', ') ', '@bob', ', ', '@cat', '.']);
  assert.deepEqual(parts('line one\n@ann on line two'), ['line one\n', '@ann', ' on line two']);
  assert.deepEqual(parts('no mentions here'), ['no mentions here']);
  assert.deepEqual(splitMentions(''), []);
  assert.deepEqual(splitMentions(null), []);
  assert.deepEqual(parts('@' + 'a'.repeat(20)), ['@' + 'a'.repeat(20)], 'twenty characters is the longest username');
});

test('what is not a mention: an email address, an @ glued to a word, @@, too short, too long', () => {
  assert.deepEqual(parts('mail me at ann@example.com'), ['mail me at ann@example.com']);
  assert.deepEqual(parts('x@ann'), ['x@ann']);
  assert.deepEqual(parts('@@ann'), ['@@ann']);
  assert.deepEqual(parts('@ab is too short'), ['@ab is too short']);
  assert.deepEqual(parts('@' + 'a'.repeat(21)), ['@' + 'a'.repeat(21)]);
  assert.deepEqual(parts('@ann-x'), ['@ann', '-x'], 'a dash ends a username');
  assert.deepEqual(parts('@Anné'), ['@Anné'], 'an accented letter is not part of a username, and the mention must end cleanly');
});

test('finding mentions looks nothing up: the pure part of the block touches no server, store or directory', () => {
  const pure = block.split('async function openMention')[0];
  assert.ok(!/S\.db|lookupHandle|loadDir|fetch\(|S\.dir/.test(pure), 'splitMentions is text work only');
  assert.match(block, /async function openMention/, 'the tap handler exists');
  for (const call of ['lookupHandle(', 'isBlocked(', 'openDm(', 'openSaved(']) assert.ok(block.includes(call), 'openMention uses ' + call);
});

test('tapping a mention: your own name opens your Saved Messages, anyone else\'s the chat with them', () => {
  const tap = block.slice(block.indexOf('async function openMention'));
  assert.match(tap, /if\(h===S\.me\.handle\)\{openSaved\(\);return\}/, 'own name: Saved Messages');
  assert.ok(!tap.includes('openProfile('), 'never the profile any more');
  assert.ok(tap.indexOf('openSaved(') < tap.indexOf('isBlocked('), 'decided before any lookup, block check or network');
  assert.match(tap, /openDm\(h\);\s*\}\s*$/, 'someone else: the one-on-one chat, as before');
  assert.match(src, /function openSaved\(\)\{openDm\(S\.me\.handle\)\}/, 'Saved Messages is the chat with yourself');
});
