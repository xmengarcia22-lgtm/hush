// Release 108 (page): a field `id` inside a chat's record is never believed. Until this release a record that carried a field
// `id` was filed under that address, not the one the page asked for: whoever writes the server's database planted another chat's
// address in a record, and the page read keys and filed its copy under it. Now every record enters the page through one helper
// (chatRec, app/ui.js, right after typeOf), at the seven places a record is read, and the address asked for is laid over the
// record last. Nothing else of a record is judged there: `visibility` is read as the server sent it, as before release 108 (a
// private channel marked public by someone who can write the database is still believed; that fix is planned for a later release).
// This file was first written as public-word.test.js (b8fc142), when the helper also judged the word "public"; that half was taken
// out again by the owner's decision of 2026-11-16, its tests went with it, and the tests of the planted `id` keep the numbers they
// had there (8, 11, 16a to 16f).
// The page's own code runs here against a real server (channel-history-kit.js); "the writer" writes straight into the store, so
// no test leans on a server rule. Harness liberty: the doors a real server cannot reach from here (ensureDmDoc, watchPushCall) run
// as written around stand-ins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { lift, mkBuild, world, makeChannel } from './channel-history-kit.js';
import { sleep } from './helpers.js';
import { parseDocPath } from '../src/paths.js';
import { sender } from './requests-kit.js';

const UI = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const rnd = (n) => { const A = 'abcdefghijklmnopqrstuvwxyz0123456789'; return Array.from(randomBytes(n), (b) => A[b % 36]).join(''); };
async function until(fn, what, ms = 8000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(40); } }

// The page's own code beyond the kit's, reached through spy.fns: three doors as written: capsFor, onChatEvicted, and noteChatDoc,
// which files what the chat watch read under the record's own `id`.
const FNS = `{const ownTried=new Set();
${lift('async function capsFor(', 'function noteChatDoc(')}
${lift('function noteChatDoc(', 'async function onChatEvicted(')}
${lift('async function onChatEvicted(', 'const wrapSynced=')}
spy.fns={capsFor,noteChatDoc,onChatEvicted}}`;
const build = mkBuild(FNS);
// The chat watch (watchInbox, with the note rule), as channel-history-removal.test.js lifts it: the chat list a start shows.
const watchBuild = mkBuild([lift('const isBlocked=', '\n'), lift('async function noteOk(', '/* Blocking'), lift('function notePointer(', '/* ---------- voice calls'),
  'const dmInfo=()=>null,setDmInfo=()=>{},noKeyNotice=()=>{},ownNote=dropPointer;',
  'Object.assign(S,{watchInbox,ownNote:(cid,type)=>ownNote(S.me.handle,{t:\'invite\',cid,from:S.me.handle,type})});'].join('\n'));
// New message (openNewChat, with the public channels it asks the server for), as channel-history-info.test.js lifts it: the rows it draws.
const newChatBuilt = mkBuild([lift('const curConv=', '\n'), lift('const canPost=', '\n'), lift('const isBlocked=', '\n'), lift('const contactFor=', '\n'), lift('const knownHandle=', '\n'),
  lift('const subsText=', '\n').replace('const subsText=', 'const subsTextReal='),
  lift('function emptyPeople(', 'function picker('), lift('function openNewChat(', 'async function openDm('),
  "const html=(t,c,h)=>el(t,c,h),userAvatar=()=>({}),isOnline=()=>false,lastSeen=()=>'',liveSearch=()=>()=>{};",
  'spy.fns={subsText:subsTextReal,openNewChat};'].join('\n'));
const node = (e) => Object.assign(e, { kids: [], append(...k) { this.kids.push(...k); }, replaceChildren(...k) { this.kids = k; }, setAttribute() {}, style: {}, insertAdjacentHTML() {}, classList: { add() {}, remove() {} }, value: '' });
const newChatBuild = (env) => { env.spy.sheets = []; env.spy.opened = [];
  return newChatBuilt({ ...env, I: new Proxy({}, { get: () => '' }), subsText: (...a) => env.spy.fns.subsText(...a), el: (...a) => node(env.el(...a)), openConv: (cid) => env.spy.opened.push(cid),
    sheet: (title) => { const body = node({ tag: 'sheet', cls: 'body', textContent: '' }); env.spy.sheets.push({ title, body }); return { body, sh: node({}), close() {} }; } }); };

// The database writer: straight into the store, no rule asked. `capM`: the member key the server then checks for the chat.
const writer = (w, cid) => { const st = w.T.srv.store, db = st.db;
  return { read: () => JSON.parse(db.prepare('SELECT d FROM docs WHERE path = ?').get('channels/' + cid).d),
    rec: (d, capM) => { st._write(parseDocPath('channels/' + cid), d, Date.now()); st._pub(cid, d.visibility === 'public');   // and the server's list of public channels, as the store keeps it (release 112)
      db.prepare('UPDATE chats SET epoch = ?, type = ? WHERE cid = ?').run(d.epoch || 0, d.type || 'channel', cid);
      if (capM) db.prepare('UPDATE chats SET cap_m = ? WHERE cid = ?').run(createHash('sha256').update(capM).digest('hex'), cid); } }; };
const srvRec = (w, cid) => writer(w, cid).read();

const PEOPLE = ['olga', 'adam', 'bob', 'wendy', 'carol'];
// A private channel at key number 1, chained and signed, opened by its owner (olga), an admin (adam) and a subscriber (bob), each
// holding key numbers 0 and 1 and a roles record. wendy is an account of the writer's own; carol knows the address only.
async function setup(w, o = {}) {
  const O = await w.page('olga', { owner: true, build }), A = await w.page('adam', { build }), B = await w.page('bob', { build: o.bobBuild || build }), W = await w.page('wendy', { build }), C = await w.page('carol', { build: o.carolBuild || build });
  for (const X of [O, A, B, W, C]) await X.loadDir(PEOPLE, true);
  const c = w.cid; await makeChannel(O, c, ['olga', 'adam', 'bob'], ['adam']);
  await O.rotateTo(await O.sync(c), O.metaOf(await O.shown(c)));
  await O.ensureChain(await O.sync(c));
  for (const X of [O, A, B]) { await X.shown(c); assert.ok(await X.holds(c, 1) && await X.holds(c, 0), X.handle + ' holds key numbers 0 and 1'); await X.sealKey(await X.sync(c), 1); assert.ok(X.rolesOf(c) && X.rolesOf(c).o === 'olga', X.handle + ' has a roles record'); }
  return { O, A, B, W, C, c, J: randomBytes(32) };
}
// The writer's record: marked public, every lock removed, a made-up plain name, a plain key of the writer's at the current key number (1).
const bare = (rec) => { const { meta: _m, ometa: _o, ...b } = rec; return b; };
const flipCur = (rec, J, b64) => ({ ...bare(rec), visibility: 'public', keys: { 0: {}, 1: {} }, openKeys: { 1: b64(J) }, name: 'Made up', owner: 'wendy', admins: ['adam'] });

test('8. a record that carries a field `id` is filed under the address asked for: no key from `openKeys`, and the page\'s copy of the chat at the planted address is untouched', async () => {
  await world({}, async (w) => {
    const O = await w.page('olga', { owner: true, build }), B = await w.page('bob', { build }), W = await w.page('wendy', { build });
    for (const X of [O, B, W]) await X.loadDir(PEOPLE, true);
    const g = 'g' + w.cid.slice(1), other = 'c' + rnd(12), J = randomBytes(32);
    await makeChannel(O, g, ['olga', 'bob'], [], 'group'); assert.ok(await B.holds(g, 0));
    await makeChannel(O, other, ['olga', 'bob'], []);   // another chat the two are in: the address the writer plants
    const mine = new Map(); for (const X of [O, B]) mine.set(X, JSON.stringify(await X.sync(other)));
    const rec0 = srvRec(w, g);
    // a group at a g address: the record now says type channel, carries id: "c…" (the other chat) and a plain key at a new key number
    writer(w, g).rec({ ...rec0, type: 'channel', id: other, epoch: 1, keys: { ...rec0.keys, 1: {} }, openKeys: { 1: O.b64(J) } }, await W.memberCapFrom(g, 1, J));
    for (const [who, X] of [['the group\'s owner', O], ['a member', B]]) {
      const r = await X.freshChan(g);
      assert.equal(r.id, g, who + ': the page\'s copy says the address asked for');
      assert.equal(await X.convKey(r, 1), null, who + ': no key from the record at the new key number (a g address reads none)');
      X.spy.fns.noteChatDoc(r);   // as the chat watch files what it read (watchInbox: noteChatDoc)
      assert.equal(X.S.chatDocs.get(g), r, who + ': filed under the address asked for');
      assert.equal(JSON.stringify(X.S.chatDocs.get(other)), mine.get(X), who + ': the page\'s copy of the chat at the planted address is untouched');
    }
    // the same, and marked public
    writer(w, g).rec({ ...bare(rec0), type: 'channel', id: other, visibility: 'public', epoch: 1, keys: { 0: {}, 1: {} }, openKeys: { 1: O.b64(J) }, name: 'Made up', owner: 'olga', admins: [] });
    const r = await O.freshChan(g);
    assert.equal(r.id, g, 'marked public too: the address asked for');
    assert.equal(await O.sealKey(r, 1).catch((e) => e.message), null, 'no key to seal with');
  });
});

test('11. the lines themselves, as written: no record is laid over its address any more, chatRec is called at the seven places, and it puts the address last and judges nothing else', () => {
  assert.deepEqual(UI.match(/Object\.assign\(\{id:[^{}]*\},\s*\w+\.data\(\)\)/g) || [], [], 'no `Object.assign({id:…},x.data())` is left in app/ui.js');
  const at = UI.indexOf('const chatRec='); assert.ok(at > 0, 'app/ui.js has chatRec');
  assert.ok(UI.slice(0, at).endsWith("const typeOf=c=>(c&&c.type)||'channel';\n"), 'right after typeOf');
  const helper = UI.slice(at, UI.indexOf('\nconst dmPeer=', at));
  assert.equal(helper.replace(/ \/\/ .*$/, ''), 'const chatRec=(cid,d)=>Object.assign({},d,{id:cid});', 'the address asked for over whatever the record carries; no other field is read or changed (`visibility` as the server sent it)');
  const rest = UI.slice(0, at) + UI.slice(at + helper.length);
  assert.deepEqual(rest.match(/chatRec\([^()]*\(\)\)/g), ['chatRec(cid,s.data())', 'chatRec(cid,s.data())', 'chatRec(cid,s.data())', 'chatRec(c.id,s.data())', 'chatRec(d.id,d.data())', 'chatRec(cid,d.data())', 'chatRec(cid,s.data())'], 'the seven doors, in the file\'s order: capsFor, onChatEvicted, freshChan, ensureDmDoc, openNewChat, watchInbox, watchPushCall');
  assert.equal(rest.split('chatRec(').length - 1, 7, 'and nowhere else');
  for (const [fn, line] of [['capsFor', 'c=chatRec(cid,s.data());S.chatDocs.set(cid,c)}'], ['onChatEvicted', 'if(s.exists)S.chatDocs.set(cid,chatRec(cid,s.data()));else S.chatDocs.delete(cid)'],
    ['freshChan', "throw new Error('gone');return chatRec(cid,s.data())}"], ['ensureDmDoc', 'if(s.exists){const d=chatRec(c.id,s.data());S.chatDocs.set(c.id,d);'],
    ['openNewChat', 'pubs=s.docs.map(d=>chatRec(d.id,d.data()));draw()'], ['watchInbox', 'const c=d.exists?chatRec(cid,d.data()):null;if(c)noteChatDoc(c);'],
    ['watchPushCall', 'const c=chatRec(cid,s.data());S.chatDocs.set(cid,c);S.previews.set(cid,await showMeta(c))']]) assert.ok(UI.includes(line), fn + ': ' + line);
});

// ---- 16: each door by itself -----------------------------------------------------------------------------------------------
// The record every door is handed: a private channel of the device's own, marked public with a planted key at the current key
// number, a made-up name, and a field `id` naming another address.
const PLANTED = 'c' + 'planted00000';
const marked = (w, c, J, b64) => writer(w, c).rec({ ...flipCur(srvRec(w, c), J, b64), id: PLANTED });

test('16a. capsFor: a record that carries a field `id` comes out at the address asked for', async () => {
  await world({}, async (w) => {
    const { O, B, c, J } = await setup(w);
    marked(w, c, J, O.b64);
    for (const X of [O, B]) { X.S.chatDocs.delete(c); await X.spy.fns.capsFor(c).catch(() => null);
      const kept = X.S.chatDocs.get(c); assert.ok(kept, X.handle + ': capsFor read the record');
      assert.equal(kept.id, c, X.handle); }
  });
});

test('16b. onChatEvicted: a record that carries a field `id` comes out at the address asked for', async () => {
  await world({}, async (w) => {
    const { O, B, c, J } = await setup(w);
    marked(w, c, J, O.b64);
    for (const X of [O, B]) { X.S.chatDocs.delete(c); await X.spy.fns.onChatEvicted(c);
      const kept = X.S.chatDocs.get(c); assert.ok(kept, X.handle + ': onChatEvicted read the record');
      assert.equal(kept.id, c, X.handle); }
  });
});

test('16c. ensureDmDoc: a one-on-one record that carries a field `id` comes out at the address asked for', async () => {
  const s = sender();
  s.S.db.preview = async () => ({ exists: true, data: () => ({ type: 'dm', epoch: 1, keys: { 1: {} }, visibility: 'public', id: 'd' + 'planted'.padEnd(22, '0'), name: 'Made up' }) });
  await s.api.sendBody(s.CID, 'hello').catch(() => null);
  const kept = s.S.chatDocs.get(s.CID); assert.ok(kept, 'ensureDmDoc read the record the server already has');
  assert.equal(kept.id, s.CID);
});

test('16d. watchPushCall: a one-on-one record that carries a field `id` comes out at the address asked for', async () => {
  const cid = 'd' + 'pushcall'.padEnd(22, '0'), watched = [];
  const S = { pushCall: { tag: 'T' }, me: { handle: 'bob', dev: { id: 'dev1' } }, chatDocs: new Map(), previews: new Map(),
    db: { preview: async () => ({ exists: true, data: () => ({ type: 'dm', epoch: 1, keys: { 1: {} }, visibility: 'public', id: 'd' + 'planted'.padEnd(22, '0') }) }) } };
  const at = UI.indexOf('const typeOf='), fn = UI.indexOf('async function watchPushCall(');
  const src = UI.slice(at, UI.indexOf('const dmPeer=', at)) + UI.slice(fn, UI.indexOf('async function onCallRecs(', fn));   // typeOf and chatRec, then the function as written
  const watchPushCall = new Function('S', 'ksMap', 'wakeP', 'tkKey', 'loadDir', 'dmIdFor', 'convById', 'showMeta', 'callSubsFor', 'watchCalls', src + 'return watchPushCall;')(
    S, () => ({}), () => ({ issued: { alice: { dev1: 'ticket' } } }), async () => 'T', async () => {}, async () => cid, () => null, async (c) => c, () => {}, (c) => watched.push(c));
  await watchPushCall();
  assert.deepEqual(watched, [cid], 'the pushed call\'s chat is watched');
  for (const [where, kept] of [['S.chatDocs', S.chatDocs.get(cid)], ['S.previews', S.previews.get(cid)]]) assert.equal(kept.id, cid, where);
});

test('16e. watchInbox (every chat in the list): a channel whose record carries a field `id` shows at the address asked for', async () => {
  await world({}, async (w) => {
    const { O, B, c, J } = await setup(w, { bobBuild: watchBuild });
    marked(w, c, J, O.b64);
    B.S.contactsReady = true; B.S.vaultOk = true; B.S.prefs = B.S.prefs || {};
    await B.S.ownNote(c, 'channel');
    let list = []; const stop = B.S.watchInbox(B.S.me, (l) => { list = l; });
    try {
      const row = await until(() => list.find((x) => x.id === c || x.id === PLANTED), 'the channel in bob\'s chat list');
      assert.equal(row.id, c, 'the chat list\'s copy');
      assert.deepEqual([B.S.chatDocs.get(c).id, B.S.chatDocs.has(PLANTED)], [c, false], 'the record the watch filed');
    } finally { stop(); }
  });
});

test('16f. openNewChat (the public search list): what the server lists is filed under its own address', async () => {
  await world({}, async (w) => {
    const { O, C, c, J } = await setup(w, { carolBuild: newChatBuild });
    const open = 'c' + rnd(12);
    await O.createChatDoc(open, 'channel', 'public', { name: 'Open', desc: '', photo: null, owner: 'olga', admins: [], members: ['olga'], banned: [] });
    writer(w, c).rec({ ...flipCur(srvRec(w, c), J, O.b64), id: open });   // the planted address is the honest public channel's
    const rows = async (X) => { X.spy.sheets.length = 0; X.spy.fns.openNewChat();
      const list = X.spy.sheets.at(-1).body.kids.at(-1), at = () => list.kids.findIndex((k) => k.cls === 'menu-label flush' && k.textContent === 'Public channels');
      await until(() => at() >= 0, 'the public channels on ' + X.handle + '\'s New message');
      return list.kids.slice(at() + 1).filter((k) => k.cls === 'thread').map((r) => { const m = r.kids.find((k) => k && k.cls === 't-main'); return { name: m.kids.find((k) => k.cls === 't-name').kids.at(-1), line: m.kids.find((k) => k.cls === 't-sub').textContent, tap: r.onclick }; }); };
    // carol is shown both; each row opens the address the server listed it under
    const rc = await rows(C);
    assert.deepEqual(rc.map((r) => r.name).sort(), ['Made up', 'Open'], 'the honest public channel is listed, and the marked one');
    rc.find((r) => r.name === 'Made up').tap();
    assert.deepEqual([C.spy.opened, [...C.S.previews.keys()]], [[c], [c]], 'the marked record opens under its own address, not the planted one');
  });
});
