// Release 111, part G (the owner's decision D8): New message lists no public channels; the chat list's search finds them.
// Until this release the New message screen (openNewChat, app/ui.js) asked the server for its listing of public channels
// every time it opened and showed every one of them under "Public channels", with nothing typed. The search over the chat
// list (searchExtras) found chats, messages and people, and no public channel. Now the screen lists people only and asks
// for no listing, and the search shows, from two characters, the listed channels that are not among my chats and whose
// name or description holds the text, drawn and opened as the screen drew and opened them.
// The listing is asked for once when a search begins and kept for a minute for this account: never once a key, never once a
// drawing of the list (renderList draws on every arriving message). Known and accepted: a listing request that fails is
// not asked again inside that minute. NOT a privacy fix: the server still hands the listing to every signed-in account,
// and past 100 public channels it hands a random 100, so a search can miss a channel that exists (hardening list item 57).
// The page's own code is cut out of app/ui.js and run as written on elements that only remember what was done to them; the
// connection counts every request and answers it when the test says.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI, lift, build, node, texts, all, tick } from './screen-kit.js';

const line = (start) => { const a = UI.indexOf('\n' + start); assert.ok(a > 0, 'app/ui.js holds a line that starts ' + JSON.stringify(start)); return UI.slice(a + 1, UI.indexOf('\n', a + 1)); };
const SCREEN = () => lift('function emptyPeople(q){', '\nfunction peopleIn(') + '\n' + lift('function openNewChat(){', '\nasync function openDm(');
const SEARCH = () => lift('function searchExtras(box,items){', '\nfunction updateStatus(');
const el = (tag, cls, text) => Object.assign(node(tag, cls, text), { querySelector(q) { return all(this, (e) => (' ' + e.className + ' ').includes(' ' + q.slice(1) + ' '))[0] || null; }, dataset: {} });
const channel = (id, name, desc = '', more = {}) => ({ id, d: { type: 'channel', visibility: 'public', name, desc, owner: 'olga', admins: [], ...more } });
const LISTING = [channel('cZEBRA0000001', 'Zebra Gazette', 'Stripes daily'), channel('cOTTER0000001', 'Otter Weekly', 'Rivers and zebra crossings'), channel('cMINE00000001', 'My Zebra Club'), channel('cQUIET0000001', 'Quiet Corner')];

// A page: one account, its chats, the people it knows, and a connection that keeps every listing request until the test answers it
function page(o = {}) {
  const asked = [], waiting = [], drawn = { n: 0 }, opened = [], sheets = [];
  const db = { collection: (p) => ({ where: (f, op, v) => ({ limit: (l) => ({ get: () => { asked.push({ p, w: [f, op, v], l }); return new Promise((res, rej) => waiting.push({ res, rej })); } }) }) }) };
  const answer = (rows = LISTING) => { const w = waiting.shift(); assert.ok(w, 'a listing request is waiting for its answer'); w.res({ docs: rows.map((r) => ({ id: r.id, data: () => r.d })) }); return tick(); };
  const refuse = () => { const w = waiting.shift(); assert.ok(w, 'a listing request is waiting for its answer'); w.rej(Object.assign(new Error('slow down'), { code: 'ratelimit' })); return tick(); };
  const S = { me: { handle: o.me || 'me' }, db, tab: 'chats', query: '', convs: o.convs || [{ id: 'cMINE00000001', type: 'channel', visibility: 'public', name: 'My Zebra Club' }], previews: new Map(), msgIdx: new Map(),
    dir: { priya: { handle: 'priya', name: 'Priya Zebra' }, sam: { handle: 'sam', name: 'Sam' } } };
  const person = (d) => { const b = el('button', 'thread'); b.append(el('div', 't-name', d.name), el('div', 't-sub', '@' + d.handle)); return b; };
  const env = { S, el, I: new Proxy({}, { get: (_, k) => '<svg ' + String(k) + '/>' }), renderList: () => { drawn.n++; },
    typeOf: (c) => (c && c.type) || 'channel', isSelf: () => false, isRequest: () => false, isBlocked: () => false, dmPeer: (c) => c.peer, convById: (id) => S.convs.find((c) => c.id === id) || S.previews.get(id),
    isMember: (c) => (c.members || []).includes(S.me.handle), subsText: (c) => 'Public channel', convAvatar: (c) => el('div', 'avatar', 'picture ' + c.id), displayName: (h) => (S.dir[h] && S.dir[h].name) || h,
    peopleIn: (q, ex) => Object.values(S.dir).filter((d) => !ex.includes(d.handle) && (!q || (d.handle + ' ' + d.name).toLowerCase().includes(q))), knownHandle: () => true, personRow: person,
    peopleLook: () => {}, liveSearch: () => () => {}, openDm: (h) => opened.push('dm ' + h), openConv: (id) => opened.push('chat ' + id), openAtMsg: () => {}, titleNode: (t, c) => el(t, c), fmtListTime: () => '', snipAt: (t) => t,
    openSaved() {}, openCreateGroup() {}, openCreateChannel() {}, openInviteFriends() {}, openJoinLink() {},
    actionRow: (_i, title) => el('button', 'thread new-ch', title), searchBox: (ph) => { const inp = Object.assign(el('input'), { placeholder: ph, value: '' }), s = el('label', 'search'); s.append(inp); return { s, inp }; },
    sheet: (title) => { const body = el('div', 'sheet-body'); sheets.push({ title, body }); return { body, sh: el('div'), close() {} }; } };
  const fn = build([line('const chatRec='), SCREEN(), SEARCH()].join('\n'), env, 'openNewChat,searchExtras');
  // the chat list's search as renderList runs it: the box under the chats, with `items` the chats the text matched
  const search = (q, items = []) => { S.query = q; const box = el('div'); fn.searchExtras(box, items); return box; };
  // New message as drawn, or drawn again with q typed in its own search box
  const screen = (q) => { sheets.length = 0; fn.openNewChat(); const { body } = sheets.at(-1); if (q != null) { const inp = all(body, (e) => e.tag === 'input')[0]; inp.value = q; inp.oninput(); } return body; };
  return { S, asked, waiting, drawn, opened, answer, refuse, search, screen };
}
const labels = (box) => all(box, (e) => /(^| )menu-label( |$)/.test(e.className)).map((e) => e.textContent);
// the rows under "Public channels": name and second line
const channels = (box) => { const k = box.kids.findIndex((e) => e.className === 'menu-label' && e.textContent === 'Public channels'); if (k < 0) return null;
  const rows = []; for (const r of box.kids.slice(k + 1)) { if (r.className !== 'thread') break; const m = r.kids.find((x) => x.className === 't-main'); rows.push({ name: texts(m.kids[0]).join(''), line: m.kids[1].textContent, row: r }); } return rows; };

// ---- New message ---------------------------------------------------------------------------------------------------------
test('New message lists no public channel and asks the server for no listing: with its box empty, with a channel\'s name typed in it, and after waiting', async () => {
  const p = page();
  let body = p.screen();
  await tick();
  assert.equal(p.asked.length, 0, 'opening the screen sends no request for the public listing');
  assert.ok(!labels(body).includes('Public channels'), 'no "Public channels" heading');
  assert.deepEqual(labels(body), ['People'], 'the people, as before');
  body = p.screen('zebra');
  assert.equal(p.asked.length, 0, 'nor does typing in its search box');
  assert.deepEqual([labels(body), texts(body).filter((t) => /Zebra Gazette|Otter|Quiet/.test(t))], [['People'], []], 'a channel\'s name typed there finds people only');
  assert.ok(texts(body).includes('Priya Zebra'), 'the person whose name holds the text is listed');
  body = p.screen('nobodyhere');
  assert.ok(texts(body).includes('No one found'), 'no one matches: the screen says so, as before');
  body = p.screen('');
  assert.ok(texts(body).some((t) => t.startsWith('Search people on Hush by name or username.')), 'the hint under an empty box stays');
});

// ---- the chat list's search ------------------------------------------------------------------------------------------------
test('the search finds a public channel from two characters, by its name or its description, and never one of my own chats', async () => {
  const p = page();
  assert.equal(channels(p.search('')), null); assert.equal(p.asked.length, 0, 'an empty search asks for nothing');
  assert.equal(channels(p.search('z')), null); assert.equal(p.asked.length, 0, 'one character: no channel, and still no request');
  assert.equal(channels(p.search('ze')), null, 'two characters: nothing to show until the listing is in');
  assert.deepEqual(p.asked, [{ p: 'channels', w: ['visibility', '==', 'public'], l: 100 }], 'and the listing is asked for, the request the screen sent before');
  await p.answer();
  assert.equal(p.drawn.n, 1, 'when the listing arrives the list is drawn again');
  assert.deepEqual(channels(p.search('ze')).map((r) => r.name), ['Zebra Gazette', 'Otter Weekly'], 'by name, and by description; my own channel of that name is not repeated here');
  assert.deepEqual(channels(p.search('zebra g')).map((r) => [r.name, r.line]), [['Zebra Gazette', 'Stripes daily']], 'the row: the name, and the description under it');
  assert.deepEqual(channels(p.search('rivers')).map((r) => r.name), ['Otter Weekly'], 'by its description alone');
  assert.deepEqual(channels(p.search('quiet')).map((r) => [r.name, r.line]), [['Quiet Corner', 'Public channel']], 'no description: the kind of channel');
  assert.equal(channels(p.search('my zebra')), null, 'a channel that is among my chats is not listed as one to find');
  assert.equal(channels(p.search('walrus')), null, 'a text no channel holds: no heading');
  assert.equal(channels(p.search('@zebra g')).length, 1, 'a leading @ is dropped, as for people');
});

test('a tap on a found channel opens its preview and joins nothing', async () => {
  const p = page();
  p.search('zebra'); await p.answer();
  const row = channels(p.search('zebra gazette'))[0].row;
  const before = p.asked.length; row.onclick();
  assert.deepEqual(p.opened, ['chat cZEBRA0000001'], 'the chat is opened');
  assert.deepEqual([...p.S.previews.keys()], ['cZEBRA0000001'], 'as a preview, under the address the server listed it at');
  assert.equal(p.S.previews.get('cZEBRA0000001').name, 'Zebra Gazette');
  assert.deepEqual([p.S.convs.map((c) => c.id), p.asked.length - before], [['cMINE00000001'], 0], 'my chats are as they were and nothing was sent: Join channel is on the preview');
});

test('"Nothing found" waits for no channel to match either', async () => {
  const p = page({ convs: [] });
  const empty = (box) => all(box, (e) => e.className === 'empty').map((e) => texts(e).join(' | '));
  assert.deepEqual(empty(p.search('gazette')), ['Nothing found | No chats, messages or people match that.'], 'before the listing is in');
  await p.answer();
  const box = p.search('gazette');
  assert.deepEqual([empty(box), channels(box).map((r) => r.name)], [[], ['Zebra Gazette']], 'a channel matches: no "Nothing found"');
  assert.deepEqual(empty(p.search('walrus')), ['Nothing found | No chats, messages or people match that.'], 'no chat, message, person or channel');
  assert.deepEqual(empty(p.search('z')), ['Nothing found | Keep typing to search people by name or username.'], 'one character: as before');
});

test('the listing is asked for once for a search: not once a key, not once a drawing; again only after a minute', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1e12 });
  const p = page();
  for (const q of ['ze', 'zeb', 'zebr', 'zebra', 'zebra ', 'zebra g']) p.search(q);
  assert.equal(p.asked.length, 1, 'six keys: one request');
  await p.answer();
  for (let i = 0; i < 200; i++) p.search('zebra g');
  assert.equal(p.asked.length, 1, '200 drawings of the list with the search open: still the one request');
  p.search(''); p.search('ot'); p.search('otter');
  assert.equal(p.asked.length, 1, 'the box emptied and another search begun inside the minute: the kept listing answers it');
  assert.deepEqual(channels(p.search('otter')).map((r) => r.name), ['Otter Weekly']);
  t.mock.timers.setTime(1e12 + 59000); p.search('otter');
  assert.equal(p.asked.length, 1, '59 s: kept');
  t.mock.timers.setTime(1e12 + 60001); p.search('otter');
  assert.equal(p.asked.length, 2, 'after a minute the next drawing asks again');
  assert.deepEqual(channels(p.search('otter')).map((r) => r.name), ['Otter Weekly'], 'and shows what it had until the new listing is in');
  for (let i = 0; i < 50; i++) p.search('otter');
  assert.equal(p.asked.length, 2, 'once, however often the list is drawn while that request is on its way');
  await p.answer([channel('cNEW000000001', 'Otter Monthly')]);
  assert.deepEqual(channels(p.search('otter')).map((r) => r.name), ['Otter Monthly'], 'the new listing takes the old one\'s place');
});

test('a listing request that fails shows no channel and is not asked again inside the minute (known and accepted); after it, it is', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1e12 });
  const p = page();
  p.search('zebra'); await p.refuse();
  assert.equal(p.drawn.n, 0, 'nothing arrived: nothing is drawn again');
  assert.equal(channels(p.search('zebra')), null); p.search('zebra g');
  assert.equal(p.asked.length, 1, 'not asked again by the next keys');
  t.mock.timers.setTime(1e12 + 60001); p.search('zebra g');
  assert.equal(p.asked.length, 2, 'asked again after the minute');
  await p.answer();
  assert.deepEqual(channels(p.search('zebra g')).map((r) => r.name), ['Zebra Gazette']);
  // no connection object at all (not signed in to a server yet): nothing is asked, nothing breaks
  const q = page(); q.S.db = null;
  assert.equal(channels(q.search('zebra')), null); assert.equal(q.asked.length, 0);
});

test('the kept listing is one account\'s: after a switch the next account\'s search asks again and is shown nothing of the old one, not even its late answer', async () => {
  const p = page({ convs: [] });
  p.search('zebra'); await p.answer();
  assert.equal(channels(p.search('zebra')).length, 3, 'the first account sees the listing it asked for');
  p.S.me = { handle: 'other' };
  assert.equal(channels(p.search('zebra')), null, 'the next account: nothing of the first one\'s listing');
  assert.equal(p.asked.length, 2, 'and its own request');
  await p.answer([channel('cOTHER0000001', 'Zebra Other')]);
  assert.deepEqual(channels(p.search('zebra')).map((r) => r.name), ['Zebra Other']);
  // a request the first account sent, answered after the switch: not shown to the second, and it draws nothing
  const r = page({ convs: [] });
  r.search('zebra'); r.S.me = { handle: 'other' }; r.search('zebra');
  assert.equal(r.asked.length, 2);
  await r.answer();   // the first account's
  assert.deepEqual([channels(r.search('zebra')), r.drawn.n], [null, 0], 'the old account\'s answer is dropped');
  await r.answer([channel('cOTHER0000001', 'Zebra Other')]);
  assert.deepEqual([channels(r.search('zebra')).map((x) => x.name), r.drawn.n], [['Zebra Other'], 1]);
});

test('the listing is drawn again only into a search that is still open on the Chats tab', async () => {
  const p = page();
  p.search('zebra'); p.S.query = ''; await p.answer();
  assert.equal(p.drawn.n, 0, 'the search was closed before the listing came: no drawing');
  const q = page(); q.search('zebra'); q.S.tab = 'calls'; await q.answer();
  assert.equal(q.drawn.n, 0, 'another tab: no drawing');
});

test('a record that names another address inside itself is listed under the address the server gave it (chatRec), and only channels are listed', async () => {
  const p = page({ convs: [] });
  p.search('zebra');
  await p.answer([{ id: 'cREAL00000001', d: { type: 'channel', visibility: 'public', name: 'Zebra Planted', id: 'cZEBRA0000001' } }, { id: 'gGROUP0000001', d: { type: 'group', visibility: 'public', name: 'Zebra Group' } }]);
  const rows = channels(p.search('zebra'));
  assert.deepEqual(rows.map((r) => r.name), ['Zebra Planted'], 'a group marked public is not listed');
  rows[0].row.onclick();
  assert.deepEqual([p.opened, [...p.S.previews.keys()]], [['chat cREAL00000001'], ['cREAL00000001']], 'opened under its own address, not the one planted in the record');
});

test('the lines as written: the screen holds no listing and no channel row; the search holds the one request', () => {
  const screen = lift('function openNewChat(){', '\nasync function openDm('), search = SEARCH();
  assert.ok(!/visibility|Public channels|pubs|chatRec|megaSm/.test(screen), 'New message: no listing request, no heading, no channel row');
  assert.equal(UI.split("where('visibility','==','public')").length - 1, 1, 'the listing is asked for at one place in app/ui.js');
  assert.ok(search.includes("S.db.collection('channels').where('visibility','==','public').limit(100).get()"), 'and that place is the search');
  assert.equal(UI.split("'Public channels'").length - 1, 1, 'the heading "Public channels" is written once, in the search');
  assert.match(search, /q\.length<2\?\[\]:pubChans\(\)\.filter\(/, 'channels from two characters, as people');
});

test('every listed channel that matches is drawn, more than thirty too: a cut at thirty in the server\'s order (by id, and a channel\'s maker picks its id) would let thirty channels hide the rest of a name', async () => {
  const p = page({ convs: [] });
  p.search('zz');
  await p.answer(Array.from({ length: 100 }, (_, i) => channel('cMANY' + String(i).padStart(8, '0'), 'Zz channel ' + i)));
  const rows = channels(p.search('zz'));
  assert.equal(rows.length, 100, 'all hundred that match, as New message drew them until this release');
  assert.deepEqual([rows[0].name, rows[99].name], ['Zz channel 0', 'Zz channel 99'], 'in the order the server listed them');
  assert.deepEqual(channels(p.search('zz channel 77')).map((r) => r.name), ['Zz channel 77'], 'a longer text narrows it');
  assert.ok(!SEARCH().includes('.slice(0,30); // public channels'), 'no cut after the filter');

});
