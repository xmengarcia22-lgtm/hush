// The @mention picker (SPEC.md 12.3): its pure parts lifted out of app/ui.js. Who is offered comes from the
// conversation the page already holds, never from a search; the query is read from the text before the caret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const a = src.indexOf('/* ===== HUSH MENTION PICKER BEGIN ===== */'), b = src.indexOf('/* ===== HUSH MENTION PICKER END ===== */');
assert.ok(a > 0 && b > a, 'mention picker markers present in app/ui.js');
const block = src.slice(a, b);
const { mentionQuery, mentionPeople, mentionMatches } = new Function(block + '\nreturn { mentionQuery, mentionPeople, mentionMatches };')();

test('the query is the @ and the letters right before the caret, and nothing else', () => {
  assert.deepEqual(mentionQuery('hello @ov'), { start: 6, q: 'ov' });
  assert.deepEqual(mentionQuery('@'), { start: 0, q: '' }, 'a lone @ opens the list');
  assert.deepEqual(mentionQuery('hi @Ov'), { start: 3, q: 'ov' }, 'typed capitals do not matter');
  assert.deepEqual(mentionQuery('(@an'), { start: 1, q: 'an' });
  assert.deepEqual(mentionQuery('one @bo'), { start: 4, q: 'bo' }, 'the no-break space the picker inserts counts as a space');
  assert.equal(mentionQuery('hi @ov '), null, 'a space after the letters ends the query');
  assert.equal(mentionQuery('mail me@x'), null, 'an @ glued to a word is not a query');
  assert.equal(mentionQuery('@' + 'a'.repeat(21)), null, 'longer than a username');
  assert.equal(mentionQuery(''), null);
  assert.equal(mentionQuery(null), null);
});

test('who can be offered: group members, a channel\'s owner and admins, the other person in a one-on-one chat, never me', () => {
  assert.deepEqual(mentionPeople({ type: 'group', members: ['me', 'ann', 'bob', 'ann'] }, 'me'), ['ann', 'bob'], 'no duplicates, no me');
  assert.deepEqual(mentionPeople({ type: 'channel', owner: 'olga', admins: ['olga', 'adam', 'me'] }, 'me'), ['olga', 'adam']);
  assert.deepEqual(mentionPeople({ owner: 'olga', members: ['x', 'y'] }, 'me'), ['olga'], 'a channel offers its admins, not whoever subscribed');
  assert.deepEqual(mentionPeople({ type: 'dm', members: ['me', 'pat'] }, 'me'), ['pat']);
  assert.deepEqual(mentionPeople({ type: 'dm', members: ['me', 'me'] }, 'me'), [], 'Saved Messages offers nobody');
  assert.deepEqual(mentionPeople({ type: 'group' }, 'me'), []);
  assert.deepEqual(mentionPeople(null, 'me'), []);
  assert.deepEqual(mentionPeople({ type: 'group', members: ['me', 7, null, 'ann'] }, 'me'), ['ann'], 'only handles');
});

test('matching: username prefix first, then name prefix, then a word of the name, then anything containing the letters', () => {
  const people = ['olivia', 'ann', 'bobby', 'zed'];
  const names = { olivia: 'Olivia Lane', ann: 'Ann Smith', bobby: 'Robert', zed: 'Zed' };
  const nameOf = (h) => names[h];
  assert.deepEqual(mentionMatches('o', people, nameOf), ['olivia', 'bobby'], 'handle prefix beats a substring');
  assert.deepEqual(mentionMatches('rob', people, nameOf), ['bobby'], 'a name prefix finds a username that looks nothing like it');
  assert.deepEqual(mentionMatches('smi', people, nameOf), ['ann'], 'a later word of the name');
  assert.deepEqual(mentionMatches('lane', people, nameOf), ['olivia']);
  assert.deepEqual(mentionMatches('OL', people, nameOf), ['olivia'], 'capitals do not matter');
  assert.deepEqual(mentionMatches('', people, nameOf), ['ann', 'bobby', 'olivia', 'zed'], 'no letters yet: everyone, by username');
  assert.deepEqual(mentionMatches('', people, nameOf, 2), ['ann', 'bobby'], 'the list is capped');
  assert.deepEqual(mentionMatches('qqq', people, nameOf), []);
  assert.deepEqual(mentionMatches('x', people, () => undefined), [], 'a missing name does not throw');
  assert.equal(mentionMatches('', Array.from({ length: 20 }, (_, i) => 'p' + String(i).padStart(2, '0')), () => '').length, 6, 'six by default');
});

test('the picker is local: its pure parts touch no server, directory or search', () => {
  assert.ok(!/S\.db|S\.dir|lookupHandle|loadDir|searchUsers|fetch\(/.test(block), 'nothing is looked up to make a suggestion');
  const composer = src.slice(src.indexOf('function buildComposer('), src.indexOf('function setReply('));
  const picker = composer.slice(composer.indexOf('const findMention='), composer.indexOf('let dT=null;'));
  assert.ok(picker.includes('mentionPeople(') && picker.includes('mentionMatches(') && picker.includes('mentionQuery('), 'the composer uses the pure parts');
  assert.ok(!/S\.db|lookupHandle|loadDir|searchUsers|fetch\(/.test(picker), 'and the composer side of the picker looks nothing up either');
});
