// Release 111 (page), BOTH HALVES: this file needs the built app/adapter.js of release 111 (the paced queue) and the built
// app/ui.js (listRank, the kept row's tap). It fails on the page before release 111.
//
// The order of a start, with the page's two halves together as written (pace-page-kit.js): connectServer in app/adapter.js
// hands the adapter the page's own order (`rank`: the live list's, and the kept list's through listRank while the live one
// is still coming) and the chat the person waits for (`first`: the row they tapped, or the chat of a pushed call).
// Release 101's test of this was a text match of those two options; here they run.
//  - A cold start follows the list as last drawn: the kept rows first and in their order, whatever order the chats are begun in.
//  - A tap on a kept row whose record has not come yet sends that chat's frames now, ahead of everything waiting.
//  - The chat of a pushed call never waits.
//  - Nothing is refused: the stand-in server keeps the real allowance (300 frames, then 5 a second) and counts its refusals.
// The clock is the test's, so a round trip is exactly `RT` ms and a loaded PC changes no number.
// WHAT IT DOES NOT SEE: the real server, watchInbox (the chats are begun here by hand, as its start does: one record watch
// each; its own order is pace-page-inbox.test.js), the unread counts (pace-unread-starve.test.js), the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clock, server, page, ids } from './pace-page-kit.js';

const RT = 100;   // ms for a reply, as a phone's connection
const row = (id) => ({ id, k: 'group', n: 'g', ts: 1, s: '', u: 0, m: false, p: false, at: false, b: null, x: 0 });   // a kept row, as rowModel makes it
// a deterministic shuffle, so the kept list's order is neither the ids' nor the order the chats are begun in
const shuffled = (a) => a.map((x, i) => [(i * 7919 + 13) % 101, i, x]).sort((p, q) => p[0] - q[0] || p[1] - q[1]).map((t) => t[2]);

test('the page hands the connection its own order and the chat the person waits for', async () => {
  const clk = clock(), srv = server(clk, { rt: RT }), P = page(clk, srv, { kept: [row('c7'), row('c2'), null, row('c9')] }), S = P.S;
  await P.start();
  const { rank, first } = P.opts();
  assert.equal(typeof rank, 'function', 'connectServer gives the adapter a rank'); assert.equal(typeof first, 'function', 'and a first');
  assert.deepEqual(['c7', 'c2', 'c9', 'c1'].map(rank), [0, 1, 3, -1], 'no live list yet: the kept list\'s places; a chat it does not hold has none');
  S.convs = [{ id: 'c9' }, { id: 'c1' }];
  assert.deepEqual(['c9', 'c1', 'c7', 'c2', 'c5'].map(rank), [0, 1, 0, 1, -1], 'a chat the live list holds has its live place; the others their kept one while the live list is not whole');
  S.convsLoaded = true;
  assert.deepEqual(['c9', 'c1', 'c7', 'c5'].map(rank), [0, 1, -1, -1], 'the live list whole: its order alone');
  assert.deepEqual([first('c5'), first(undefined)], [false, false], 'nobody is waited for');
  S.wantOpen = 'c5'; assert.deepEqual([first('c5'), first('c6')], [true, false], 'the row the person tapped');
  S.wantOpen = null; S.pushCall = { cid: 'c6' }; assert.deepEqual([first('c5'), first('c6')], [false, true], 'the chat of a pushed call');
});

test('a cold start follows the list as last drawn: the kept rows first and in their order, the rest after them, and the server refuses nothing', async () => {
  const all = ids(80), keptIds = shuffled(all.slice(0, 60)), rest = all.slice(60);
  const clk = clock(), srv = server(clk, { rt: RT }), P = page(clk, srv, { kept: keptIds.map(row) });
  await P.start();
  const ws = [...rest, ...all.slice(0, 60)].map((cid) => P.watch(cid));   // begun in another order: the chats outside the kept list first, then the kept ones by id
  await clk.run(60000);
  assert.deepEqual(srv.of('get'), [...keptIds, ...rest], 'each chat\'s first frame (the read of its record for its keys) reaches the server in the kept list\'s order, then the chats no list has placed in the order they were begun');
  const subs = srv.of('sub'), lastKept = Math.max(...keptIds.map((c) => subs.indexOf(c))), firstRest = Math.min(...rest.map((c) => subs.indexOf(c)));
  assert.ok(subs.length === 80 && lastKept < firstRest, `every kept row is watched before any chat outside the kept list (last kept ${lastKept}, first other ${firstRest} of ${subs.length})`);
  assert.deepEqual(keptIds.map((c) => subs.indexOf(c)), keptIds.map((_, i) => i), 'and the kept rows in their order');
  assert.deepEqual([ws.filter((w) => w.at != null).length, srv.of('chat.open').length, srv.frameRefused], [80, 80, 0], 'all 80 listed, each chat opened once, no frame refused');
});

test('a tap on a kept row whose record has not come is sent for at once: its chat is in within four round trips while the chats ahead of it still wait', async () => {
  const all = ids(150), keptIds = all.slice(0, 90);
  const clk = clock(), srv = server(clk, { rt: RT }), P = page(clk, srv, { kept: keptIds.map(row) });
  await P.start();
  const t0 = clk.now(), ws = new Map(all.map((cid) => [cid, P.watch(cid)]));
  await clk.run(3000);
  const waitingKept = keptIds.filter((c) => ws.get(c).at == null), tapped = waitingKept[waitingKept.length - 1];
  assert.ok(waitingKept.length > 20, `three seconds into a start of 150 chats, kept rows still wait for their record (${waitingKept.length})`);
  const tapAt = clk.now();
  P.drawRow(row(tapped)).onclick();   // the row drawn from the kept list, tapped as the person taps it
  assert.equal(P.S.wantOpen, tapped);
  await clk.run(4 * RT + 20);
  assert.ok(ws.get(tapped).at != null && ws.get(tapped).at - tapAt <= 4 * RT, `the tapped chat's record came ${ws.get(tapped).at == null ? 'not at all' : ws.get(tapped).at - tapAt + ' ms after the tap'} (the last kept row; at most four round trips of ${RT} ms)`);
  const still = waitingKept.filter((c) => c !== tapped && ws.get(c).at == null).length;
  assert.ok(still >= waitingKept.length - 5, `the rows ahead of it were not rushed with it (${still} of ${waitingKept.length - 1} still wait)`);
  await clk.run(120000);
  assert.deepEqual([[...ws.values()].filter((w) => w.at != null).length, srv.frameRefused, srv.of('chat.open').filter((c) => c === tapped).length], [150, 0, 1], 'in the end all 150 are listed, nothing was refused, and the tapped chat was opened once');
  assert.ok((Math.max(...[...ws.values()].map((w) => w.at)) - t0) / 1000 <= 1.2 * (3 * 150 - 209) / 5, 'the whole list inside the bound: three frames a chat, 209 at once, then 5 a second, a fifth over');
});

test('the chat of a pushed call never waits: begun last in a start of 150 chats, it is in within four round trips', async () => {
  const all = ids(150), call = 'cCALLXXXXXXXX';
  const clk = clock(), srv = server(clk, { rt: RT }), P = page(clk, srv, { kept: all.slice(0, 90).map(row) });
  await P.start();
  P.S.pushCall = { cid: call };   // the page came up for a pushed call in this chat
  const t0 = clk.now(), ws = all.map((cid) => P.watch(cid)), w = P.watch(call);
  await clk.run(4 * RT + 20);
  assert.ok(w.at != null && w.at - t0 <= 4 * RT, `the call's chat is in ${w.at == null ? 'not at all' : w.at - t0 + ' ms after the start'} (at most four round trips of ${RT} ms)`);
  assert.ok(ws.filter((x) => x.at == null).length > 50, 'while most of the others still wait their turn');
  await clk.run(120000);
  assert.deepEqual([ws.filter((x) => x.at != null).length, srv.frameRefused], [150, 0]);
});

// Review fix 10: connectServer also tells the adapter when a device removal is running. The adapter asks at each eviction of a
// chat that would otherwise wait (the third inside a minute, and after), and then opens the chat again at once: the removal's
// read stage needs the chat's newest key in the device's key store before the account key changes.
test('the page tells the connection when a device removal is running: evictNow answers by S.rekeying each time it is asked', async () => {
  const clk = clock(), srv = server(clk, { rt: RT }), P = page(clk, srv), S = P.S;
  await P.start();
  const { evictNow } = P.opts();
  assert.equal(typeof evictNow, 'function', 'connectServer gives the adapter evictNow');
  assert.equal(evictNow('c1'), false, 'no removal: wait as usual');
  S.rekeying = true; assert.equal(evictNow('c1'), true, 'a removal is running: no wait');
  S.rekeying = false; assert.equal(evictNow('c1'), false, 'the removal over: wait as usual again');
});
