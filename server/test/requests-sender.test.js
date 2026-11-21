// The sender's half of a message request (release 108, SPEC.md 5.6). A first message to a person who asks for requests first
// leaves two notes for that person: the one that makes the chat (ensureDmDoc, tagged `request`) and the fresh one every first
// message from a page sends in case a note was lost (sendBody). Until release 108 the second was tagged `dm`, and a receiver
// whose app was closed read the two at once: whichever came first in its pass decided, so the request showed as a normal chat
// about every second time. Now the second note says `request` too while the sender waits for the answer. The harness is
// requests-kit.js: the page's own ensureDmDoc, sendBody and ensureInbox as written, with stubs around them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { UI, lift, ME, HOUR, T, cidOf, page, dmRec, note, sender } from './requests-kit.js';

const tags = (ns) => ns.map((n) => n.p.t);

test('a first message to a person with the setting on: every note left for them is tagged request', async () => {
  const a = sender(); await a.send('hello');
  assert.deepEqual(tags(a.to(ME)), ['request', 'request'], 'the note that makes the chat, and the fresh one after the message');
  assert.deepEqual(a.api.dmInfo(a.CID), { peer: ME, req: 'out' });
});

test('the same two notes, read by the receiver\'s page of today with the app closed until both are there: a request in both id orders and with one stored hour between', async () => {
  const a = sender(); await a.send('hello');
  const [n1, n2] = a.to(ME).map((n) => n.p);
  // bob's page of release 106 (its chat watch as written at 1ed9955), started after both notes arrived
  const bob = async (notes) => { const b = page({ old: true, known: { alice: a.CID }, records: { [a.CID]: dmRec() } }); await b.snap(notes); return b.state(a.CID); };
  const box = (id, p, ts = T) => note(id, p.t, p.from, p.cid, { peer: p.peer }, ts);
  const want = { vault: { peer: 'alice', req: 'in' }, shows: true, request: true };
  assert.deepEqual(await bob([box('aaa', n1), box('zzz', n2)]), want, 'the first note has the smaller id');
  assert.deepEqual(await bob([box('zzz', n1), box('aaa', n2)]), want, 'the second note has the smaller id');
  assert.deepEqual(await bob([box('aaa', n1, T - HOUR), box('zzz', n2)]), want, 'the hour turned between the two');
  assert.deepEqual(await bob([box('zzz', n1, T - HOUR), box('aaa', n2)]), want, 'the hour turned, the other id order');
});

test('guard: a first message to a person with the setting off: tagged dm, as before', async () => {
  for (const bobProfile of [{ handle: ME, requests: false }, { handle: ME }]) {
    const a = sender({ bobProfile }); await a.send('hello');
    assert.deepEqual(tags(a.to(ME)), ['dm', 'dm']);
    assert.deepEqual(a.api.dmInfo(a.CID), { peer: ME });
  }
});

test('guard: after Accept, the next fresh note is tagged dm', async () => {
  // the same page, the answer arrived: the vault says ok, and a note asked for again (a lost one) is a plain one
  const a = sender(); await a.send('hello');
  a.api.setDmInfo(a.CID, { req: 'ok' }); a.notes.length = 0;
  await a.api.ensureInbox(a.S.convs[0], null, true);
  assert.deepEqual(tags(a.to(ME)), ['dm']);
  // a page started later (a reload): its first message in the accepted chat sends the fresh notes
  const b = sender({ dms: { [cidOf('alice~bob')]: { peer: ME, req: 'ok' } } });
  b.S.convs = [{ id: b.CID, type: 'dm', members: ['alice', ME], epoch: 0, last: { from: ME, ts: T } }];
  await b.send('and again');
  assert.deepEqual(tags(b.to(ME)), ['dm']);
});

test('guard: my own note for the chat is never tagged request', async () => {
  const a = sender(); await a.send('hello');
  assert.deepEqual(tags(a.to('alice')), ['dm', 'dm']);
  assert.ok(a.to('alice').every((n) => n.own === 1));
});

test('guard: a chat the server already has, which only fell out of my list, is brought back with plain notes even when the other side asks for requests first', async () => {
  // awaitingAccept answers yes for any chat that is not in my list when the person has the setting on; the chat here is an old
  // one (my note was lost), and a note tagged request would file it as a request again on the other side
  const a = sender({ dms: { [cidOf('alice~bob')]: { peer: ME } } });
  a.S.db.preview = async () => ({ exists: true, data: () => ({ type: 'dm', epoch: 1, keys: {} }) });
  await a.send('are you there');
  assert.deepEqual(tags(a.to(ME)), ['dm', 'dm']);
  assert.ok(!a.log.includes('create ' + a.CID), 'and it is not created again');
});

test('the line itself, as written', () => {
  const body = lift('async function sendBody(', '\nasync function sendNowScheduled(');
  assert.match(body, /const dm=typeOf\(c\)==='dm'&&!isSelf\(c\),fresh=dm&&!dmRenoted\.has\(cid\),lc=convById\(cid\);if\(fresh\)dmRenoted\.add\(cid\);\n  ensureInbox\(awaitingAccept\(lc\)&&\(dmInfo\(cid\)\|\|\{\}\)\.req==='out'\?Object\.assign\(\{\},lc,\{_req:true\}\):lc,null,fresh\)\.catch\(\(\)=>\{\}\);if\(dm\)recordBase\(lc\);/);
  assert.equal((UI.match(/_req:true/g) || []).length, 1, 'one place');
});
