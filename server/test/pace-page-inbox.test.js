// Release 111 (page): the order in which the chat watch (watchInbox, app/ui.js) starts the chats its mailbox names. The
// start's queue in app/adapter.js sends a chat's frames in the list's order, and for a chat no list has placed yet in the
// order the chats were begun. The page used to begin them in the order of the notes' ids, which are random. Now:
//  - the newest note first (the server stamps a note with the hour it was left, and a person's page leaves a fresh one
//    with the first message it sends after it starts, so a chat someone just wrote in comes early);
//  - a stranger's one-on-one note after every chat of mine. A chat of mine: one that rests on a note I wrote myself, a
//    group or channel, or a one-on-one chat with a person my vault knows. This holds with "Send a request first" off too:
//    the order is worked out before the notes are filed, since filing a note puts its person into the vault;
//  - what a note tells this device (notePointer) is still taken in the notes' own order, so which of two one-on-one chats
//    a person is known under does not change;
//  - only chats not yet watched are ordered: a later pass with nothing new works nothing out.
// The page harness is requests-kit.js (watchInbox, noteOk, notePointer and the request helpers run as written; the chat
// records, the keys and the mailbox are made up). WHAT IT DOES NOT SEE: the connection and its queue (pace-page-queue.test.js
// and the proof), the real sealing, the server's stamp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ME, HOUR, T, cidOf, page, dmRec, note } from './requests-kit.js';

const G = (n) => 'g' + (n + 'XXXXXXXXXXXXXXXXXXXXXXXX').slice(0, 22), GROUP = { type: 'group', epoch: 0, ts: T, members: [ME] };
const mine = (id, peer, ts) => note(id, 'dm', ME, cidOf(peer), { peer, own: 1 }, ts);            // my own note for a one-on-one chat
const group = (id, name, ts) => note(id, 'invite', ME, G(name), { type: 'group', own: 1 }, ts);  // my own note for a group
const theirs = (id, from, ts) => note(id, 'dm', from, cidOf(from), {}, ts);                      // the other person's note for our one-on-one chat
// The mailbox of the tests, ids in another order than the one wanted: two strangers first by id, a known person's fresh note late.
const BOX = [
  theirs('a1', 'mallory1', T), theirs('a2', 'mallory2', T - HOUR),          // strangers, their notes the freshest of all
  mine('b1', 'dave', T - 5 * HOUR), group('b2', 'team', T - 2 * HOUR), mine('b3', 'erin', T - 9 * HOUR),
  theirs('c1', 'carol', T),                                                  // carol, whom my vault knows, wrote this hour
  mine('d1', 'frank', T - HOUR),
];
const RECORDS = Object.fromEntries([...['mallory1', 'mallory2', 'dave', 'erin', 'carol', 'frank', 'gina', 'heidi', 'mallory3'].map((h) => [cidOf(h), dmRec()]), [G('team'), GROUP], [cidOf('gina~old'), dmRec()]]);
const VAULT = { [cidOf('carol')]: { peer: 'carol' } };
const names = (cids) => cids.map((c) => (c === G('team') ? 'team' : ['mallory1', 'mallory2', 'mallory3', 'dave', 'erin', 'carol', 'frank', 'gina', 'heidi'].find((h) => cidOf(h) === c) || c));
const WANT = ['carol', 'frank', 'team', 'dave', 'erin', 'mallory1', 'mallory2'];

test('the chats are begun newest note first, a known person\'s fresh note ahead of my older chats and a stranger\'s one-on-one note after every chat of mine: with "Send a request first" off', async () => {
  const pg = page({ records: RECORDS, dms: VAULT, ownRequests: false, seen: false });
  await pg.snap(BOX);
  assert.deepEqual(names(pg.log.watched), WANT, 'not the order of the notes\' ids (mallory1, mallory2, dave, team, erin, carol, frank)');
  assert.deepEqual([pg.state(cidOf('mallory1')).request, pg.state(cidOf('mallory1')).vault], [false, { peer: 'mallory1' }], 'with the setting off the stranger\'s chat is an ordinary chat once it is in, filed under its person as before');
});

test('the same order with "Send a request first" on, where a stranger\'s note is a request', async () => {
  const pg = page({ records: RECORDS, dms: VAULT });
  await pg.snap(BOX);
  assert.deepEqual(names(pg.log.watched), WANT);
  assert.equal(pg.state(cidOf('mallory1')).request, true);
});

test('a person the vault does not hold is not known: every one-on-one chat that is not on my own note then comes after the chats that are', async () => {
  const pg = page({ records: RECORDS, ownRequests: false, seen: false });   // no entry for carol: a vault that lost it, or one not filled yet
  await pg.snap(BOX);
  assert.deepEqual(names(pg.log.watched), ['frank', 'team', 'dave', 'erin', 'mallory1', 'carol', 'mallory2'], 'mine by my own notes, newest first; then the others, newest first, in the notes\' order where the hour is the same');
});

test('what a note tells this device is taken in the notes\' own order, as before: a person with two one-on-one chats stays known under the same one', async () => {
  const X = cidOf('gina'), Y = cidOf('gina~old');
  const pg = page({ records: RECORDS, dms: { [Y]: { peer: 'gina' } }, known: { gina: X }, ownRequests: false, seen: false });
  // the note with the smaller id is the older one: begun newest first, the chats are started Y then X; noted in that order gina would be known under X
  await pg.snap([note('e1', 'dm', ME, X, { peer: 'gina', own: 1 }, T - 8 * HOUR), note('e2', 'dm', ME, Y, { peer: 'gina', own: 1 }, T - HOUR)]);
  assert.deepEqual(pg.log.watched, [Y, X], 'begun newest note first');
  assert.equal(pg.env.dmIds.get('gina'), Y, 'known under the chat of the last note by id, as the page before release 111 leaves it');
  assert.deepEqual([pg.S.dmPeers[X], pg.S.dmPeers[Y]], ['gina', 'gina']);
});

test('a later pass begins only the chats that are new, in the same order, and leaves the watched ones alone', async () => {
  const pg = page({ records: RECORDS, dms: VAULT, ownRequests: false, seen: false });
  await pg.snap(BOX);
  const before = pg.log.watched.length;
  await pg.snap([...BOX, theirs('0a', 'mallory3', T + HOUR), mine('zz', 'heidi', T - 20 * HOUR), mine('0b', 'gina', T - 3 * HOUR)]);
  assert.deepEqual(names(pg.log.watched.slice(before)), ['gina', 'heidi', 'mallory3'], 'my two first, the newer note ahead; the stranger\'s newest note of all last');
  await pg.snap([...BOX, theirs('0a', 'mallory3', T + HOUR), mine('zz', 'heidi', T - 20 * HOUR), mine('0b', 'gina', T - 3 * HOUR)]);
  assert.equal(pg.log.watched.length, before + 3, 'the same mailbox again: nothing is begun twice');
});

test('the order is worked out once per chat, and not at all in a pass that has nothing to begin', async () => {
  const N = 64, people = Array.from({ length: N }, (_, i) => 'p' + String(i).padStart(3, '0'));
  const records = Object.fromEntries(people.map((h) => [cidOf(h), dmRec()])), known = Object.fromEntries(people.map((h) => [h, cidOf(h)]));
  const pg = page({ records, known, ownRequests: false, seen: false });
  let scans = 0;   // every look through the vault's one-on-one entries: what "do I know this person" costs
  pg.S.prefs.dms = new Proxy(pg.S.prefs.dms, { ownKeys(t) { scans++; return Reflect.ownKeys(t); } });
  const box = people.map((h, i) => theirs('n' + String(i).padStart(3, '0'), h, T - (i % 7) * HOUR));
  await pg.snap(box);
  assert.equal(pg.log.watched.length, N);
  assert.ok(scans <= 3 * N, `at most a few looks per chat for ${N} new chats, not one per comparison of a sort: ${scans}`);
  scans = 0; await pg.snap(box);
  assert.equal(scans, 0, 'a pass with nothing to begin looks nobody up');
});
