// A chat I am in must not vanish while a page of release 106 and a page of this release are both open (release 108, finding N1;
// SPEC.md 6). The 106 page keeps the NEWEST note for a chat and deletes the other, my own too (its chat watch as written at
// 1ed9955, fixtures/page106-inbox.txt). As first built, this release's page deleted someone else's note at once wherever my own
// note named the chat. A member's first message from a device leaves every member a note, stamped with the server's hour; in a
// later hour than my own note the 106 page deleted mine, this page deleted theirs, no note was left, and the chat dropped out of
// the list on every device and stayed out. A stranger who knew the chat's address could do it on purpose. Now, beside my own
// note, theirs is never shown and never held; it is deleted once a note of mine carries the same hour or a later one, never
// before: while mine is the older one it is written again, at most once per chat for the newest hour of theirs (a pile of their
// notes in one hour is answered by one note of mine, not one each: the pile tests below). So no page deletes the note another
// page keeps.
// The harness is requests-kit.js (the pages' own chat watches as written, stubs around them) with ONE mailbox under two or
// three pages: each page is handed the mailbox as the server holds it, what a page deletes is taken out, and a note it writes
// for itself is put in whole, with the hour of the writer's clock. The rounds go on until no page changes anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ME, HOUR, T, cidOf, page, dmRec, note } from './requests-kit.js';

const G = 'gAbCdEfGhIjKl', C1 = 'cPUBLICpublic';
const records = { [G]: { type: 'group', visibility: 'private', epoch: 0, ts: T, last: null }, [C1]: { type: 'channel', visibility: 'public', epoch: 0, ts: T, last: null } };
const kind = (cid) => (cid[0] === 'c' ? 'channel' : 'group');
const mine = (id, cid, ts) => note(id, 'invite', ME, cid, { own: 1, type: kind(cid) }, ts);
const theirs = (id, from, cid, ts = T) => note(id, 'invite', from, cid, { sg: 'signed by ' + from, type: kind(cid) }, ts);
const pg106 = () => page({ records, keys: [G], old: true }), pgNow = (o = {}) => page({ records, keys: [G], ...o });
const shown = (pg) => pg.list().map((c) => c.id).sort(), held = (pg) => (pg.S.invites || []).map((v) => v.cid + ' from ' + v.from);

// The mailbox and the pages on it. `together`: every page sees the same state and then all act (devices connected at the same
// moment); otherwise the pages take turns in the order given. `hour`: the stored hour of a note a page writes for itself.
function mailbox(notes) {
  const box = new Map(notes.map((n) => [n.id, n])), marks = new Map(); let seq = 0;
  const act = (pg, hour) => { const m = marks.get(pg) || { d: 0, w: 0 }; let changed = false;
    for (const id of pg.log.deleted.slice(m.d)) if (box.delete(id)) changed = true;
    for (const { to, p } of pg.log.wrote.slice(m.w)) { assert.equal(to, ME, 'a page writes a note only into its own mailbox'); const id = 'own' + (++seq); box.set(id, { id, ts: hour, own: 1, p: { ...p, to: ME, ts: hour } }); changed = true; }
    marks.set(pg, { d: pg.log.deleted.length, w: pg.log.wrote.length }); return changed; };
  const settle = async (pages, { together = true, hour = T } = {}) => {
    for (let round = 0; round < 12; round++) { let changed = false;
      if (together) { const now = [...box.values()]; for (const pg of pages) await pg.snap(now); for (const pg of pages) if (act(pg, hour)) changed = true; }
      else for (const pg of pages) { await pg.snap([...box.values()]); if (act(pg, hour)) changed = true; }
      if (!changed) return round; }
    assert.fail('the pages never came to rest'); };
  const left = (cid) => [...box.values()].filter((n) => n.p.cid === cid);
  return { box, settle, put: (n) => box.set(n.id, n), left, all: () => [...box.values()], marks: (cid) => left(cid).map((n) => n.own) };
}

for (const [name, order] of [['both pages see the note at the same moment', (o, n) => ({ pages: [o, n], together: true, mineStays: true })], ['guard: the 106 page acts first', (o, n) => ({ pages: [o, n], together: false, mineStays: false })], ['guard: this page acts first', (o, n) => ({ pages: [n, o], together: false, mineStays: true })]]) {
  test('a 106 page and this page on one mailbox, ' + name + ': a member\'s first message from a device leaves a note for the chat and the chat listed on both', async () => {
    const o = pg106(), n = pgNow(), m = mailbox([mine('aaa', G, T - HOUR)]), { pages, together, mineStays } = order(o, n);
    await m.settle(pages, { together }); assert.deepEqual([shown(o), shown(n)], [[G], [G]], 'in the chat, on both pages');
    m.put(theirs('zzz', 'carol', G));   // the note a member's first message leaves, in a later hour than mine
    await m.settle(pages, { together });
    assert.ok(m.left(G).length >= 1, 'a note for the chat is left in the mailbox');
    assert.deepEqual([shown(o), shown(n), held(n)], [[G], [G], []], 'listed on both pages, never held');
    // where this page saw the member's note before the 106 page deleted mine, the one note left is my own; where the 106 page was
    // first, the chat rests on the member's note until its next change, as it does between two 106 pages today
    assert.deepEqual(m.marks(G), mineStays ? [1] : [undefined]);
    // and once more, from another member an hour on
    m.put(theirs('zzy', 'dave5', G, T + HOUR)); await m.settle(pages, { together, hour: T + HOUR });
    assert.deepEqual([shown(o), shown(n), held(n), m.left(G).length], [[G], [G], [], 1]);
    if (!mineStays) return;
    assert.deepEqual(m.marks(G), [1]);
    const fresh = pgNow(); await m.settle([fresh], { hour: T + HOUR });   // a page of this release that opens afterwards finds my own note: nothing to join again
    assert.deepEqual([shown(fresh), held(fresh)], [[G], []]);
  });
}

test('the same with a stranger\'s note for a public channel I joined: it never takes my note\'s place, on either page, and the channel never goes', async () => {
  const o = pg106(), n = pgNow(), m = mailbox([mine('aaa', C1, T - HOUR)]);
  await m.settle([o, n]); m.put(theirs('zzz', 'zed99', C1)); await m.settle([o, n]);
  assert.deepEqual([shown(o), shown(n), held(n), m.marks(C1)], [[C1], [C1], [], [1]]);
  const fresh = pgNow(); await m.settle([fresh]);
  assert.deepEqual([shown(fresh), held(fresh)], [[C1], []], 'and the next session finds my own note, not an invitation from the stranger');
});

test('this page alone: a newer note of someone else beside my own is never shown or held in its place, mine is written again once, and then theirs goes', async () => {
  const n = pgNow(), m = mailbox([mine('aaa', C1, T - HOUR), theirs('zzz', 'zed99', C1)]);
  await n.snap(m.all());
  assert.deepEqual([shown(n), held(n), n.log.deleted, n.log.wrote], [[C1], [], [], [{ to: ME, p: { t: 'invite', cid: C1, from: ME, type: 'channel', peer: undefined } }]], 'first pass: mine is written again as it was, nothing is deleted yet');
  await n.snap(m.all());
  assert.deepEqual([n.log.deleted, n.log.wrote.length], [[], 1], 'a pass before my note is in the mailbox: theirs still stays, and nothing more is written');
  await m.settle([n]);
  assert.deepEqual([shown(n), held(n), m.all().map((x) => x.id)], [[C1], [], ['own1']], 'then theirs goes and the older note of mine is tidied away: the note written again is the one that stays');
});

test('a clock an hour behind: mine is written again once for each newer hour of theirs, not at every pass; the chat stays listed', async () => {
  // beside a 106 page: what this page writes carries its slow hour, so the 106 page deletes it too; the chat then rests on their note on both pages
  const o = pg106(), n = pgNow(), m = mailbox([mine('aaa', G, T - 2 * HOUR)]);
  await m.settle([o, n]); m.put(theirs('zzz', 'carol', G)); await m.settle([o, n], { hour: T - HOUR });
  assert.deepEqual([shown(o), shown(n), held(n), m.marks(G)], [[G], [G], [], [undefined]]);
  await n.snap(m.all()); await n.snap(m.all());
  assert.deepEqual(n.log.renoted, ['invite:' + G], 'one write for the one note of theirs, however many passes');
  // alone: theirs stays beside mine, not shown and not held, and is not deleted while mine is the older one
  const a = pgNow(), b = mailbox([mine('aaa', G, T - 2 * HOUR), theirs('zzz', 'carol', G)]);
  await b.settle([a], { hour: T - HOUR }); await a.snap(b.all()); await a.snap(b.all());
  assert.deepEqual([shown(a), held(a), a.log.renoted, b.all().map((x) => x.id).sort()], [[G], [], ['invite:' + G], ['own1', 'zzz']]);
  // a second note of theirs in the hour already answered writes nothing (it wrote one more before the pile fix); one in a later hour writes one more
  b.put(theirs('zzy', 'dave5', G)); await b.settle([a], { hour: T - HOUR });
  assert.deepEqual([shown(a), held(a), a.log.renoted.length], [[G], [], 1], 'a second note of theirs in the same hour: no write');
  b.put(theirs('zzx', 'erin7', G, T + HOUR)); await b.settle([a], { hour: T });
  assert.deepEqual([shown(a), held(a), a.log.renoted.length], [[G], [], 2], 'a note of theirs in a later hour: one more write, no more');
});

test('guard: a note of someone else in the same hour as mine, or an older one, goes at once and nothing is written', async () => {
  const n = pgNow(); await n.snap([mine('aaa', G, T), theirs('zzz', 'carol', G, T), theirs('zzy', 'dave5', G, T - HOUR)]);
  assert.deepEqual([shown(n), held(n), n.log.deleted.slice().sort(), n.log.wrote], [[G], [], ['zzy', 'zzz'], []]);
});

test('guard: two pages of this release on one mailbox: theirs goes, and exactly one note of mine is left', async () => {
  const a = pgNow(), b = pgNow(), m = mailbox([mine('aaa', G, T - HOUR)]);
  await m.settle([a, b]); m.put(theirs('zzz', 'carol', G)); await m.settle([a, b]);
  assert.deepEqual([shown(a), shown(b), held(a), held(b), m.marks(G)], [[G], [G], [], [], [1]]);
});

test('guard: two 106 pages on one mailbox keep the chat (the live behaviour)', async () => {
  const a = pg106(), b = pg106(), m = mailbox([mine('aaa', G, T - HOUR)]);
  await m.settle([a, b]); m.put(theirs('zzz', 'carol', G)); await m.settle([a, b]);
  assert.deepEqual([shown(a), shown(b), m.left(G).length], [[G], [G], 1]);
});

test('guard: leaving the chat takes every note for it out of the mailbox, also one left beside mine', async () => {
  const n = pgNow(), m = mailbox([mine('aaa', G, T - 2 * HOUR), theirs('zzz', 'carol', G)]);
  await m.settle([n], { hour: T - HOUR });   // a slow clock, so theirs stays beside mine
  n.S.forgetPointers(G); await m.settle([n], { hour: T - HOUR });
  assert.deepEqual(m.left(G), []);
});

// Not a group fault only: an invitation note that names a one-on-one address is no invitation (invite-hold.test.js), but beside
// my own note for that chat it reaches the same lines. Who can leave it: someone who knows the address of the one-on-one chat.
test('an invitation note that names a one-on-one address, beside my own note for that chat: the chat stays on both pages and keeps my own note', async () => {
  const D = cidOf('carol'), recs = { [D]: dmRec() }, dms = { [D]: { peer: 'carol' } };
  const o = page({ records: recs, dms, old: true }), n = page({ records: recs, dms });
  const m = mailbox([note('aaa', 'dm', ME, D, { own: 1, peer: 'carol' }, T - HOUR)]);
  await m.settle([o, n]); assert.deepEqual([shown(o), shown(n)], [[D], [D]]);
  m.put(note('zzz', 'invite', 'zed99', D, { sg: 'signed by zed99', type: 'group' })); await m.settle([o, n]);
  assert.deepEqual([shown(o), shown(n), held(n), m.left(D).map((x) => [x.own, x.p.t, x.p.type, x.p.peer])], [[D], [D], [], [[1, 'dm', 'dm', 'carol']]], 'my note is written again as the one-on-one note it was');
});

// Beyond the plan's eleven: the two cases the build brief asks to be run.
test('two pages of this release and a 106 page on one mailbox, a member\'s first note in a later hour, in every order: the chat stays on all three and exactly one note of mine is left', async () => {
  for (const [name, order] of [['all at the same moment', (o, a, b) => ({ pages: [o, a, b], together: true })], ['this release first', (o, a, b) => ({ pages: [a, b, o], together: false })], ['the 106 page between the two', (o, a, b) => ({ pages: [a, o, b], together: false })]]) {
    const o = pg106(), a = pgNow(), b = pgNow(), m = mailbox([mine('aaa', G, T - HOUR)]), { pages, together } = order(o, a, b);
    await m.settle(pages, { together }); m.put(theirs('zzz', 'carol', G)); await m.settle(pages, { together });
    assert.deepEqual([shown(o), shown(a), shown(b), held(a), held(b), m.marks(G)], [[G], [G], [G], [], [], [1]], name);
  }
});

test('a pass still in flight when the chat watch is stopped (a device removal, a change of account) writes no note', async () => {
  const n = pgNow(); await n.snap([mine('aaa', G, T - HOUR)]); assert.deepEqual(shown(n), [G]);
  const pass = n.snap([mine('aaa', G, T - HOUR), theirs('zzz', 'carol', G)]);   // the pass has begun: it is opening the new note
  n.stop(); await pass;
  assert.deepEqual(n.log.wrote, [], 'nothing is written once the watch has ended');
});

// The pile (release 108, after the review of N1, its L1): K newer notes of other people for one chat I am in, all in one hour
// (the server stamps a note left for me with its own hour). Written once for each, my own notes filled the mailbox, which keeps
// 500 and pushes out other people's oldest notes first, then my own: waiting invitations went, and with two devices opening at
// once every other chat left the list. Now one note of mine answers the pile, at one pass and over the passes that follow.
const pile = (k, mk = (i) => theirs('p' + String(i).padStart(3, '0'), 'pile' + i, G)) => Array.from({ length: k }, (_, i) => mk(i));
for (const k of [1, 5, 100]) {
  test(`the pile: ${k} newer note(s) of other people for one chat at one pass: one note of mine is written, later passes write none, and the chat rests on it`, async () => {
    const n = pgNow(), m = mailbox([mine('aaa', G, T - HOUR), ...pile(k)]);
    await n.snap(m.all()); assert.equal(n.log.wrote.length, 1, 'one write at the first pass');
    await n.snap(m.all()); assert.equal(n.log.wrote.length, 1, 'a pass before my note is in the mailbox: none more');
    await m.settle([n]); await n.snap(m.all());
    assert.deepEqual([n.log.wrote.length, shown(n), held(n), m.marks(G)], [1, [G], [], [1]], 'at the end exactly one note for the chat, my own');
  });
  test(`the pile of ${k} with my page's clock an hour behind the notes: at most one write in all the passes together`, async () => {
    const n = pgNow(), m = mailbox([mine('aaa', G, T - 2 * HOUR), ...pile(k)]);
    await m.settle([n], { hour: T - HOUR }); for (let i = 0; i < 3; i++) await n.snap(m.all());
    assert.deepEqual([n.log.wrote.length, shown(n), held(n), m.marks(G).filter((x) => x === 1).length], [1, [G], [], 1]);
  });
}

test('a pile over three hours, all newer than mine, at one pass: one write, for the newest hour', async () => {
  // the server lets 100 notes an hour into one mailbox, so a pile of hundreds spans hours; the snapshot is ordered by id, here oldest hour first
  const n = pgNow(), m = mailbox([mine('aaa', G, T - 3 * HOUR), ...[2, 1, 0].flatMap((h) => pile(20, (i) => theirs('h' + (2 - h) + String(i).padStart(3, '0'), 'pile' + i, G, T - h * HOUR)))]);
  await n.snap(m.all()); assert.equal(n.log.wrote.length, 1);
  await m.settle([n]); assert.deepEqual([n.log.wrote.length, shown(n), m.marks(G)], [1, [G], [1]]);
});

for (const [name, o, mk] of [['a sender with no signature', {}, (i) => note('u' + String(i).padStart(3, '0'), 'invite', 'anon' + i, G, { type: 'group' })],
  ['a person I blocked', { blocked: ['blk99'], held: [G] }, (i) => theirs('b' + String(i).padStart(3, '0'), 'blk99', G)]]) {
  test('the pile of 100 left by ' + name + ': one write', async () => {
    const n = pgNow(o), m = mailbox([mine('aaa', G, T - HOUR), ...pile(100, mk)]);
    await n.snap(m.all()); await m.settle([n]);
    assert.deepEqual([n.log.wrote.length, shown(n), held(n), m.marks(G)], [1, [G], [], [1]]);
  });
}

test('the pile of 100 with two devices opening at the same moment, and with a 106 page beside: each page of this release writes once', async () => {
  const a = pgNow(), b = pgNow(), m = mailbox([mine('aaa', G, T - HOUR), ...pile(100)]);
  await m.settle([a, b]);
  assert.deepEqual([a.log.wrote.length, b.log.wrote.length, shown(a), shown(b), m.marks(G)], [1, 1, [G], [G], [1]]);
  const o = pg106(), n = pgNow(), x = mailbox([mine('aaa', G, T - HOUR)]);
  await x.settle([o, n]); for (const t of pile(100)) x.put(t); await x.settle([o, n]);
  assert.deepEqual([n.log.wrote.length, shown(o), shown(n), held(n), x.left(G).length], [1, [G], [G], [], 1]);
});

test('guard (N1): after the pile was answered, a note of someone else in a later hour writes one more note of mine, and then the chat rests on mine', async () => {
  const n = pgNow(), m = mailbox([mine('aaa', G, T - HOUR), theirs('zzz', 'carol', G)]);
  await m.settle([n]); assert.deepEqual([n.log.wrote.length, m.marks(G)], [1, [1]]);
  m.put(theirs('zzy', 'dave5', G, T + HOUR)); await m.settle([n], { hour: T + HOUR });
  assert.deepEqual([n.log.wrote.length, shown(n), held(n), m.marks(G)], [2, [G], [], [1]]);
});

test('guard: a write of mine that fails is tried again at a later pass, once', async () => {
  const n = pgNow(), m = mailbox([mine('aaa', G, T - HOUR), theirs('zzz', 'carol', G)]);
  n.log.fail = 1; await n.snap(m.all()); assert.equal(n.log.wrote.length, 0, 'the write failed');
  await n.snap(m.all()); assert.equal(n.log.wrote.length, 1, 'the next pass tries again');
  await m.settle([n]); assert.deepEqual([n.log.wrote.length, shown(n), m.marks(G)], [1, [G], [1]]);
});
