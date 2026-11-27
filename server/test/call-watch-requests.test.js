// Release 111, part D (hardening list item 5): a message request takes none of the 90 call watches.
// syncCallWatch (app/ui.js) keeps a live watch on the call records of the first 90 one-on-one chats of the list, so a call
// rings with that chat closed. Until this release a request that waits for an answer, and one that was deleted, counted among
// the 90: with "Send a request first" on, strangers' requests could take watches from the person's own chats. A call from a
// request is refused anyway (callable), so the watch bought nothing. Now a request is left out before the 90 are cut.
// What this does NOT change (the plan's D3): with the setting off a stranger's chat is an ordinary chat and still takes one.
// The page's own lines are cut out of app/ui.js by how they start and run as written; the connection only remembers what
// was watched and what was ended.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI, lift, build } from './screen-kit.js';

const line = (start) => { const a = UI.indexOf('\n' + start); assert.ok(a > 0, 'app/ui.js holds a line that starts ' + JSON.stringify(start)); return UI.slice(a + 1, UI.indexOf('\n', a + 1)); };
const GUARDS = ['const typeOf=', 'const dmPeer=', 'const isSelf=', 'const P=()=>', 'const clearedAt=', 'const clearedConv=', 'const epochOf=', 'const dmInfo=', 'const reqTo=', 'const isRequest=',
  'const isBlocked=', 'const isChatBlocked=', 'const hiddenConv=', 'const callRecs=new Set()', 'const callSubsFor=', 'const watchCalls='];
const SYNC = () => lift('function syncCallWatch(){', '\nasync function watchPushCall(');
const ANSWER = () => lift('async function answerRequest(c,ok){', '\nfunction requestBar(');

function page() {
  const live = new Set(), log = [];
  const db = { collection: (p) => ({ add: async () => { log.push('post ' + p.split('/')[1]); }, orderBy: () => ({ limit: () => ({ onSnapshot: () => { const cid = p.split('/')[1]; live.add(cid); log.push('+' + cid); return () => { live.delete(cid); log.push('-' + cid); }; } }) }) }) };
  const S = { me: { handle: 'me' }, db, convs: [], dmPeers: {}, prefs: { pinned: [], muted: {}, archived: [], dms: {} }, pushCall: null };
  const stub = () => {};
  const { syncCallWatch, answerRequest } = build([...GUARDS.map(line), line('function setDmInfo('), SYNC(), ANSWER()].join('\n'),
    { S, onCallRecs: stub, sealSvc: async () => ({}), toast: stub, toastErr: (m) => { log.push('error ' + m); }, openConv: stub, closeConv: stub, renderList: stub, updateTitle: stub, displayName: (h) => h, saveContacts: stub }, 'syncCallWatch,answerRequest');
  // a one-on-one chat at key number `epoch`; req: 'in' a request that waits, 'no' a request deleted, 'ok' accepted, 'out' one I sent, none: no request at all
  const dm = (id, req, epoch = 1) => { const c = { id, type: 'dm', members: ['me', 'p' + id], epoch }; S.convs.push(c); if (req) S.prefs.dms[id] = { req }; return c; };
  return { S, live, log, dm, answerRequest, sync: () => { syncCallWatch(); return [...live].sort(); } };
}

test('a request that waits and a request that was deleted get no call watch at key number 1; an accepted chat, one I asked for and a chat with no request do', () => {
  const p = page();
  p.dm('dWAIT', 'in'); p.dm('dGONE', 'no'); p.dm('dOK', 'ok'); p.dm('dOUT', 'out'); p.dm('dPLAIN');
  assert.deepEqual(p.sync(), ['dOK', 'dOUT', 'dPLAIN'], 'the two requests are not watched; the three chats are');
  assert.deepEqual(p.log, ['+dOK', '+dOUT', '+dPLAIN'], 'and no watch was ever sent for a request');
});

test('the 90 are cut after the requests are left out: ten requests on top of the list take no watch from the chats under them', () => {
  const p = page();
  for (let i = 0; i < 10; i++) p.dm('dREQ' + i, i % 2 ? 'in' : 'no');
  const mine = []; for (let i = 0; i < 95; i++) mine.push(p.dm('dMINE' + String(i).padStart(2, '0')).id);
  const got = p.sync();
  assert.equal(got.length, 90, '90 watches, as before');
  assert.deepEqual(got, mine.slice(0, 90).sort(), 'the first 90 chats that are not requests, in the list\'s order');
  assert.equal(got.filter((id) => id.startsWith('dREQ')).length, 0, 'no request among them');
});

test('the chat a pushed call is for keeps its watch whatever it is, as before', () => {
  const p = page();
  p.dm('dWAIT', 'in'); p.dm('dOK', 'ok');
  p.S.pushCall = { cid: 'dWAIT' };
  assert.deepEqual(p.sync(), ['dOK', 'dWAIT'], 'the pushed call\'s chat is added after the cut');
  p.S.pushCall = { cid: 'dNOTLISTED' };
  assert.deepEqual(p.sync(), ['dNOTLISTED', 'dOK'], 'also a chat the list does not hold yet; the request\'s watch is ended');
});

test('a request that is accepted gets its watch at the next pass, and a watched chat that becomes a deleted request loses it', () => {
  const p = page();
  p.dm('dA', 'in'); p.dm('dB', 'ok');
  assert.deepEqual(p.sync(), ['dB']);
  p.S.prefs.dms.dA = { req: 'ok' };
  assert.deepEqual(p.sync(), ['dA', 'dB'], 'accepted: watched');
  p.S.prefs.dms.dB = { req: 'no' };
  assert.deepEqual(p.sync(), ['dA'], 'deleted as a request: its watch is ended');
  assert.deepEqual(p.log, ['+dB', '+dA', '-dB']);
});

test('accepting a request starts its call watch at once: nothing in the chat list changes at an accept, so the next pass would be the one by the clock, up to 15 s later', async () => {
  const p = page();
  const a = p.dm('dA', 'in'), d = p.dm('dD', 'in'); p.dm('dB', 'ok');
  assert.deepEqual(p.sync(), ['dB'], 'two requests wait: neither is watched');
  await p.answerRequest(a, true);
  assert.equal(p.S.prefs.dms.dA.req, 'ok', 'accepted');
  assert.deepEqual([...p.live].sort(), ['dA', 'dB'], 'its call records are watched from the accept on: Accept and then Call hears the answer at once, and a call from that person rings at once, not up to 15 s late');
  await p.answerRequest(d, false);
  assert.equal(p.S.prefs.dms.dD.req, 'no', 'deleted');
  assert.deepEqual([...p.live].sort(), ['dA', 'dB'], 'a deleted request still gets none');
  assert.deepEqual(p.log.filter((l) => /^[+-]/.test(l)), ['+dB', '+dA'], 'one watch started, none ended, none sent twice');
});

test('what was there before stays: no watch at key number 0, for Saved Messages, for a hidden chat or a group', () => {
  const p = page();
  p.dm('dZERO', null, 0); p.dm('dOK');
  p.S.convs.push({ id: 'dSELF', type: 'dm', members: ['me'], epoch: 1 }, { id: 'gGROUP', type: 'group', members: ['me', 'x'], epoch: 1 });
  p.dm('dBLOCKED'); p.S.prefs.blockedChats = ['dBLOCKED'];
  assert.deepEqual(p.sync(), ['dOK']);
});

test('the line as written: one condition more in the filter, before the cut at 90', () => {
  assert.ok(SYNC().includes("const want=new Set(S.convs.filter(c=>typeOf(c)==='dm'&&!isSelf(c)&&epochOf(c)>=1&&!hiddenConv(c)&&!isRequest(c)).slice(0,90).map(c=>c.id));if(S.pushCall&&S.pushCall.cid)want.add(S.pushCall.cid);"));
  assert.equal(line('const isRequest=').split(' //')[0].trim(), 'const isRequest=c=>reqTo(c)===S.me.handle;', 'a request is what the page already calls one: waiting or deleted, not one I sent, not an accepted one');
});
