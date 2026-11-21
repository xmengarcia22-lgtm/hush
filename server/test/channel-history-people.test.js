// Channel member privacy, the people lists (SPEC.md 5.3): in any channel only the owner and the admins may learn who the
// subscribers are. A page takes people from its chats into the profiles it loads (refreshDir, and opening a chat), which the
// search boxes of New message, of the people picker and of the chat list then find by name; into the list New message and the
// picker show with nothing typed (knownHandle); into its key pins, with the security code chip at the top of a chat; into the
// presence it asks for; and into a device removal's record. From a channel this account neither owns nor runs it takes only
// the owner and the admins (knownIn): with today's server, which hands every subscriber the whole list (the kit's oldServer), and
// under the server's rule that hands the list to admins alone (no meta below admin level: channel-members.test.js), where the
// owner's and the admins' keys must still be pinned and checked. The owner's and the admins' pages take every subscriber, as
// before; a group's members and a one-on-one chat's person are taken as before. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { lift, mkBuild, world, makeChannel, oldServer } from './channel-history-kit.js';

// The page's own people pools beyond the kit's, reached through spy.fns: relevantHandles (the profiles refreshDir loads),
// knownHandle, the New message sheet (openNewChat), the people picker of New group, New channel and Add (picker, named
// pickerReal here: the kit stands a stub in for it), the chat list search's People (searchExtras), pinAll with checkKeys,
// refreshPresence, what opening a chat hands loadDir (openLoad: openConv's own expression) and the security code chip at the
// top of a chat (keyChip: renderConv's own line), and app/crypto.js's senderKeys, which loads the profile of whoever signed
// a read mark, reaction or vote the page checks. The server's name search and username lookup (liveSearch) stay out: they
// find only people who opted in, or an exact username, and no chat feeds them.
const built = mkBuild([
  lift('const curConv=', '\n'), lift('const contactFor=', '\n'), lift('const isBlocked=', '\n'),
  lift('function relevantHandles(', 'async function loadDir('), lift('const knownHandle=', '\n'),
  lift('function emptyPeople(', 'function picker('), lift('function picker(', 'function actionRow(').replace('function picker(', 'function pickerReal('),
  lift('function openNewChat(', 'async function openDm('), lift('function searchExtras(', 'function updateStatus('),
  lift('const pinOf=', '\n'), lift('let pinSaveT=null;', 'async function acceptKey('), lift('async function refreshPresence(', '/* ---------- profile search'),
  `const openLoad=c=>(${lift('drawPinBar();loadDir(', ').then(ch=>syncWraps(').slice('drawPinBar();loadDir('.length)});`,
  `const keyChip=(c,t,box)=>{${lift("if(t!=='dm'){const ch=", '\n')}};`,
  "const liveSearch=()=>()=>{},peopleLook=()=>{},isRequest=()=>false,userAvatar=()=>el('span'),html=(t,c)=>el(t,c,''),refreshHeader=()=>{},renderContacts=()=>{},openDevName=async()=>'',deviceName=()=>'Old phone',dmInfo=()=>null,setDmInfo=()=>{},start=()=>{};",
  'spy.fns={relevantHandles,knownHandle,picker:pickerReal,openNewChat,searchExtras,pinAll,refreshPresence,openLoad,keyChip,senderKeys};',
].join('\n'));
const build = (env) => built({ ...env, el: (...a) => Object.assign(env.el(...a), { setAttribute() {}, style: {}, classList: { add() {}, remove() {} }, value: '' }) });

const sorted = (a) => [...a].sort();
// The people a sheet lists, by username: each row's second line is '@' and the username (personRow)
const rows = (X) => sorted(X.spy.els.filter((e) => e.cls === 't-sub' && e.textContent.startsWith('@')).map((e) => e.textContent.slice(1)));
// A sheet as drawn, or, with q, as drawn again once q is typed into its search box
function drawn(X, open, q) {
  X.spy.els.length = 0; open();
  if (q) { const inp = X.spy.els.find((e) => e.tag === 'input'); X.spy.els.length = 0; inp.value = q; inp.oninput(); }
  return rows(X);
}
const newMessage = (X, q) => drawn(X, () => X.spy.fns.openNewChat(), q);
const picked = (X, exclude, q) => drawn(X, () => X.spy.fns.picker({ append() {} }, exclude), q);
const people = (X, q) => { X.S.query = q; X.spy.els.length = 0; X.spy.fns.searchExtras({ append() {} }, []); return rows(X); };   // the chat list search's People
// What a page loads at its start (refreshDir: relevantHandles) and on opening the channel (openConv), as two sorted lists
async function loads(X, c) { const hs = X.spy.fns.relevantHandles(), op = X.spy.fns.openLoad(c); await X.loadDir(hs); await X.loadDir(op); return [sorted(hs), sorted(op)]; }
// Whose presence the page asks for (refreshPresence), its chat open
async function presence(X) {
  const dd = X.S.db.doc, asked = []; X.S.db.doc = (p) => { if (p.startsWith('presence/')) asked.push(p.slice(9)); return dd(p); };
  try { await X.spy.fns.refreshPresence(); } finally { X.S.db.doc = dd; }
  return sorted(asked);
}
// A device removal on X's page from its start (rekeyRun), stopped at the step after its read stage: whom its record names, by chat
async function removalRecord(X) {
  X.S.me.dev = { id: 'dev' + X.handle, nm: '' }; X.S.vaultOk = true;
  const rec = { stage: 'read', devId: 'lost', name: 'Old phone', key: 'KEY', pw: null }, fails = [];
  await X.rekeyRun(rec, { step: (t) => { if (t === 'Checking your account') throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} });
  assert.deepEqual(fails, ['Couldn’t remove the device (stop). Nothing was changed.'], X.handle + '\'s read stage ran to its end, and nothing changed');
  return Object.fromEntries(rec.chats.map((x) => [x.cid, sorted(x.members)]));
}
// X's account gets new keys, published as a device removal's write stage publishes them
async function newKeys(X) { await X.rekeyIdentity(X.S.me); await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() }); }
// refreshDir after that: every profile it loads read again, then pinAll and checkKeys; whose new security code is toasted
async function toasted(X) {
  X.spy.toasts.length = 0; await X.loadDir(X.spy.fns.relevantHandles(), true); X.spy.fns.pinAll();
  return sorted(X.spy.toasts.map((t) => (/^⚠️ (\w+)’s security code changed$/.exec(t[0]) || [])[1]).filter(Boolean));
}
const chip = (X, c) => { X.spy.els.length = 0; X.spy.fns.keyChip(c, c.type, { append() {} }); return X.spy.els.filter((e) => e.tag === 'span').map((e) => e.textContent); };

// Alice owns a private channel where Xena is an admin and Bob and Carol subscribe; Dave is in none of it. Bob also has a group
// with Gina and a one-on-one chat with Dana. Each page holds its chats as its chat list does (the chat watch's copies), the
// channel open; Bob's page also holds the channel's copy a join by link leaves (joinPrivate); no contacts, no pins yet.
// `rule`: the server withholds meta below admin level, as it does; else it is today's server.
async function cast(w, rule) {
  const { cid } = w, gid = 'g' + randomBytes(6).toString('hex'), did = 'd' + randomBytes(16).toString('base64url').slice(0, 22);
  const A = await w.page('alice', { owner: true, build }), X = await w.page('xena', { build }), B = await w.page('bob', { build }), C = await w.page('carol', { build });
  const D = await w.page('dave', { build }), G = await w.page('gina', { build }), N = await w.page('dana', { build });
  await makeChannel(A, cid, ['alice', 'xena', 'bob', 'carol'], ['xena']);
  await makeChannel(B, gid, ['bob', 'gina'], [], 'group');
  if (!rule) oldServer(w.T);
  const view = async (P, id) => ({ ...(await P.shown(id)), id });
  const ch = { alice: await view(A, cid), xena: await view(X, cid), bob: await view(B, cid) }, gr = await view(B, gid);
  for (const P of [A, X, B, C, D, G, N]) Object.assign(P.S, { contacts: [], contactsReady: true, pins: {}, warned: new Set(), presence: {} });
  A.S.convs = [ch.alice]; X.S.convs = [ch.xena]; B.S.convs = [ch.bob, gr, { id: did, type: 'dm', members: ['bob', 'dana'], epoch: 0 }]; B.S.previews.set(cid, ch.bob);
  for (const P of [A, X, B]) P.S.chan = cid;
  assert.deepEqual([A, X, B].map((P) => P.S.db.chatLevel(cid)), ['owner', 'admin', 'member'], 'the levels the pages hold');
  return { A, X, B, C, D, G, N, cid, gid, ch, gr };
}

test('today\'s server, which hands every subscriber the whole list: a subscriber\'s page takes from a channel its owner and admin and no other subscriber: it loads no profile of theirs, at its start or on opening the channel, and New message, the people picker (New group, New channel, Add) and the chat list search list none of them, with nothing typed or with a name; the owner\'s and an admin\'s pages list every subscriber; a group\'s members and a one-on-one chat\'s person are listed as before; a non-member holding the channel\'s preview lists no one', async () => {
  await world({}, async (w) => {
    const { A, X, B, D, cid, ch } = await cast(w, false);
    assert.deepEqual(ch.bob.members, ['alice', 'xena', 'bob', 'carol'], 'Bob\'s copy carries the whole list, as today\'s server hands it');
    assert.deepEqual(await loads(B, ch.bob), [['alice', 'bob', 'dana', 'gina', 'xena'], ['alice', 'xena']], 'Bob\'s page loads from the channel the owner\'s and the admin\'s profiles alone, at its start and on opening it');
    assert.equal(B.S.dir.carol, undefined, 'so it holds no profile of Carol\'s');
    assert.deepEqual(['carol', 'alice', 'xena', 'gina', 'dana'].map((h) => B.spy.fns.knownHandle(h)), [false, true, true, true, true], 'Carol is no one his page knows; the owner, the admin, Gina and Dana are');
    assert.deepEqual(newMessage(B), ['alice', 'dana', 'gina', 'xena'], 'New message, nothing typed: the owner, the admin, his group\'s and his one-on-one chat\'s people');
    assert.deepEqual([newMessage(B, 'car'), newMessage(B, 'xen')], [[], ['xena']], 'New message with "car" typed: nobody; the admin is no secret');
    assert.deepEqual([picked(B, ['bob']), picked(B, ['bob', 'gina']), picked(B, ['bob'], 'car')], [['alice', 'dana', 'gina', 'xena'], ['alice', 'dana', 'xena'], []], 'the picker of New group and New channel, of Add in his group, and with "car" typed');
    assert.deepEqual([people(B, 'car'), people(B, 'gin')], [[], ['gina']], 'the chat list search\'s People: no Carol; Gina as before');
    for (const [P, others] of [[X, ['alice', 'bob', 'carol']], [A, ['bob', 'carol', 'xena']]]) {
      const all = sorted([P.handle, ...others]), who = P === A ? 'the owner\'s' : 'an admin\'s';
      assert.deepEqual(await loads(P, ch[P.handle]), [all, all], who + ' page loads every subscriber\'s profile');
      assert.equal(P.spy.fns.knownHandle('carol'), true, who + ' page knows Carol');
      assert.deepEqual([newMessage(P), newMessage(P, 'car'), picked(P, [P.handle]), people(P, 'car')], [others, ['carol'], others, ['carol']], who + ' New message, picker and search list every subscriber');
    }
    D.S.previews.set(cid, { id: cid, ...(await D.S.db.preview(cid)).data() });
    assert.deepEqual([D.spy.fns.relevantHandles(), newMessage(D), people(D, 'car')], [['dave'], [], []], 'Dave, never in the channel, holds its preview and lists no one');
  });
});

test('today\'s server: a subscriber\'s page pins no other subscriber\'s key, not even with their profile loaded to check a signature of theirs, so no change of their security code is toasted or named in the channel\'s chip, nor for a pin a vault kept from before; it pins and checks the owner\'s, the admin\'s, a group\'s members\' and a one-on-one chat\'s person\'s keys as before; an admin\'s page pins and checks every subscriber\'s', async () => {
  await world({}, async (w) => {
    const { X, B, C, G, N, ch, gr } = await cast(w, false);
    for (const P of [B, X]) await loads(P, ch[P.handle]);
    await B.spy.fns.senderKeys('carol');   // her profile loaded, as checking a signature of hers does (tagPeople no longer has his page check her read marks, reactions or votes)
    assert.ok(B.S.dir.carol, 'Carol\'s profile is on Bob\'s page, loaded to check her signature');
    for (const P of [B, X]) P.spy.fns.pinAll();
    assert.deepEqual([sorted(Object.keys(B.S.pins)), sorted(Object.keys(X.S.pins))], [['alice', 'dana', 'gina', 'xena'], ['alice', 'bob', 'carol']], 'the keys pinned: on Bob\'s page not Carol\'s; on the admin\'s every subscriber\'s');
    const old = { ecdh: C.id.ecdh, sig: C.id.sig };
    for (const P of [C, X, G, N]) await newKeys(P);
    assert.deepEqual(await toasted(B), ['dana', 'gina', 'xena'], 'Carol, the admin, Gina and Dana get new keys: Bob\'s page toasts the admin\'s, Gina\'s and Dana\'s new security codes, not Carol\'s');
    assert.deepEqual([chip(B, ch.bob), chip(B, gr)], [['Security code changed for xena. Tap to review.'], ['Security code changed for gina. Tap to review.']], 'its chips name the admin in the channel and Gina in the group');
    assert.deepEqual([await toasted(X), chip(X, ch.xena)], [['carol'], ['Security code changed for carol. Tap to review.']], 'the admin\'s page toasts Carol\'s, and its chip names her');
    // a pin of Carol's that Bob's vault kept from before this release, and her new profile on his page (he looked her up)
    B.S.pins.carol = old; await B.loadDir(['carol'], true);
    assert.deepEqual(chip(B, ch.bob), ['Security code changed for xena. Tap to review.'], 'the channel\'s chip on Bob\'s page still names the admin alone');
  });
});

test('today\'s server: with the channel open, a subscriber\'s page asks the presence of its owner and admin, and of no other subscriber; an admin\'s page asks every subscriber\'s; a group\'s and a one-on-one chat\'s people are asked as before', async () => {
  await world({}, async (w) => {
    const { X, B } = await cast(w, false);
    assert.deepEqual([await presence(B), await presence(X)], [['alice', 'dana', 'gina', 'xena'], ['alice', 'bob', 'carol']], 'on Bob\'s page the owner\'s, the admin\'s, Gina\'s and Dana\'s; on the admin\'s every subscriber\'s');
  });
});

test('today\'s server: a device removal\'s record on a subscriber\'s page names the channel\'s owner and admin and no other subscriber, so its rotate stage loads no profile of theirs; a group\'s members as before; on an admin\'s page every subscriber', async () => {
  await world({}, async (w) => {
    const { X, B, cid, gid } = await cast(w, false);
    const rb = await removalRecord(B), rx = await removalRecord(X);
    assert.deepEqual([rb[cid], rb[gid], rx[cid]], [['alice', 'xena'], ['bob', 'gina'], ['alice', 'bob', 'carol', 'xena']], 'Bob\'s record: the channel\'s owner and admin, his group\'s members; the admin\'s: every subscriber');
  });
});

test('the rule (no meta below admin level): a subscriber\'s page still takes the channel\'s owner and admin: it loads their profiles, lists them in New message, asks their presence, names them in a device removal\'s record and pins their keys, so the admin\'s new security code is toasted and named in the channel\'s chip; an admin\'s page, which still gets the list, takes every subscriber', async () => {
  await world({}, async (w) => {
    const { X, B, cid, ch } = await cast(w, true);
    assert.deepEqual([ch.bob.members, ch.bob.owner, ch.bob.admins], [[], 'alice', ['xena']], 'Bob\'s copy: no list; the owner and the admin from the owner\'s part');
    assert.deepEqual(await loads(B, ch.bob), [['alice', 'bob', 'dana', 'gina', 'xena'], ['alice', 'xena']], 'Bob\'s page loads the owner\'s and the admin\'s profiles, at its start and on opening the channel');
    assert.deepEqual(newMessage(B), ['alice', 'dana', 'gina', 'xena'], 'and lists them in New message');
    assert.deepEqual(await presence(B), ['alice', 'dana', 'gina', 'xena'], 'and asks their presence, the channel open');
    assert.deepEqual((await removalRecord(B))[cid], ['alice', 'xena'], 'and names them in a device removal\'s record');
    B.spy.fns.pinAll();
    assert.deepEqual(sorted(Object.keys(B.S.pins)), ['alice', 'dana', 'gina', 'xena'], 'and pins their keys');
    const all = ['alice', 'bob', 'carol', 'xena'];
    assert.deepEqual([await loads(X, ch.xena), newMessage(X)], [[all, all], ['alice', 'bob', 'carol']], 'the admin\'s page gets the list and takes every subscriber');
    await newKeys(X);
    assert.deepEqual([await toasted(B), chip(B, ch.bob)], [['xena'], ['Security code changed for xena. Tap to review.']], 'the admin gets new keys: Bob\'s page toasts her new security code and its chip names her');
  });
});
