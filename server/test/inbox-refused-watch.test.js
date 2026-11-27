// Release 111 (page, review of the review fixes: security N1, code finding 1, and the proof's eviction run with the
// connection cut): a chat watch that ends refused (`denied`) never deletes a mailbox note by itself. The server says
// `denied` to a `chat.open` for every key that is not the chat's current one, and the page's key is only as new as the
// chat record it has kept: after a key change whose new record did not reach the page (its record watch still waited
// in the queue, the read at the eviction was refused or lost with the connection, or the key changed twice) the open
// goes with an old key, the adapter ends the chat's watches `denied` "You are no longer in this chat", and the chat
// watch took that for removal: it deleted the chat's mailbox note on the server, and the group or channel left the
// chat list on every device, though the person was still a member. Now the chat waits, out of the list, and is looked
// at again with a fresh copy of the record (the 15-second look-again drops the kept record and starts a new watch);
// only that copy's verdict forgets: this device held a key for the chat and cannot open the current one.
//
// The second part (found by the narrow check of that fix, on the real server code): a refusal that IS a removal must
// still forget at once, as the live page does. A member who is blocked while the chat's key stays as it is (a group that
// has used its key numbers, a key change that failed after the block) still holds the current key, so "this device can
// work out the current key" says nothing: the first form of the fix listed such a chat again as an empty row, and a
// page closed before its look-again kept the note for good. The server itself says which refusal it is: the RIGHT key
// of a removed account is answered `denied` "you were removed from this chat", any other key "that key does not open
// this chat". The adapter keeps that (S.db.chatOut, app/adapter.js), and the page asks it: at the refusal (told so:
// forgotten at once; not told so: the chat waits for the look-again, as above) and when a copy comes (told so: not
// mine, though this device holds its key: forgotten, also at a start). And a chat whose record is gone after a refusal
// is forgotten then, not kept for the two minutes a note for a record its sender is still writing waits.
//
// watchInbox, noteOk, notePointer, pointerVerdict and the helpers run as written in app/ui.js (as in
// inbox-readfail-page.test.js). Around them: a note is a made-up plaintext handed over as if openPointer had opened
// it; a chat's record watch is a stand-in the test drives (a record handed over, or the watch ended with a code, as
// the adapter ends it); "this device can open the record" is a set the test keeps (convKey), and so is "the server
// answered this account's right key for the chat with its removal sentence" (`out`: what S.db.chatOut says, as the adapter
// keeps it); the 15-second look-again is called by hand (S.recheckChats, the same function the timer calls).
//
// WHAT IT DOES NOT SEE: the adapter, the socket, the server, the real keys; why a watch ended `denied` (the adapter's
// tests and the proof's eviction runs on the real server see that).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lift, ME, T, cidOf, tick, dmRec } from './requests-kit.js';

const CRYPTO = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
const clift = (from, to) => { const a = CRYPTO.indexOf(from); assert.ok(a >= 0, 'app/crypto.js holds ' + from); return CRYPTO.slice(a, CRYPTO.indexOf(to, a)); };
const CODE = [
  lift('const typeOf=', '\n'), lift('const chatRec=', '\nconst dmPeer='), lift('const dmPeer=', '\n'), lift('const isSelf=', '\n'), lift('const epochOf=', '\n'),
  lift('const dmInfo=', 'async function answerRequest('),
  lift('async function noteOk(', '/* Blocking, kept in the encrypted vault'),
  lift('const isBlocked=', '\n'), lift('const joinedPublic=', '\n'),
  lift('function notePointer(', '/* ===== HUSH INBOX RULE BEGIN ===== */'),
  lift('function pointerVerdict(', '\n'),
  lift('function watchInbox(', '/* ---------- voice calls (SPEC.md 16.2)'),
  lift('const validHandle=', '\nfunction relevantHandles('), lift('async function loadDir(', '\nlet dirBusy='),
  clift('const dirMiss=', 'async function sideOk('), clift('function peerKeys(', '\n'),
  'const sideOk=async(h,sg)=>!!(await senderKeys(h))&&sg===\'signed by \'+h;',
].join('\n');
const STUBS = ['S', 'ls', 'P', 'saveContacts', 'hiddenConv', 'openPointer', 'dmIdFor', 'dmIds', 'ksMap', 'showMeta', 'adoptOMeta', 'adminGone', 'noteChatDoc', 'convKey', 'healCard',
  'unsealPost', 'recordBase', 'dropPointer', 'noKeyNotice', 'toastErr', 'heldKey', 'codeWait', 'codeWaitEnd', 'setInterval', 'clearInterval', 'Date'];
const mk = new Function('env', `const {${STUBS.join(',')}}=env;\n${CODE}\nreturn {watchInbox};`);

const DAY = 864e5, OLD = T - 8 * DAY, GROUP = 'g' + 'A'.repeat(21), CHANNEL = 'c' + 'B'.repeat(21), PEER = 'peer0', DM = cidOf(PEER);
const keysOf = (h) => ({ handle: h, name: h, ecdh: { x: 'e' + h, y: 'e' }, sig: { x: 's' + h, y: 's' }, kv: 1 });
const refused = (code) => Object.assign(new Error(code === 'denied' ? 'You are no longer in this chat' : 'slow down'), { code });
// my own notes: for a group or channel (as the chat watch writes one once the chat shows), and for a one-on-one chat
const mine = (id, cid) => ({ id, ts: OLD, own: 1, p: { t: 'invite', cid, from: ME, to: ME, ts: OLD, type: cid[0] === 'c' ? 'channel' : 'group' } });
const mineDm = (id, peer) => ({ id, ts: OLD, own: 1, p: { t: 'dm', cid: cidOf(peer), from: ME, to: ME, ts: OLD, type: 'dm', peer } });
const PUBLIC = 'c' + 'P'.repeat(21);
const rec = (cid, epoch = 1) => (cid[0] === 'd' ? dmRec() : { type: cid[0] === 'c' ? 'channel' : 'group', visibility: cid === PUBLIC ? 'public' : 'private', epoch, ts: T });

// bob's page. `held`: chats this device held a key for at some earlier time (heldKey). `opens`: chats whose CURRENT
// record this device can open (convKey); the test changes it as the story goes.
function page({ held = [], opens = [] } = {}) {
  const log = { deleted: [], starts: {}, refreshed: [] }, watches = new Map(), can = new Set(opens), has = new Set(held), out = new Set(), flip = new Set();   // out: chats for which the server answered this account's right key "you were removed" (S.db.chatOut); flip: chats for which that stops being so while a copy is being looked at
  const S = { me: { handle: ME, kv: 1, ecdh: { x: 'eb' }, sig: { x: 'sb' } }, prefs: { blocked: [], dms: {} }, pins: { [PEER]: keysOf(PEER) }, dmPeers: {},
    dir: { [ME]: { handle: ME, requests: false, kv: 1 } }, contactsReady: true, vaultOk: true, rekeying: false, convs: [], invites: [], chatDocs: new Map(), db: null };
  let inboxCb = null;
  S.db = {
    collection: () => ({ limit: () => ({ onSnapshot: (cb) => { inboxCb = cb; return () => {}; } }) }),
    doc: (path) => { const [root, a, , pid] = path.split('/');
      if (root === 'inbox') return { delete: async () => { log.deleted.push(pid); } };
      if (root === 'directory') return { get: async () => ({ exists: false, data: () => null }) };
      return { onSnapshot: (cb, err) => { const w = { cb, err, dead: false }; watches.set(a, w); log.starts[a] = (log.starts[a] || 0) + 1; return () => { w.dead = true; }; } }; },   // a chat's record watch: the test drives it
    chatLevel: () => null, chatOut: (cid) => out.has(cid), refreshChat: async (cid) => { log.refreshed.push(cid); }, online: true,
  };
  const env = { S, ls: { get: (_k, d) => d, set: () => {} }, P: () => S.prefs, saveContacts: () => {}, hiddenConv: () => false,
    openPointer: async (d) => { if (!d._p) throw new Error('unreadable'); return d._p; }, dmIdFor: async (peer) => cidOf(peer), dmIds: new Map(), ksMap: () => ({}),
    showMeta: async (c) => { if (flip.has(c.id)) out.delete(c.id); return c.type === 'dm' ? { ...c, members: [ME, S.dmPeers[c.id]].filter(Boolean) } : c; }, adoptOMeta: () => {}, adminGone: () => {}, noteChatDoc: () => {},
    convKey: async (c) => (can.has(c.id) ? 'a key' : null), healCard: () => {}, unsealPost: async (_c, l) => l, recordBase: () => {}, dropPointer: async () => {}, noKeyNotice: () => {}, toastErr: () => {},
    heldKey: (cid) => has.has(cid), codeWait: () => false, codeWaitEnd: () => {}, setInterval: () => 0, clearInterval: () => {}, Date: { now: () => Date.now() } };
  let list = [];
  mk(env).watchInbox({ handle: ME }, (l) => { list = l; });
  const snap = async (notes) => { await inboxCb({ docs: notes.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map((n) => ({ id: n.id, data: () => ({ ts: n.ts, own: n.own, _p: n.p }) })) }); await tick(); };
  const live = (cid) => { const w = watches.get(cid); assert.ok(w && !w.dead, 'a record watch of ' + cid.slice(0, 2) + ' is live'); return w; };
  return { S, log, can, out, flip, snap, list: () => list.map((c) => c.id).sort(),
    gone: async (cid) => { await live(cid).cb({ exists: false, data: () => null }); await tick(); },   // no such record (the chat was deleted)
    record: async (cid, epoch) => { await live(cid).cb({ exists: true, data: () => rec(cid, epoch) }); await tick(); },   // the server hands the record over (whole, or the trimmed copy: the stand-in's convKey decides what this device can do with it)
    end: async (cid, code) => { live(cid).err(refused(code)); await tick(); },   // the adapter ends the watch
    again: async () => { S.recheckChats(); await tick(); } };   // the 15-second look-again
}

for (const [what, cid] of [['a group', GROUP], ['a private channel', CHANNEL]]) {
  test(`${what} this device holds a key for, its watch ended \`denied\` though I am still a member (the key the page offered was an old one): no mailbox note is deleted; the chat waits out of the list, and the look-again starts a new watch on a fresh copy of the record and lists it again`, async () => {
    const W = page({ held: [cid], opens: [cid] });
    await W.snap([mine('n1', cid)]);
    await W.record(cid, 1);
    assert.deepEqual([W.list(), W.log.deleted, W.log.starts[cid]], [[cid], [], 1], 'listed, one watch');
    W.S.chatDocs.set(cid, { id: cid, epoch: 1 });   // the record the page has kept (the old key number)
    await W.end(cid, 'denied');
    assert.deepEqual(W.log.deleted, [], 'the refusal by itself deletes no note: `denied` is also what an old key gets');
    assert.deepEqual([W.list(), W.log.starts[cid]], [[], 1], 'it waits out of the list (as a chat whose key this device does not hold yet), not started again before the look-again');
    await W.again();
    assert.deepEqual([W.S.chatDocs.has(cid), W.log.starts[cid], W.log.refreshed], [false, 2, []], 'the look-again drops the kept record (the keys are worked out from a fresh one) and starts a new watch');
    await W.record(cid, 2);
    assert.deepEqual([W.list(), W.log.deleted], [[cid], []], 'the fresh record opens: listed again, the note untouched');
    await W.again();
    assert.equal(W.log.starts[cid], 2, 'and it no longer waits: a later look-again does not start it again');
  });

  test(`${what} I was removed from: the watch ended \`denied\` deletes nothing yet; the look-again's fresh record, which this device cannot open, is what forgets the chat and deletes its note`, async () => {
    const W = page({ held: [cid], opens: [cid] });
    await W.snap([mine('n1', cid)]);
    await W.record(cid, 1);
    W.can.delete(cid);   // the key changed and no key for the new one was wrapped for me
    await W.end(cid, 'denied');
    assert.deepEqual([W.list(), W.log.deleted], [[], []], 'out of the list at once; the note not yet deleted');
    await W.again();
    assert.equal(W.log.starts[cid], 2, 'looked at again');
    await W.record(cid, 2);   // the trimmed copy anyone signed in may read
    assert.deepEqual([W.list(), W.log.deleted], [[], ['n1']], 'held a key once, cannot open the current one: removed. The note goes now');
    await W.again();
    assert.equal(W.log.starts[cid], 2, 'and it is not looked at again');
  });
}

test('unchanged: a one-on-one chat whose watch ends `denied` waits out of the list with its note kept and comes back at the look-again; a watch ended for a reason that says nothing about the chat (`ratelimit`) keeps its row and is looked at again', async () => {
  const W = page({ held: [DM, GROUP], opens: [GROUP] });
  await W.snap([mineDm('n1', PEER), mine('n2', GROUP)]);
  await W.record(DM); await W.record(GROUP, 1);
  assert.deepEqual(W.list(), [DM, GROUP].sort(), 'both listed');
  await W.end(DM, 'denied');
  assert.deepEqual([W.list(), W.log.deleted], [[GROUP], []], 'the one-on-one chat waits out of the list, nothing deleted');
  await W.end(GROUP, 'ratelimit');
  assert.deepEqual([W.list(), W.log.deleted], [[GROUP], []], 'the group keeps its row: too busy says nothing about the chat');
  await W.again();
  assert.deepEqual([W.log.starts[DM], W.log.starts[GROUP]], [2, 2], 'both started again');
  await W.record(DM); await W.record(GROUP, 1);
  assert.deepEqual([W.list(), W.log.deleted], [[DM, GROUP].sort(), []], 'both listed, nothing deleted');
});

test('unchanged: the record itself still forgets at once. A pushed record this device cannot open, for a chat it held a key for (a removal the watch heard of), deletes the note without any look-again; one for a chat it never held a key for waits', async () => {
  const W = page({ held: [GROUP], opens: [GROUP, CHANNEL] });
  await W.snap([mine('n1', GROUP), mine('n2', CHANNEL)]);
  await W.record(GROUP, 1); await W.record(CHANNEL, 1);
  W.can.delete(GROUP); W.can.delete(CHANNEL);
  await W.record(GROUP, 2);
  assert.deepEqual([W.list(), W.log.deleted], [[CHANNEL], ['n1']], 'the held group: forgotten by the record that came');
  await W.record(CHANNEL, 2);
  assert.deepEqual([W.list(), W.log.deleted], [[], ['n1']], 'the channel never held: waits, its note kept');
});

// ----- the second part: the server's own answer tells a removal from an old key -----
for (const [what, cid] of [['a group', GROUP], ['a private channel', CHANNEL]]) {
  test(`${what} I am blocked from with no key change (the server refuses the right key and says so): the watch ended \`denied\` forgets the chat at once, as the live page does; its note goes without any look-again`, async () => {
    const W = page({ held: [cid], opens: [cid] });
    await W.snap([mine('n1', cid)]);
    await W.record(cid, 1);
    W.out.add(cid);                                   // the re-open's answer: "you were removed from this chat"
    await W.end(cid, 'denied');
    assert.deepEqual([W.list(), W.log.deleted], [[], ['n1']], 'out of the list and the note deleted, at the refusal');
    await W.again();
    assert.equal(W.log.starts[cid], 1, 'and it is not looked at again');
  });

  test(`${what} I am blocked from, and the refusal that ended the watch was for an old key (not told as a removal): it waits; at the look-again the server refuses the right key and says so, and the copy that follows, whose key this device holds, is not listed as an empty row: forgotten`, async () => {
    const W = page({ held: [cid], opens: [cid] });
    await W.snap([mine('n1', cid)]);
    await W.record(cid, 1);
    await W.end(cid, 'denied');
    assert.deepEqual([W.list(), W.log.deleted], [[], []], 'waits out of the list, nothing deleted');
    await W.again();
    W.out.add(cid);                                   // the look-again's open: the right key, "you were removed"
    await W.record(cid, 1);                           // the trimmed copy the adapter hands over all the same
    assert.deepEqual([W.list(), W.log.deleted], [[], ['n1']], 'not listed; the note goes');
  });

  test(`${what} I was blocked from while no page was open: at the next start the server refuses the right key and says so, and the first copy does not list the chat as an empty row (the live page did, and kept the note): forgotten`, async () => {
    const W = page({ held: [cid], opens: [cid] });
    await W.snap([mine('n1', cid)]);
    W.out.add(cid);
    await W.record(cid, 1);
    assert.deepEqual([W.list(), W.log.deleted], [[], ['n1']], 'not listed; the note goes');
  });
}

test('what the server said is asked when the copy comes, not after the page has worked on it: a copy handed over for a removal is not listed as an empty row because another open of the chat ended otherwise meanwhile', async () => {
  const W = page({ held: [GROUP], opens: [GROUP] });
  await W.snap([mine('n1', GROUP)]);
  W.out.add(GROUP); W.flip.add(GROUP);                // told as a removal when the copy comes; no longer so while it is looked at
  await W.record(GROUP, 1);
  assert.deepEqual([W.list(), W.log.deleted], [[], ['n1']], 'judged by what was so when the copy came');
});

test('unchanged where the server did not say so: a start on a device that holds the current key, the chat not opened and nothing told (the server too busy, an error): listed from the copy it gets, nothing deleted', async () => {
  const W = page({ held: [GROUP, CHANNEL], opens: [GROUP, CHANNEL] });
  await W.snap([mine('n1', GROUP), mine('n2', CHANNEL)]);
  await W.record(GROUP, 1); await W.record(CHANNEL, 1);
  assert.deepEqual([W.list(), W.log.deleted], [[CHANNEL, GROUP].sort(), []], 'both listed, nothing deleted');
});

test('left out, as before: a one-on-one chat is never forgotten for a refusal, whatever was told; a public channel I joined is listed from its copy, and at a refusal it waits with its note kept (this device holds no key for it)', async () => {
  const W = page({ held: [DM], opens: [] });
  await W.snap([mineDm('n1', PEER), mine('n2', PUBLIC)]);
  await W.record(DM); await W.record(PUBLIC, 1);
  assert.deepEqual(W.list(), [DM, PUBLIC].sort(), 'both listed');
  W.out.add(DM); W.out.add(PUBLIC);
  await W.end(DM, 'denied'); await W.end(PUBLIC, 'denied');
  assert.deepEqual([W.list(), W.log.deleted], [[], []], 'both wait out of the list, nothing deleted');
  await W.again();
  await W.record(DM); await W.record(PUBLIC, 1);
  assert.deepEqual([W.list(), W.log.deleted], [[DM, PUBLIC].sort(), []], 'both listed again from their copies, nothing deleted');
});

test('a chat that was deleted: its watch ended `denied` and the look-again finds no record. The note goes then, also inside the two minutes in which a note for a chat with no record waits (that wait is for a record its sender is still writing; this chat was open here)', async () => {
  const W = page({ held: [GROUP], opens: [GROUP] });
  await W.snap([mine('n1', GROUP)]);
  await W.record(GROUP, 1);
  await W.end(GROUP, 'denied');
  await W.again();
  await W.gone(GROUP);
  assert.deepEqual([W.list(), W.log.deleted], [[], ['n1']], 'forgotten, the note deleted');
});

test('the refusal is used up by the first copy after it: a chat that waited and came back does not lose its note when its record is missing once later (a note for a record that is not there waits its two minutes, as before)', async () => {
  const W = page({ held: [GROUP], opens: [GROUP] });
  await W.snap([mine('n1', GROUP)]);
  await W.record(GROUP, 1);
  await W.end(GROUP, 'denied');
  await W.again();
  await W.record(GROUP, 2);
  assert.deepEqual(W.list(), [GROUP], 'back in the list');
  await W.gone(GROUP);
  assert.deepEqual(W.log.deleted, [], 'no record once, inside the two minutes: the note waits');
});
